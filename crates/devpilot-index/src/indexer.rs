//! Symbol indexer — walks source trees, parses with tree-sitter, extracts symbols.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use dashmap::DashMap;
use ignore::WalkBuilder;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use tree_sitter::{Node, Parser};

use crate::error::IndexResult;
use crate::language::LanguageId;
use crate::search::SearchResult;
use crate::symbol::{CodeSymbol, SymbolKind};

/// Configuration for the symbol indexer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexConfig {
    /// File extensions to include (empty = all supported).
    pub extensions: Vec<String>,
    /// Maximum file size to parse (bytes). Default 1 MB.
    pub max_file_size: u64,
    /// Number of parallel workers. Default 4.
    pub workers: usize,
    /// Directories to skip.
    pub ignore_dirs: Vec<String>,
}

impl Default for IndexConfig {
    fn default() -> Self {
        Self {
            extensions: Vec::new(),
            max_file_size: 1_048_576,
            workers: 4,
            ignore_dirs: vec![
                "node_modules".into(),
                "target".into(),
                ".git".into(),
                "dist".into(),
                "build".into(),
                ".next".into(),
                "vendor".into(),
            ],
        }
    }
}

/// Statistics about the index.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IndexStats {
    /// Total number of indexed files.
    pub files_indexed: u64,
    /// Total number of extracted symbols.
    pub symbols_count: u64,
    /// Number of files that failed to parse.
    pub parse_errors: u64,
    /// Time spent indexing in milliseconds.
    pub index_time_ms: u64,
    /// Root directory that was indexed.
    pub root: String,
}

/// Thread-safe symbol index with fuzzy search.
pub struct SymbolIndex {
    symbols: Arc<DashMap<String, CodeSymbol>>,
    config: IndexConfig,
    stats: Arc<RwLock<IndexStats>>,
}

impl SymbolIndex {
    /// Create a new empty index.
    pub fn new(config: IndexConfig) -> Self {
        Self {
            symbols: Arc::new(DashMap::new()),
            config,
            stats: Arc::new(RwLock::new(IndexStats::default())),
        }
    }

    /// Index all supported source files under a directory.
    pub async fn index_directory(&self, root: &Path) -> IndexResult<()> {
        let start = std::time::Instant::now();
        let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());

        let files = self.collect_source_files(&root)?;

        let parsed: Vec<Vec<CodeSymbol>> = files
            .par_iter()
            .flat_map(|path| match self.parse_file(path) {
                Ok(syms) => {
                    debug!("Indexed {} symbols from {:?}", syms.len(), path);
                    syms.into_iter().map(|s| vec![s]).collect()
                }
                Err(e) => {
                    warn!("Failed to parse {:?}: {}", path, e);
                    vec![vec![]]
                }
            })
            .collect();

        let mut total_symbols = 0u64;
        let parse_errors = 0u64;
        let mut files_indexed = 0u64;

        for file_syms in &parsed {
            files_indexed += 1;
            if file_syms.is_empty() {
                // Could be a file with no extractable symbols, not necessarily an error
            }
            for sym in file_syms {
                let key = format!("{}:{}:{}", sym.file_path, sym.line, sym.column);
                self.symbols.insert(key, sym.clone());
                total_symbols += 1;
            }
        }

        let elapsed = start.elapsed();
        let mut stats = self.stats.write().await;
        stats.files_indexed = files_indexed;
        stats.symbols_count = total_symbols;
        stats.parse_errors = parse_errors;
        stats.index_time_ms = elapsed.as_millis() as u64;
        stats.root = root.to_string_lossy().to_string();

        info!(
            "Indexed {} files, {} symbols in {}ms",
            files_indexed, total_symbols, stats.index_time_ms
        );

