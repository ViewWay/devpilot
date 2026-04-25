//! Symbol indexer — walks directories, parses source files, extracts symbols.
//!
//! The `SymbolIndex` is the main entry point for indexing source code. It walks
//! a directory tree, detects languages from file extensions, parses each file
//! to extract code symbols (functions, structs, enums, etc.), and stores them
//! in memory for fast fuzzy search.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use dashmap::DashMap;
use ignore::WalkBuilder;
use rayon::prelude::*;
use tracing::{debug, info, warn};

use crate::error::{IndexError, IndexResult};
use crate::language::LanguageId;
use crate::search::SearchResult;
use crate::symbol::{CodeSymbol, SymbolKind};

// ---------------------------------------------------------------------------
// IndexConfig
// ---------------------------------------------------------------------------

/// Configuration for the symbol indexer.
#[derive(Debug, Clone)]
pub struct IndexConfig {
    /// Maximum file size to parse (bytes). Files larger than this are skipped.
    pub max_file_size: u64,
    /// Number of parallel indexing threads. 0 = use all available cores.
    pub parallelism: usize,
    /// File/directory patterns to ignore (gitignore-style).
    pub ignore_patterns: Vec<String>,
    /// Whether to follow symbolic links.
    pub follow_links: bool,
    /// Maximum directory depth to recurse. 0 = unlimited.
    pub max_depth: usize,
}

impl Default for IndexConfig {
    fn default() -> Self {
        Self {
            max_file_size: 1_000_000, // 1 MB
            parallelism: 0,
            ignore_patterns: vec![
                "node_modules/".into(),
                "target/".into(),
                ".git/".into(),
                "dist/".into(),
                "build/".into(),
                "__pycache__/".into(),
                ".next/".into(),
                ".nuxt/".into(),
                "vendor/".into(),
            ],
            follow_links: false,
            max_depth: 20,
        }
    }
}

// ---------------------------------------------------------------------------
// IndexStats
// ---------------------------------------------------------------------------

/// Statistics about the indexed codebase.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct IndexStats {
    /// Total number of files indexed.
    pub files_indexed: u64,
    /// Total number of files skipped (too large, unsupported language, etc.).
    pub files_skipped: u64,
    /// Total number of symbols extracted.
    pub symbols_count: u64,
    /// Number of distinct languages found.
    pub languages: Vec<String>,
    /// Wall-clock time spent indexing (ms).
    pub index_time_ms: u64,
    /// Total bytes of source code parsed.
    pub total_bytes: u64,
}

// ---------------------------------------------------------------------------
// ParsedFile
// ---------------------------------------------------------------------------

/// Intermediate result from parsing a single file.
struct ParsedFile {
    path: PathBuf,
    language: LanguageId,
    symbols: Vec<CodeSymbol>,
    size_bytes: u64,
}

// ---------------------------------------------------------------------------
// SymbolIndex
// ---------------------------------------------------------------------------

/// The main symbol index. Thread-safe and designed for incremental updates.
///
/// ```ignore
/// use devpilot_index::{SymbolIndex, IndexConfig};
///
/// let index = SymbolIndex::new(IndexConfig::default());
/// index.index_directory("./src").await.unwrap();
/// let results = index.search("handler").await;
/// ```
pub struct SymbolIndex {
    config: IndexConfig,
    /// Map from file path → symbols in that file.
    file_symbols: Arc<DashMap<PathBuf, Vec<CodeSymbol>>>,
    /// Flat list of all symbols for searching.
    all_symbols: Arc<DashMap<String, CodeSymbol>>,
    /// Current stats.
    stats: Arc<std::sync::Mutex<IndexStats>>,
}

impl SymbolIndex {
    /// Create a new empty index with the given configuration.
    pub fn new(config: IndexConfig) -> Self {
        Self {
            config,
            file_symbols: Arc::new(DashMap::new()),
            all_symbols: Arc::new(DashMap::new()),
            stats: Arc::new(std::sync::Mutex::new(IndexStats::default())),
        }
    }

