//! Language identification based on file extension.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageId {
    Rust,
    TypeScript,
    Tsx,
    JavaScript,
    Jsx,
    Python,
    Go,
    C,
    Cpp,
    Java,
    Zig,
    Unknown,
}

impl LanguageId {
    /// Detect language from file extension.
    pub fn from_path(path: &Path) -> Self {
        match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "rs" => Self::Rust,
            "ts" => Self::TypeScript,
            "tsx" => Self::Tsx,
            "js" => Self::JavaScript,
            "jsx" => Self::Jsx,
            "py" => Self::Python,
            "go" => Self::Go,
            "c" | "h" => Self::C,
            "cpp" | "cxx" | "cc" | "hpp" | "hxx" => Self::Cpp,
            "java" => Self::Java,
            "zig" => Self::Zig,
            _ => Self::Unknown,
        }
    }

    /// Whether this language has tree-sitter symbol extraction support.
    pub fn is_supported(&self) -> bool {
        !matches!(self, Self::Unknown)
    }

    /// File extensions to include when walking a directory for this language.
    pub fn source_extensions(&self) -> &'static [&'static str] {
        match self {
            Self::Rust => &["rs"],
            Self::TypeScript => &["ts"],
            Self::Tsx => &["tsx"],
            Self::JavaScript => &["js"],
            Self::Jsx => &["jsx"],
            Self::Python => &["py"],
            Self::Go => &["go"],
            Self::C => &["c", "h"],
            Self::Cpp => &["cpp", "cxx", "cc", "hpp", "hxx"],
            Self::Java => &["java"],
            Self::Zig => &["zig"],
            Self::Unknown => &[],
        }
    }
}

impl std::fmt::Display for LanguageId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Rust => "rust",
            Self::TypeScript => "typescript",
            Self::Tsx => "tsx",
            Self::JavaScript => "javascript",
            Self::Jsx => "jsx",
            Self::Python => "python",
            Self::Go => "go",
            Self::C => "c",
            Self::Cpp => "cpp",
            Self::Java => "java",
            Self::Zig => "zig",
            Self::Unknown => "unknown",
        };
        write!(f, "{s}")
    }
}