        Ok(())
    }

    /// Index a single file.
    pub fn parse_file(&self, path: &Path) -> IndexResult<Vec<CodeSymbol>> {
        let lang = LanguageId::from_path(path);
        if !lang.is_supported() {
            return Ok(Vec::new());
        }

        let source = std::fs::read_to_string(path)?;
        let metadata = std::fs::metadata(path)?;
        if metadata.len() > self.config.max_file_size {
            return Ok(Vec::new());
        }

        let mut parser = Parser::new();
        match lang {
            LanguageId::Rust => {
                parser.set_language(&tree_sitter_rust::LANGUAGE.into())?;
            }
            LanguageId::TypeScript | LanguageId::Tsx => {
                parser.set_language(&tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())?;
            }
            LanguageId::JavaScript | LanguageId::Jsx => {
                parser.set_language(&tree_sitter_javascript::LANGUAGE.into())?;
            }
            LanguageId::Python => {
                parser.set_language(&tree_sitter_python::LANGUAGE.into())?;
            }
            _ => return Ok(Vec::new()),
        }

        let tree =
            parser
                .parse(&source, None)
                .ok_or_else(|| crate::error::IndexError::ParseError {
                    path: path.to_string_lossy().to_string(),
                    msg: "tree-sitter parse returned None".into(),
                })?;

        Ok(self.extract_symbols(&tree.root_node(), &source, path, &lang))
    }

    /// Search for symbols matching a query.
    pub async fn search(&self, query: &str) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for entry in self.symbols.iter() {
            let sym = entry.value();
            let name_lower = sym.name.to_lowercase();
            let (score, reason) = if name_lower == query_lower {
                (1.0, crate::search::MatchReason::ExactName)
            } else if name_lower.starts_with(&query_lower) {
                (0.85, crate::search::MatchReason::Prefix)
            } else if name_lower.contains(&query_lower) {
                (0.7, crate::search::MatchReason::Substring)
            } else if Self::fuzzy_match(&query_lower, &name_lower) {
                (0.5, crate::search::MatchReason::Fuzzy)
            } else if sym.full_path.to_lowercase().contains(&query_lower) {
                (0.4, crate::search::MatchReason::PathMatch)
            } else {
                continue;
            };

            results.push(SearchResult {
                symbol: sym.clone(),
                score,
                match_reason: reason,
            });
        }

        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(50);
        results
    }

    /// Get index statistics.
    pub async fn stats(&self) -> IndexStats {
        self.stats.read().await.clone()
    }

    /// Clear the index.
    pub async fn clear(&self) {
        self.symbols.clear();
        let mut stats = self.stats.write().await;
        *stats = IndexStats::default();
    }

    /// Get all symbols.
    pub fn all_symbols(&self) -> Vec<CodeSymbol> {
        self.symbols.iter().map(|e| e.value().clone()).collect()
    }

    // -- Private helpers --

    fn collect_source_files(&self, root: &Path) -> IndexResult<Vec<PathBuf>> {
        let mut builder = WalkBuilder::new(root);
        builder
            .hidden(false)
            .git_ignore(true)
            .git_exclude(true)
            .max_filesize(Some(self.config.max_file_size));

        for dir in &self.config.ignore_dirs {
            builder.add_custom_ignore_filename(dir);
        }

        let mut files = Vec::new();
        for entry in builder.build().flatten() {
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                let path = entry.into_path();
                let lang = LanguageId::from_path(&path);
                if lang.is_supported() {
                    if self.config.extensions.is_empty()
                        || path.extension().map_or(false, |ext| {
                            self.config
                                .extensions
                                .iter()
                                .any(|e| e == ext.to_string_lossy().as_ref())
                        })
                    {
                        files.push(path);
                    }
                }
            }
        }

        Ok(files)
    }

    fn extract_symbols(
        &self,
        node: &Node,
        source: &str,
        file_path: &Path,
        lang: &LanguageId,
    ) -> Vec<CodeSymbol> {
        let mut symbols = Vec::new();
        self.walk_node(node, source, file_path, lang, &mut symbols, None);
        symbols
    }

    fn walk_node(
        &self,
        node: &Node,
        source: &str,
        file_path: &Path,
        lang: &LanguageId,
        symbols: &mut Vec<CodeSymbol>,
        container: Option<&str>,
    ) {
        let kind = node.kind();
        let (sym_kind, name_node) = match kind {
            // Rust
            "function_item" | "function_signature_item" => {
                (Some(SymbolKind::Function), node.child_by_field_name("name"))
            }
            "struct_item" => (Some(SymbolKind::Struct), node.child_by_field_name("name")),
            "enum_item" => (Some(SymbolKind::Enum), node.child_by_field_name("name")),
            "enum_variant" => (
                Some(SymbolKind::EnumVariant),
                node.child_by_field_name("name"),
            ),
            "trait_item" => (Some(SymbolKind::Trait), node.child_by_field_name("name")),
            "impl_item" => (Some(SymbolKind::Impl), node.child_by_field_name("trait")),
            "type_item" => (
                Some(SymbolKind::TypeAlias),
                node.child_by_field_name("name"),
            ),
            "const_item" => (Some(SymbolKind::Const), node.child_by_field_name("name")),
            "static_item" => (Some(SymbolKind::Static), node.child_by_field_name("name")),
            "mod_item" => (Some(SymbolKind::Module), node.child_by_field_name("name")),
            "macro_definition" => (Some(SymbolKind::Macro), node.child_by_field_name("name")),
            "let_declaration" => (Some(SymbolKind::Variable), node.child_by_field_name("name")),
            // TypeScript/JavaScript
            "function_declaration" | "generator_function_declaration" => {
                (Some(SymbolKind::Function), node.child_by_field_name("name"))
            }
            "class_declaration" => (Some(SymbolKind::Class), node.child_by_field_name("name")),
            "interface_declaration" => (
                Some(SymbolKind::Interface),
                node.child_by_field_name("name"),
            ),
            "enum_declaration" => (Some(SymbolKind::Enum), node.child_by_field_name("name")),
            "type_alias_declaration" => (
                Some(SymbolKind::TypeAlias),
                node.child_by_field_name("name"),
            ),
            "method_definition" | "public_field_definition" | "field_definition" => {
                let is_method = kind == "method_definition";
                (
                    Some(if is_method {
                        SymbolKind::Method
                    } else {
                        SymbolKind::Field
                    }),
                    node.child_by_field_name("name"),
                )
            }
            "variable_declarator" => (Some(SymbolKind::Variable), node.child_by_field_name("name")),
            // Python
            "function_definition" => (Some(SymbolKind::Function), node.child_by_field_name("name")),
            "class_definition" => (Some(SymbolKind::Class), node.child_by_field_name("name")),
            // Go
            "method_declaration" if *lang == LanguageId::Go => {
                (Some(SymbolKind::Method), node.child_by_field_name("name"))
            }
            "type_declaration" if *lang == LanguageId::Go => {
                (Some(SymbolKind::Struct), node.child_by_field_name("name"))
            }
            _ => (None, None),
        };

        if let (Some(sk), Some(nn)) = (sym_kind, name_node) {
            let name = nn.utf8_text(source.as_bytes()).unwrap_or("").to_string();
            if !name.is_empty() {
                let fp = file_path.to_string_lossy().to_string();
                let doc_summary = self.extract_doc_comment(node, source);
                symbols.push(CodeSymbol {
                    name,
                    kind: sk,
                    full_path: fp.clone(),
                    language: *lang,
                    file_path: fp,
                    line: node.start_position().row as u32 + 1,
                    column: node.start_position().column as u32 + 1,
                    container: container.map(|c| c.to_string()),
                    doc_summary,
                });
            }
        }

        // Recurse into children
        let child_count = node.child_count();
        let new_container = name_node
            .as_ref()
            .and_then(|nn| nn.utf8_text(source.as_bytes()).ok().map(|s| s.to_string()));

        for i in 0..child_count {
            let child = node.child(i).unwrap();
            self.walk_node(
                &child,
                source,
                file_path,
                lang,
                symbols,
                new_container.as_deref().or(container),
            );
        }
    }

    fn extract_doc_comment(&self, node: &Node, source: &str) -> Option<String> {
        // Look for a preceding comment sibling
        let mut prev = node.prev_named_sibling();
        while let Some(sibling) = prev {
            let kind = sibling.kind();
            if kind == "line_comment" || kind == "block_comment" || kind == "comment" {
                let text = sibling.utf8_text(source.as_bytes()).ok()?;
                let cleaned = text
                    .trim_start_matches('/')
                    .trim_start_matches('*')
                    .trim_start_matches('#')
                    .trim()
                    .trim_start_matches(' ')
                    .to_string();
                if !cleaned.is_empty() {
                    return Some(cleaned);
                }
            }
            if !kind.contains("comment") {
                break;
            }
            prev = sibling.prev_named_sibling();
        }
        None
    }

    /// Simple fuzzy match: check if all chars of query appear in text in order.
    fn fuzzy_match(query: &str, text: &str) -> bool {
        let mut qi = query.chars().peekable();
        for tc in text.chars() {
            if qi.peek() == Some(&tc) {
                qi.next();
            }
        }
        qi.peek().is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_index_config_default() {
        let config = IndexConfig::default();
        assert_eq!(config.max_file_size, 1_048_576);
        assert_eq!(config.workers, 4);
        assert!(config.ignore_dirs.contains(&"node_modules".to_string()));
    }

    #[test]
    fn test_fuzzy_match() {
        assert!(SymbolIndex::fuzzy_match("fn", "function"));
        assert!(SymbolIndex::fuzzy_match("handler", "handler"));
        assert!(SymbolIndex::fuzzy_match("hdl", "handler"));
        assert!(!SymbolIndex::fuzzy_match("xyz", "handler"));
    }

    #[tokio::test]
    async fn test_index_and_search() {
        let index = SymbolIndex::new(IndexConfig::default());
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("crates/devpilot-protocol/src");

        if root.exists() {
            index.index_directory(&root).await.unwrap();
            let stats = index.stats().await;
            assert!(stats.files_indexed > 0);
            assert!(stats.symbols_count > 0);

            let results = index.search("Provider").await;
            assert!(!results.is_empty());
        }
    }

    #[tokio::test]
    async fn test_clear() {
        let index = SymbolIndex::new(IndexConfig::default());
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("crates/devpilot-protocol/src");

        if root.exists() {
            index.index_directory(&root).await.unwrap();
            index.clear().await;
            let stats = index.stats().await;
            assert_eq!(stats.symbols_count, 0);
        }
    }
}