    /// Create with default configuration.
    pub fn with_defaults() -> Self {
        Self::new(IndexConfig::default())
    }

    /// Index all supported source files in a directory.
    pub fn index_directory(&self, root: &Path) -> IndexResult<()> {
        let start = std::time::Instant::now();

        let root = root.canonicalize().map_err(IndexError::Io)?;
        info!("Indexing directory: {}", root.display());

        // Collect files to index
        let files = self.collect_files(&root)?;
        debug!("Found {} files to index", files.len());

        // Parse files in parallel
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(if self.config.parallelism == 0 {
                std::thread::available_parallelism()
                    .map(|n| n.get().min(8))
                    .unwrap_or(4)
            } else {
                self.config.parallelism
            })
            .build()
            .map_err(|e| IndexError::ParseError {
                path: "thread_pool".into(),
                msg: e.to_string(),
            })?;

        let parsed: Vec<ParsedFile> = pool.install(|| {
            files
                .par_iter()
                .filter_map(|path| self.parse_file(path).ok())
                .collect()
        });

        // Merge into index
        let mut files_indexed = 0u64;
        let files_skipped = 0u64;
        let mut symbols_count = 0u64;
        let mut total_bytes = 0u64;
        let mut languages = std::collections::HashSet::new();

        for pf in parsed {
            files_indexed += 1;
            total_bytes += pf.size_bytes;
            languages.insert(pf.language.to_string());

            // Remove old symbols for this file if re-indexing
            if let Some((_, old)) = self.file_symbols.remove(&pf.path) {
                for sym in old {
                    let key = symbol_key(&sym);
                    self.all_symbols.remove(&key);
                }
            }

            // Insert new symbols
            let symbols = pf.symbols;
            symbols_count += symbols.len() as u64;

            for sym in &symbols {
                let key = symbol_key(sym);
                self.all_symbols.insert(key, sym.clone());
            }

            self.file_symbols.insert(pf.path, symbols);
        }

        let elapsed = start.elapsed();

        // Update stats
        {
            let mut stats = self.stats.lock().unwrap();
            stats.files_indexed = files_indexed;
            stats.files_skipped = files_skipped;
            stats.symbols_count = symbols_count;
            stats.languages = languages.into_iter().collect();
            stats.index_time_ms = elapsed.as_millis() as u64;
            stats.total_bytes = total_bytes;
        }

        info!(
            "Indexed {} files, {} symbols in {}ms",
            files_indexed,
            symbols_count,
            elapsed.as_millis()
        );

        Ok(())
    }

    /// Search for symbols matching the given query.
    ///
    /// Uses fuzzy matching on symbol names and full paths.
    /// Returns results sorted by relevance (best first).
    pub fn search(&self, query: &str) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for entry in self.all_symbols.iter() {
            let sym = entry.value();
            let (score, reason) = self.match_symbol(&query_lower, sym);

            if score > 0.0 {
                results.push(SearchResult {
                    symbol: sym.clone(),
                    score,
                    match_reason: reason,
                });
            }
        }

