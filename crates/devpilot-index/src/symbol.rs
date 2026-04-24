//! Symbol types — the core data structures extracted from source code.

use serde::{Deserialize, Serialize};

use crate::language::LanguageId;

/// Kind of symbol extracted from source code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SymbolKind {
    Function,
    Method,
    Struct,
    Enum,
    EnumVariant,
    Trait,
    Impl,
    Module,
    Const,
    Static,
    TypeAlias,
    Interface,
    Class,
    Variable,
    Namespace,
    Macro,
    Field,
    Property,
    Unknown,
}

impl std::fmt::Display for SymbolKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Function => "function",
            Self::Method => "method",
            Self::Struct => "struct",
            Self::Enum => "enum",
            Self::EnumVariant => "enum-variant",
            Self::Trait => "trait",
            Self::Impl => "impl",
            Self::Module => "module",
            Self::Const => "const",
            Self::Static => "static",
            Self::TypeAlias => "type-alias",
            Self::Interface => "interface",
            Self::Class => "class",
            Self::Variable => "variable",
            Self::Namespace => "namespace",
            Self::Macro => "macro",
            Self::Field => "field",
            Self::Property => "property",
            Self::Unknown => "symbol",
        };
        write!(f, "{s}")
    }
}

/// A code symbol extracted from a source file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSymbol {
    /// Symbol name (e.g. "chat_stream", "FallbackProvider").
    pub name: String,

    /// What kind of symbol this is.
    pub kind: SymbolKind,

    /// Full qualified path if available (e.g. "crate::llm::chat_stream").
    /// Falls back to just the name if module path cannot be determined.
    pub full_path: String,

    /// Language of the source file.
    pub language: LanguageId,

    /// Absolute file path.
    pub file_path: String,

    /// 1-based line number where the symbol is defined.
    pub line: u32,

    /// 1-based column (byte offset) where the symbol name starts.
    pub column: u32,

    /// Containing symbol name (e.g. impl target, parent struct).
    pub container: Option<String>,

    /// First line of documentation comment if present.
    pub doc_summary: Option<String>,
}