        // Sort by score descending
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(50); // Cap results
        results
    }

    /// Remove all symbols for a given file from the index.
    pub fn remove_file(&self, path: &Path) {
        // Try to canonicalize so it matches the stored key
        let lookup = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        if let Some((_, old)) = self.file_symbols.remove(&lookup) {
            for sym in old {
                let key = symbol_key(&sym);
                self.all_symbols.remove(&key);
            }
        }
    }

    /// Clear the entire index.
    pub fn clear(&self) {
        self.file_symbols.clear();
        self.all_symbols.clear();
        let mut stats = self.stats.lock().unwrap();
        *stats = IndexStats::default();
    }

    /// Get current index statistics.
    pub fn stats(&self) -> IndexStats {
        self.stats.lock().unwrap().clone()
    }

    /// Get all symbols in the index.
    pub fn all_symbols(&self) -> Vec<CodeSymbol> {
        self.all_symbols.iter().map(|e| e.value().clone()).collect()
    }

    /// Get symbols for a specific file.
    pub fn file_symbols(&self, path: &Path) -> Option<Vec<CodeSymbol>> {
        self.file_symbols.get(path).map(|e| e.value().clone())
    }

    /// Number of files indexed.
    pub fn file_count(&self) -> usize {
        self.file_symbols.len()
    }

    /// Number of symbols indexed.
    pub fn symbol_count(&self) -> usize {
        self.all_symbols.len()
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Collect source files from a directory using ignore crate.
    fn collect_files(&self, root: &Path) -> IndexResult<Vec<PathBuf>> {
        let mut files = Vec::new();

        let mut builder = WalkBuilder::new(root);
        builder
            .hidden(true)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .follow_links(self.config.follow_links)
            .max_depth(if self.config.max_depth == 0 {
                None
            } else {
                Some(self.config.max_depth)
            });

        // Add custom ignore patterns using overrides (more reliable than add_ignore)
        if !self.config.ignore_patterns.is_empty() {
            let mut overrides = ignore::overrides::OverrideBuilder::new(root);
            for pattern in &self.config.ignore_patterns {
                // Use glob pattern: !<name> means exclude this path
                let glob_pattern = format!("!**/{}", pattern.trim_end_matches('/'));
                if let Err(e) = overrides.add(&glob_pattern) {
                    warn!("Invalid ignore pattern '{}': {}", glob_pattern, e);
                }
            }
            if let Ok(built) = overrides.build() {
                builder.overrides(built);
            }
        }

        for result in builder.build() {
            match result {
                Ok(entry) => {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }

                    let lang = LanguageId::from_path(path);
                    if !lang.is_supported() {
                        continue;
                    }

                    // Check file size
                    if let Ok(metadata) = std::fs::metadata(path)
                        && metadata.len() > self.config.max_file_size
                    {
                        continue;
                    }

                    files.push(path.to_path_buf());
                }
                Err(err) => {
                    warn!("Walk error: {}", err);
                }
            }
        }

        Ok(files)
    }

    /// Parse a single source file and extract symbols.
    fn parse_file(&self, path: &Path) -> IndexResult<ParsedFile> {
        let language = LanguageId::from_path(path);
        let content = std::fs::read_to_string(path).map_err(IndexError::Io)?;
        let size_bytes = content.len() as u64;

        let symbols = self.extract_symbols(path, &content, language)?;

        Ok(ParsedFile {
            path: path.to_path_buf(),
            language,
            symbols,
            size_bytes,
        })
    }

    /// Extract symbols from source code using regex-based heuristics.
    ///
    /// NOTE: This is a simplified extraction that uses regex patterns
    /// rather than tree-sitter for initial implementation. Tree-sitter
    /// integration can be added incrementally for each language.
    fn extract_symbols(
        &self,
        path: &Path,
        content: &str,
        language: LanguageId,
    ) -> IndexResult<Vec<CodeSymbol>> {
        let file_path = path.display().to_string();
        let mut symbols = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            let line_num = line_num as u32 + 1; // 1-based
            let trimmed = line.trim();

            if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
                continue;
            }

            match language {
                LanguageId::Rust => {
                    self.extract_rust_symbol(&file_path, language, line_num, trimmed, &mut symbols);
                }
                LanguageId::TypeScript
                | LanguageId::Tsx
                | LanguageId::JavaScript
                | LanguageId::Jsx => {
                    self.extract_ts_symbol(&file_path, language, line_num, trimmed, &mut symbols);
                }
                LanguageId::Python => {
                    self.extract_python_symbol(
                        &file_path,
                        language,
                        line_num,
                        trimmed,
                        &mut symbols,
                    );
                }
                LanguageId::Go => {
                    self.extract_go_symbol(&file_path, language, line_num, trimmed, &mut symbols);
                }
                _ => {
                    // Basic pattern for other languages
                    self.extract_generic_symbol(
                        &file_path,
                        language,
                        line_num,
                        trimmed,
                        &mut symbols,
                    );
                }
            }
        }

        Ok(symbols)
    }

    fn extract_rust_symbol(
        &self,
        file_path: &str,
        language: LanguageId,
        line: u32,
        trimmed: &str,
        symbols: &mut Vec<CodeSymbol>,
    ) {
        // fn name
        if let Some(rest) = trimmed
            .strip_prefix("pub async fn ")
            .or_else(|| trimmed.strip_prefix("pub fn "))
            .or_else(|| trimmed.strip_prefix("async fn "))
            .or_else(|| trimmed.strip_prefix("fn "))
            && let Some(raw_name) = rest.split('(').next()
        {
            let name = raw_name.trim().trim_start_matches('<');
            if !name.is_empty() && !name.starts_with('|') {
                symbols.push(CodeSymbol {
                    name: name.to_string(),
                    kind: SymbolKind::Function,
                    full_path: format!("{file_path}::{name}"),
                    language,
                    file_path: file_path.to_string(),
                    line,
                    column: 0,
                    container: None,
                    doc_summary: None,
                });
            }
        }

        // struct / enum / trait / impl
        for (prefix, kind) in [
            ("pub struct ", SymbolKind::Struct),
            ("pub(crate) struct ", SymbolKind::Struct),
            ("struct ", SymbolKind::Struct),
            ("pub enum ", SymbolKind::Enum),
            ("pub(crate) enum ", SymbolKind::Enum),
            ("enum ", SymbolKind::Enum),
            ("pub trait ", SymbolKind::Trait),
            ("trait ", SymbolKind::Trait),
            ("pub const ", SymbolKind::Const),
            ("const ", SymbolKind::Const),
            ("pub static ", SymbolKind::Static),
            ("static ", SymbolKind::Static),
            ("type ", SymbolKind::TypeAlias),
            ("pub type ", SymbolKind::TypeAlias),
            ("macro_rules! ", SymbolKind::Macro),
        ] {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                let name = rest
                    .split('<')
                    .next()
                    .unwrap_or(rest)
                    .split('{')
                    .next()
                    .unwrap_or(rest)
                    .split('(')
                    .next()
                    .unwrap_or(rest)
                    .split(':')
                    .next()
                    .unwrap_or(rest)
                    .trim();
                if !name.is_empty() && !name.starts_with('{') {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind,
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                    break;
                }
            }
        }

        // impl blocks
        if trimmed.starts_with("impl")
            && let Some(rest) = trimmed
                .strip_prefix("impl ")
                .or_else(|| trimmed.strip_prefix("impl<"))
        {
            let target = rest
                .split('{')
                .next()
                .unwrap_or(rest)
                .split(" for ")
                .last()
                .unwrap_or(rest)
                .split('<')
                .next()
                .unwrap_or(rest)
                .trim()
                .trim_start_matches('>')
                .to_string();
            if !target.is_empty() && target != "{" {
                symbols.push(CodeSymbol {
                    name: format!("impl {target}"),
                    kind: SymbolKind::Impl,
                    full_path: format!("{file_path}::impl::{target}"),
                    language,
                    file_path: file_path.to_string(),
                    line,
                    column: 0,
                    container: Some(target),
                    doc_summary: None,
                });
            }
        }
    }

    fn extract_ts_symbol(
        &self,
        file_path: &str,
        language: LanguageId,
        line: u32,
        trimmed: &str,
        symbols: &mut Vec<CodeSymbol>,
    ) {
        // function name() / const name = () => / export function / export default function
        let func_patterns = [
            ("export async function ", SymbolKind::Function),
            ("export function ", SymbolKind::Function),
            ("async function ", SymbolKind::Function),
            ("function ", SymbolKind::Function),
        ];
        for (prefix, kind) in &func_patterns {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                if let Some(name) = rest.split('(').next() {
                    let name = name.trim();
                    if !name.is_empty() {
                        symbols.push(CodeSymbol {
                            name: name.to_string(),
                            kind: *kind,
                            full_path: format!("{file_path}::{name}"),
                            language,
                            file_path: file_path.to_string(),
                            line,
                            column: 0,
                            container: None,
                            doc_summary: None,
                        });
                    }
                }
                return;
            }
        }

        // const name = / let name = / var name =
        for kw in &["const ", "let ", "var "] {
            if let Some(rest) = trimmed.strip_prefix(kw).or_else(|| {
                if trimmed.starts_with("export ") {
                    trimmed
                        .strip_prefix("export ")
                        .and_then(|r| r.strip_prefix(kw))
                } else {
                    None
                }
            }) {
                if let Some(name) = rest.split('=').next() {
                    let name = name.trim();
                    // Arrow function: const name = () =>
                    if rest.contains("=>")
                        && !name.is_empty() {
                            symbols.push(CodeSymbol {
                                name: name.to_string(),
                                kind: SymbolKind::Function,
                                full_path: format!("{file_path}::{name}"),
                                language,
                                file_path: file_path.to_string(),
                                line,
                                column: 0,
                                container: None,
                                doc_summary: None,
                            });
                        }
                }
                return;
            }
        }

        // class / interface / type / enum
        let type_patterns = [
            ("export class ", SymbolKind::Class),
            ("export default class ", SymbolKind::Class),
            ("export abstract class ", SymbolKind::Class),
            ("abstract class ", SymbolKind::Class),
            ("class ", SymbolKind::Class),
            ("export interface ", SymbolKind::Interface),
            ("interface ", SymbolKind::Interface),
            ("export type ", SymbolKind::TypeAlias),
            ("type ", SymbolKind::TypeAlias),
            ("export enum ", SymbolKind::Enum),
            ("enum ", SymbolKind::Enum),
        ];
        for (prefix, kind) in &type_patterns {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                let name = rest
                    .split('<')
                    .next()
                    .unwrap_or(rest)
                    .split('{')
                    .next()
                    .unwrap_or(rest)
                    .split('=')
                    .next()
                    .unwrap_or(rest)
                    .trim();
                if !name.is_empty() {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind: *kind,
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                }
                return;
            }
        }
    }

    fn extract_python_symbol(
        &self,
        file_path: &str,
        language: LanguageId,
        line: u32,
        trimmed: &str,
        symbols: &mut Vec<CodeSymbol>,
    ) {
        // def name / async def / class name
        if let Some(rest) = trimmed
            .strip_prefix("def ")
            .or_else(|| trimmed.strip_prefix("async def "))
        {
            if let Some(name) = rest.split('(').next() {
                let name = name.trim();
                if !name.is_empty() {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind: SymbolKind::Function,
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                }
            }
        } else if let Some(rest) = trimmed.strip_prefix("class ") {
            let name = rest
                .split('(')
                .next()
                .unwrap_or(rest)
                .split(':')
                .next()
                .unwrap_or(rest)
                .trim();
            if !name.is_empty() {
                symbols.push(CodeSymbol {
                    name: name.to_string(),
                    kind: SymbolKind::Class,
                    full_path: format!("{file_path}::{name}"),
                    language,
                    file_path: file_path.to_string(),
                    line,
                    column: 0,
                    container: None,
                    doc_summary: None,
                });
            }
        }
    }

    fn extract_go_symbol(
        &self,
        file_path: &str,
        language: LanguageId,
        line: u32,
        trimmed: &str,
        symbols: &mut Vec<CodeSymbol>,
    ) {
        // func name / func (recv) Name
        if let Some(rest) = trimmed.strip_prefix("func ") {
            // Check for method: func (r *Receiver) Name()
            if rest.starts_with('(') {
                // Method
                if let Some(after_paren) = rest.split(')').nth(1)
                    && let Some(raw_name) = after_paren.trim().split('(').next()
                {
                    let name = raw_name.trim();
                    if !name.is_empty() {
                        symbols.push(CodeSymbol {
                            name: name.to_string(),
                            kind: SymbolKind::Method,
                            full_path: format!("{file_path}::{name}"),
                            language,
                            file_path: file_path.to_string(),
                            line,
                            column: 0,
                            container: None,
                            doc_summary: None,
                        });
                    }
                }
            } else if let Some(name) = rest.split('(').next() {
                let name = name.trim();
                if !name.is_empty() {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind: SymbolKind::Function,
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                }
            }
        }

        // type Name struct / type Name interface
        if let Some(rest) = trimmed.strip_prefix("type ") {
            let parts: Vec<&str> = rest.splitn(2, ' ').collect();
            if parts.len() >= 2 {
                let name = parts[0].trim();
                let kind = if parts[1].starts_with("struct") {
                    SymbolKind::Struct
                } else if parts[1].starts_with("interface") {
                    SymbolKind::Interface
                } else {
                    SymbolKind::TypeAlias
                };
                if !name.is_empty() {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind,
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                }
            }
        }

        // var / const
        for prefix in &["var ", "const "] {
            if let Some(rest) = trimmed.strip_prefix(prefix)
                && let Some(raw_name) =
                    rest.split('=').next().or_else(|| rest.split(' ').next())
            {
                let name = raw_name.trim();
                if !name.is_empty() && !name.starts_with('(') {
                    symbols.push(CodeSymbol {
                        name: name.to_string(),
                        kind: if *prefix == "var " {
                            SymbolKind::Variable
                        } else {
                            SymbolKind::Const
                        },
                        full_path: format!("{file_path}::{name}"),
                        language,
                        file_path: file_path.to_string(),
                        line,
                        column: 0,
                        container: None,
                        doc_summary: None,
                    });
                }
            }
        }
    }

    fn extract_generic_symbol(
        &self,
        file_path: &str,
        language: LanguageId,
        line: u32,
        trimmed: &str,
        symbols: &mut Vec<CodeSymbol>,
    ) {
        // Very generic: look for common patterns
        for prefix in &[
            "function ",
            "class ",
            "def ",
            "fn ",
            "pub fn ",
            "export function ",
        ] {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                if let Some(name) = rest.split('(').next().or_else(|| rest.split('{').next()) {
                    let name = name.trim();
                    if !name.is_empty() {
                        symbols.push(CodeSymbol {
                            name: name.to_string(),
                            kind: SymbolKind::Unknown,
                            full_path: format!("{file_path}::{name}"),
                            language,
                            file_path: file_path.to_string(),
                            line,
                            column: 0,
                            container: None,
                            doc_summary: None,
                        });
                    }
                }
                return;
            }
        }
    }

    /// Calculate match score and reason for a symbol against a query.
    fn match_symbol(
        &self,
        query_lower: &str,
        sym: &CodeSymbol,
    ) -> (f64, crate::search::MatchReason) {
        use crate::search::MatchReason;

        let name_lower = sym.name.to_lowercase();
        let path_lower = sym.full_path.to_lowercase();

        // Exact name match
        if name_lower == query_lower {
            return (1.0, MatchReason::ExactName);
        }

        // Name starts with query
        if name_lower.starts_with(query_lower) {
            let score = 0.9
                - (0.1 * (name_lower.len() - query_lower.len()) as f64
                    / name_lower.len().max(1) as f64);
            return (score.max(0.5), MatchReason::Prefix);
        }

        // Full path exact match
        if path_lower.contains(query_lower) && path_lower != name_lower {
            let score = 0.7;
            return (score, MatchReason::PathMatch);
        }

        // Substring match
        if name_lower.contains(query_lower) {
            let score = 0.6
                - (0.1 * (name_lower.len() - query_lower.len()) as f64
                    / name_lower.len().max(1) as f64);
            return (score.max(0.3), MatchReason::Substring);
        }

        // Fuzzy match: all query chars appear in order
        let fuzzy_score = self.fuzzy_score(query_lower, &name_lower);
        if fuzzy_score > 0.1 {
            return (fuzzy_score, MatchReason::Fuzzy);
        }

        (0.0, MatchReason::Fuzzy)
    }

    /// Fuzzy match score: all characters of query must appear in target in order.
    fn fuzzy_score(&self, query: &str, target: &str) -> f64 {
        if query.is_empty() || target.is_empty() {
            return 0.0;
        }

        let query_chars: Vec<char> = query.chars().collect();
        let target_chars: Vec<char> = target.chars().collect();
        let mut qi = 0;
        let mut consecutive = 0u32;
        let mut max_consecutive = 0u32;

        for &tc in &target_chars {
            if qi < query_chars.len() && tc == query_chars[qi] {
                qi += 1;
                consecutive += 1;
                max_consecutive = max_consecutive.max(consecutive);
            } else {
                consecutive = 0;
            }
        }

        if qi < query_chars.len() {
            return 0.0; // Not all query chars found
        }

        // Score based on: coverage + consecutive bonus
        let coverage = query_chars.len() as f64 / target_chars.len().max(1) as f64;
        let consec_bonus = max_consecutive as f64 / query_chars.len().max(1) as f64 * 0.2;

        (coverage * 0.6 + consec_bonus).min(0.5)
    }
}

/// Generate a unique key for a symbol (file:line:name).
fn symbol_key(sym: &CodeSymbol) -> String {
    format!("{}:{}:{}", sym.file_path, sym.line, sym.name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn index_empty_directory() {
        let dir = temp_dir();
        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();
        assert_eq!(index.symbol_count(), 0);
        assert_eq!(index.file_count(), 0);
    }

    #[test]
    fn index_rust_file() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(
            &rust_file,
            r#"
pub fn hello_world() -> String {
    "hello".to_string()
}

struct MyStruct {
    field: i32,
}

enum MyEnum {
    A,
    B,
}

trait MyTrait {
    fn do_thing(&self);
}

impl MyTrait for MyStruct {
    fn do_thing(&self) {}
}
"#,
        )
        .unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let symbols = index.all_symbols();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(
            names.contains(&"hello_world"),
            "Expected hello_world, got {names:?}"
        );
        assert!(
            names.contains(&"MyStruct"),
            "Expected MyStruct, got {names:?}"
        );
        assert!(names.contains(&"MyEnum"), "Expected MyEnum, got {names:?}");
        assert!(
            names.contains(&"MyTrait"),
            "Expected MyTrait, got {names:?}"
        );
    }

    #[test]
    fn index_typescript_file() {
        let dir = temp_dir();
        let ts_file = dir.path().join("test.ts");
        fs::write(
            &ts_file,
            r#"
export function greet(name: string): string {
    return `Hello, ${name}`;
}

export interface User {
    id: number;
    name: string;
}

export type UserId = number;

export enum Status {
    Active,
    Inactive,
}
"#,
        )
        .unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let symbols = index.all_symbols();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"greet"), "Expected greet, got {names:?}");
        assert!(names.contains(&"User"), "Expected User, got {names:?}");
        assert!(names.contains(&"UserId"), "Expected UserId, got {names:?}");
        assert!(names.contains(&"Status"), "Expected Status, got {names:?}");
    }

    #[test]
    fn index_python_file() {
        let dir = temp_dir();
        let py_file = dir.path().join("test.py");
        fs::write(
            &py_file,
            r#"
def hello():
    pass

async def async_handler():
    pass

class MyClass:
    def method(self):
        pass
"#,
        )
        .unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let symbols = index.all_symbols();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"hello"), "Expected hello, got {names:?}");
        assert!(
            names.contains(&"async_handler"),
            "Expected async_handler, got {names:?}"
        );
        assert!(
            names.contains(&"MyClass"),
            "Expected MyClass, got {names:?}"
        );
    }

    #[test]
    fn index_go_file() {
        let dir = temp_dir();
        let go_file = dir.path().join("test.go");
        fs::write(
            &go_file,
            r#"
package main

func main() {
    println("hello")
}

func (s *Server) Handle() {
}

type Config struct {
    Port int
}

type Handler interface {
    Serve()
}
"#,
        )
        .unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let symbols = index.all_symbols();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();

        assert!(names.contains(&"main"), "Expected main, got {names:?}");
        assert!(names.contains(&"Handle"), "Expected Handle, got {names:?}");
        assert!(names.contains(&"Config"), "Expected Config, got {names:?}");
        assert!(
            names.contains(&"Handler"),
            "Expected Handler, got {names:?}"
        );
    }

    #[test]
    fn search_exact_match() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn my_function() {}\nfn other_function() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let results = index.search("my_function");
        assert!(!results.is_empty());
        assert_eq!(results[0].symbol.name, "my_function");
    }

    #[test]
    fn search_fuzzy_match() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn my_special_handler() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let results = index.search("mysh");
        assert!(!results.is_empty());
        assert_eq!(results[0].symbol.name, "my_special_handler");
    }

    #[test]
    fn search_no_match() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn hello() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let results = index.search("xyz_not_found");
        assert!(results.is_empty());
    }

    #[test]
    fn stats_updated() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn foo() {}\nfn bar() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let stats = index.stats();
        assert_eq!(stats.files_indexed, 1);
        assert!(stats.symbols_count >= 2);
        // index_time_ms is u64, always >= 0
    }

    #[test]
    fn remove_file() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn removed_func() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();
        assert!(index.symbol_count() > 0);

        index.remove_file(&rust_file);
        assert_eq!(index.symbol_count(), 0);
    }

    #[test]
    fn clear_index() {
        let dir = temp_dir();
        let rust_file = dir.path().join("test.rs");
        fs::write(&rust_file, "fn func() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();
        assert!(index.symbol_count() > 0);

        index.clear();
        assert_eq!(index.symbol_count(), 0);
        assert_eq!(index.file_count(), 0);
    }

    #[test]
    fn skip_large_files() {
        let dir = temp_dir();
        let large_file = dir.path().join("big.rs");
        let content = "fn x() {}\n".repeat(200_000); // ~1.6MB
        fs::write(&large_file, content).unwrap();

        let config = IndexConfig { max_file_size: 100, ..Default::default() };
        let index = SymbolIndex::new(config);
        index.index_directory(dir.path()).unwrap();

        assert_eq!(index.file_count(), 0); // skipped
    }

    #[test]
    fn ignore_patterns() {
        let dir = temp_dir();
        let nested = dir.path().join("node_modules");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("index.ts"), "export function skipped() {}\n").unwrap();
        fs::write(dir.path().join("app.ts"), "export function included() {}\n").unwrap();

        let index = SymbolIndex::with_defaults();
        index.index_directory(dir.path()).unwrap();

        let symbols = index.all_symbols();
        let names: Vec<&str> = symbols.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"included"));
        assert!(!names.contains(&"skipped"));
    }

    #[test]
    fn index_config_default() {
        let config = IndexConfig::default();
        assert_eq!(config.max_file_size, 1_000_000);
        assert_eq!(config.parallelism, 0);
        assert!(!config.ignore_patterns.is_empty());
        assert!(!config.follow_links);
        assert_eq!(config.max_depth, 20);
    }
}
