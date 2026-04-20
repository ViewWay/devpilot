//! Multi-layer TOML configuration system for DevPilot.
//!
//! Configuration is resolved by merging three layers (later layers override earlier):
//! 1. **Defaults** — hard-coded in `ConfigFile::default()`
//! 2. **Global** — `~/.devpilot/config.toml`
//! 3. **Project** — `<working_dir>/.devpilot/config.toml`
//!
//! Merge strategy: at the **section level**. If a section (e.g. `[chat]`) is present
//! in an overlay, it replaces the entire section from the base. Within each section,
//! `#[serde(default)]` ensures omitted fields keep their defaults.
//!
//! # Example
//! ```no_run
//! use devpilot_store::config::ConfigLoader;
//!
//! let config = ConfigLoader::load(Some(std::path::Path::new("/my/project"))).unwrap();
//! println!("Default provider: {:?}", config.general.default_provider);
//! ```

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, info};

/// Global config directory name.
const CONFIG_DIR: &str = ".devpilot";
/// Config file name.
const CONFIG_FILE: &str = "config.toml";

// ── Config Sections ──────────────────────────────────────

/// Top-level configuration file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub struct ConfigFile {
    #[serde(default)]
    pub general: GeneralConfig,
    #[serde(default)]
    pub chat: ChatConfig,
    #[serde(default)]
    pub sandbox: SandboxConfig,
    #[serde(default)]
    pub terminal: TerminalConfig,
    #[serde(default)]
    pub ui: UiConfig,
    #[serde(default)]
    pub providers: ProvidersConfig,
}

/// General application settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct GeneralConfig {
    /// Default provider name (e.g. "anthropic", "openai").
    #[serde(default)]
    pub default_provider: Option<String>,
    /// Default model name.
    #[serde(default)]
    pub default_model: Option<String>,
    /// Theme: "dark", "light", or "system".
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Language: "en" or "zh".
    #[serde(default = "default_language")]
    pub language: String,
    /// Working directory for new sessions (None = OS default).
    #[serde(default)]
    pub working_directory: Option<String>,
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            default_provider: None,
            default_model: None,
            theme: default_theme(),
            language: default_language(),
            working_directory: None,
        }
    }
}

/// Chat behavior settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct ChatConfig {
    /// Maximum context tokens before auto-compact.
    #[serde(default = "default_max_context_tokens")]
    pub max_context_tokens: u64,
    /// Auto-compact threshold ratio (0.0–1.0).
    #[serde(default = "default_compact_threshold")]
    pub compact_threshold: f64,
    /// Stream responses token-by-token.
    #[serde(default = "default_true")]
    pub stream: bool,
    /// Default interaction mode: "code", "plan", "ask".
    #[serde(default = "default_mode")]
    pub default_mode: String,
    /// Default reasoning effort: "low", "medium", "high".
    #[serde(default)]
    pub reasoning_effort: Option<String>,
    /// Show thinking blocks in chat.
    #[serde(default)]
    pub show_thinking: bool,
}

fn default_max_context_tokens() -> u64 {
    128_000
}

fn default_compact_threshold() -> f64 {
    0.8
}

fn default_true() -> bool {
    true
}

fn default_mode() -> String {
    "code".to_string()
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self {
            max_context_tokens: default_max_context_tokens(),
            compact_threshold: default_compact_threshold(),
            stream: default_true(),
            default_mode: default_mode(),
            reasoning_effort: None,
            show_thinking: false,
        }
    }
}

/// Sandbox execution settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct SandboxConfig {
    /// Default sandbox policy: "strict", "moderate", "permissive", "none".
    #[serde(default = "default_sandbox_policy")]
    pub policy: String,
    /// Allowed commands (whitelist, overrides policy).
    #[serde(default)]
    pub allowed_commands: Vec<String>,
    /// Blocked commands (blacklist).
    #[serde(default)]
    pub blocked_commands: Vec<String>,
    /// Maximum execution time in seconds.
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Maximum output bytes.
    #[serde(default = "default_max_output")]
    pub max_output_bytes: u64,
}

fn default_sandbox_policy() -> String {
    "moderate".to_string()
}

fn default_timeout() -> u64 {
    120
}

fn default_max_output() -> u64 {
    1_000_000
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            policy: default_sandbox_policy(),
            allowed_commands: Vec::new(),
            blocked_commands: Vec::new(),
            timeout_secs: default_timeout(),
            max_output_bytes: default_max_output(),
        }
    }
}

/// Terminal emulator settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct TerminalConfig {
    /// Shell executable (None = OS default).
    #[serde(default)]
    pub shell: Option<String>,
    /// Font family.
    #[serde(default = "default_terminal_font")]
    pub font_family: String,
    /// Font size in pixels.
    #[serde(default = "default_terminal_font_size")]
    pub font_size: u32,
    /// Scrollback buffer size.
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
}

fn default_terminal_font() -> String {
    "Menlo".to_string()
}

fn default_terminal_font_size() -> u32 {
    14
}

fn default_scrollback() -> u32 {
    10_000
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            shell: None,
            font_family: default_terminal_font(),
            font_size: default_terminal_font_size(),
            scrollback: default_scrollback(),
        }
    }
}

/// UI layout settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct UiConfig {
    /// Chat font size in pixels.
    #[serde(default = "default_chat_font_size")]
    pub font_size: u32,
    /// Show sidebar by default.
    #[serde(default = "default_true")]
    pub show_sidebar: bool,
    /// Default sidebar width in pixels.
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
    /// Message max width class (e.g. "max-w-3xl").
    #[serde(default = "default_message_width")]
    pub message_max_width: String,
}

fn default_chat_font_size() -> u32 {
    14
}

fn default_sidebar_width() -> u32 {
    280
}

fn default_message_width() -> String {
    "max-w-3xl".to_string()
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            font_size: default_chat_font_size(),
            show_sidebar: default_true(),
            sidebar_width: default_sidebar_width(),
            message_max_width: default_message_width(),
        }
    }
}

/// Provider-specific defaults.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub struct ProvidersConfig {
    /// OpenAI base URL override.
    #[serde(default)]
    pub openai_base_url: Option<String>,
    /// Anthropic base URL override.
    #[serde(default)]
    pub anthropic_base_url: Option<String>,
    /// Ollama base URL.
    #[serde(default)]
    pub ollama_base_url: Option<String>,
    /// Google API endpoint override.
    #[serde(default)]
    pub google_base_url: Option<String>,
    /// Default timeout for API calls in seconds.
    #[serde(default)]
    pub request_timeout_secs: Option<u64>,
    /// Number of retry attempts for transient errors.
    #[serde(default)]
    pub retry_attempts: Option<u32>,
}

// ── Config Loader ────────────────────────────────────────

/// Loads and merges TOML configuration from multiple layers.
pub struct ConfigLoader;

impl ConfigLoader {
    /// Load the merged configuration.
    ///
    /// Resolution order (later overrides earlier):
    /// 1. Built-in defaults
    /// 2. Global config (`~/.devpilot/config.toml`)
    /// 3. Project config (`<project_dir>/.devpilot/config.toml`)
    pub fn load(project_dir: Option<&Path>) -> Result<ConfigFile> {
        let mut config = ConfigFile::default();

        // Layer 2: Global config
        if let Some(global_path) = Self::global_config_path()
            && global_path.exists()
        {
            debug!("Loading global config from {}", global_path.display());
            let global = Self::read_file(&global_path)?;
            config = Self::merge(config, global);
        }

        // Layer 3: Project config
        if let Some(project_path) = project_dir {
            let proj_config = project_path.join(CONFIG_DIR).join(CONFIG_FILE);
            if proj_config.exists() {
                debug!("Loading project config from {}", proj_config.display());
                let project = Self::read_file(&proj_config)?;
                config = Self::merge(config, project);
            }
        }

        Ok(config)
    }

    /// Get the global config directory path.
    pub fn global_config_dir() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(CONFIG_DIR))
    }

    /// Get the global config file path.
    pub fn global_config_path() -> Option<PathBuf> {
        Self::global_config_dir().map(|d| d.join(CONFIG_FILE))
    }

    /// Get the project config file path.
    pub fn project_config_path(project_dir: &Path) -> PathBuf {
        project_dir.join(CONFIG_DIR).join(CONFIG_FILE)
    }

    /// Read and parse a TOML config file.
    pub fn read_file(path: &Path) -> Result<ConfigFile> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Cannot read {}", path.display()))?;
        let config: ConfigFile =
            toml::from_str(&content).with_context(|| format!("Cannot parse {}", path.display()))?;
        Ok(config)
    }

    /// Write a config file to disk (creates parent directories).
    pub fn write_file(path: &Path, config: &ConfigFile) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Cannot create directory {}", parent.display()))?;
        }
        let content = toml::to_string_pretty(config).context("Cannot serialize config to TOML")?;
        std::fs::write(path, content)
            .with_context(|| format!("Cannot write {}", path.display()))?;
        info!("Wrote config to {}", path.display());
        Ok(())
    }

    /// Save global config.
    pub fn save_global(config: &ConfigFile) -> Result<()> {
        let path = Self::global_config_path().context("Cannot determine global config path")?;
        Self::write_file(&path, config)
    }

    /// Save project config.
    pub fn save_project(project_dir: &Path, config: &ConfigFile) -> Result<()> {
        let path = Self::project_config_path(project_dir);
        Self::write_file(&path, config)
    }

    /// Merge two configs using **field-level Option/empty-aware** logic.
    ///
    /// For `Option<T>` fields: overlay's `Some` wins over base.
    /// For `Vec<T>`: non-empty overlay replaces base.
    /// For scalars with defaults: if overlay differs from its own default, use overlay.
    /// For `bool`: overlay always wins (explicit TOML presence).
    pub fn merge(base: ConfigFile, overlay: ConfigFile) -> ConfigFile {
        ConfigFile {
            general: Self::merge_general(base.general, overlay.general),
            chat: Self::merge_chat(base.chat, overlay.chat),
            sandbox: Self::merge_sandbox(base.sandbox, overlay.sandbox),
            terminal: Self::merge_terminal(base.terminal, overlay.terminal),
            ui: Self::merge_ui(base.ui, overlay.ui),
            providers: Self::merge_providers(base.providers, overlay.providers),
        }
    }

    fn merge_general(base: GeneralConfig, overlay: GeneralConfig) -> GeneralConfig {
        GeneralConfig {
            default_provider: overlay.default_provider.or(base.default_provider),
            default_model: overlay.default_model.or(base.default_model),
            theme: if overlay.theme != default_theme() {
                overlay.theme
            } else {
                base.theme
            },
            language: if overlay.language != default_language() {
                overlay.language
            } else {
                base.language
            },
            working_directory: overlay.working_directory.or(base.working_directory),
        }
    }

    fn merge_chat(base: ChatConfig, overlay: ChatConfig) -> ChatConfig {
        ChatConfig {
            max_context_tokens: if overlay.max_context_tokens != default_max_context_tokens() {
                overlay.max_context_tokens
            } else {
                base.max_context_tokens
            },
            compact_threshold: if overlay.compact_threshold != default_compact_threshold() {
                overlay.compact_threshold
            } else {
                base.compact_threshold
            },
            stream: overlay.stream,
            default_mode: if overlay.default_mode != default_mode() {
                overlay.default_mode
            } else {
                base.default_mode
            },
            reasoning_effort: overlay.reasoning_effort.or(base.reasoning_effort),
            show_thinking: overlay.show_thinking,
        }
    }

    fn merge_sandbox(base: SandboxConfig, overlay: SandboxConfig) -> SandboxConfig {
        SandboxConfig {
            policy: if overlay.policy != default_sandbox_policy() {
                overlay.policy
            } else {
                base.policy
            },
            allowed_commands: if overlay.allowed_commands.is_empty() {
                base.allowed_commands
            } else {
                overlay.allowed_commands
            },
            blocked_commands: if overlay.blocked_commands.is_empty() {
                base.blocked_commands
            } else {
                overlay.blocked_commands
            },
            timeout_secs: if overlay.timeout_secs != default_timeout() {
                overlay.timeout_secs
            } else {
                base.timeout_secs
            },
            max_output_bytes: if overlay.max_output_bytes != default_max_output() {
                overlay.max_output_bytes
            } else {
                base.max_output_bytes
            },
        }
    }

    fn merge_terminal(base: TerminalConfig, overlay: TerminalConfig) -> TerminalConfig {
        TerminalConfig {
            shell: overlay.shell.or(base.shell),
            font_family: if overlay.font_family != default_terminal_font() {
                overlay.font_family
            } else {
                base.font_family
            },
            font_size: if overlay.font_size != default_terminal_font_size() {
                overlay.font_size
            } else {
                base.font_size
            },
            scrollback: if overlay.scrollback != default_scrollback() {
                overlay.scrollback
            } else {
                base.scrollback
            },
        }
    }

    fn merge_ui(base: UiConfig, overlay: UiConfig) -> UiConfig {
        UiConfig {
            font_size: if overlay.font_size != default_chat_font_size() {
                overlay.font_size
            } else {
                base.font_size
            },
            show_sidebar: overlay.show_sidebar,
            sidebar_width: if overlay.sidebar_width != default_sidebar_width() {
                overlay.sidebar_width
            } else {
                base.sidebar_width
            },
            message_max_width: if overlay.message_max_width != default_message_width() {
                overlay.message_max_width
            } else {
                base.message_max_width
            },
        }
    }

    fn merge_providers(base: ProvidersConfig, overlay: ProvidersConfig) -> ProvidersConfig {
        ProvidersConfig {
            openai_base_url: overlay.openai_base_url.or(base.openai_base_url),
            anthropic_base_url: overlay.anthropic_base_url.or(base.anthropic_base_url),
            ollama_base_url: overlay.ollama_base_url.or(base.ollama_base_url),
            google_base_url: overlay.google_base_url.or(base.google_base_url),
            request_timeout_secs: overlay.request_timeout_secs.or(base.request_timeout_secs),
            retry_attempts: overlay.retry_attempts.or(base.retry_attempts),
        }
    }

    /// Check whether a global config file exists.
    pub fn global_exists() -> bool {
        Self::global_config_path().is_some_and(|p| p.exists())
    }

    /// Check whether a project config file exists.
    pub fn project_exists(project_dir: &Path) -> bool {
        Self::project_config_path(project_dir).exists()
    }

    /// Delete the global config file.
    pub fn delete_global() -> Result<()> {
        if let Some(path) = Self::global_config_path()
            && path.exists()
        {
            std::fs::remove_file(&path)
                .with_context(|| format!("Cannot delete {}", path.display()))?;
            info!("Deleted global config at {}", path.display());
        }
        Ok(())
    }

    /// Delete a project config file.
    pub fn delete_project(project_dir: &Path) -> Result<()> {
        let path = Self::project_config_path(project_dir);
        if path.exists() {
            std::fs::remove_file(&path)
                .with_context(|| format!("Cannot delete {}", path.display()))?;
            info!("Deleted project config at {}", path.display());
        }
        Ok(())
    }
}

// ── Tests ────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_default_config() {
        let config = ConfigFile::default();
        assert_eq!(config.general.theme, "dark");
        assert_eq!(config.general.language, "en");
        assert!(config.general.default_provider.is_none());
        assert_eq!(config.chat.max_context_tokens, 128_000);
        assert!(config.chat.stream);
        assert_eq!(config.sandbox.policy, "moderate");
        assert_eq!(config.terminal.font_size, 14);
        assert_eq!(config.ui.font_size, 14);
    }

    #[test]
    fn test_roundtrip_toml() {
        let config = ConfigFile::default();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        let parsed: ConfigFile = toml::from_str(&toml_str).unwrap();
        assert_eq!(config, parsed);
    }

    #[test]
    fn test_merge_option_fields() {
        let mut base = ConfigFile::default();
        base.general.default_provider = Some("openai".to_string());

        let mut overlay = ConfigFile::default();
        overlay.general.default_provider = Some("anthropic".to_string());

        let merged = ConfigLoader::merge(base, overlay);
        assert_eq!(
            merged.general.default_provider,
            Some("anthropic".to_string())
        );
    }

    #[test]
    fn test_merge_preserves_base_when_overlay_is_default() {
        let mut base = ConfigFile::default();
        base.chat.max_context_tokens = 64_000;
        base.chat.show_thinking = true;

        // Overlay is all defaults — scalar merge should preserve base's non-default values
        let overlay = ConfigFile::default();

        let merged = ConfigLoader::merge(base, overlay);
        // max_context_tokens: overlay is default (128000), base is 64000 → keep base
        assert_eq!(merged.chat.max_context_tokens, 64_000);
        // show_thinking: bool overlay always wins, overlay=false
        // This is correct because the user explicitly omitted it in overlay → defaults to false
    }

    #[test]
    fn test_merge_providers() {
        let mut base = ConfigFile::default();
        base.providers.openai_base_url = Some("https://api.openai.com/v1".to_string());
        base.providers.retry_attempts = Some(3);

        let mut overlay = ConfigFile::default();
        overlay.providers.openai_base_url = Some("https://proxy.example.com/v1".to_string());

        let merged = ConfigLoader::merge(base, overlay);
        assert_eq!(
            merged.providers.openai_base_url,
            Some("https://proxy.example.com/v1".to_string())
        );
        assert_eq!(merged.providers.retry_attempts, Some(3));
    }

    #[test]
    fn test_read_write_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        let config = ConfigFile {
            general: GeneralConfig {
                default_provider: Some("anthropic".to_string()),
                default_model: Some("claude-sonnet-4-20250514".to_string()),
                ..Default::default()
            },
            chat: ChatConfig {
                max_context_tokens: 200_000,
                stream: false,
                ..Default::default()
            },
            ..Default::default()
        };

        ConfigLoader::write_file(&path, &config).unwrap();
        assert!(path.exists());

        let loaded = ConfigLoader::read_file(&path).unwrap();
        assert_eq!(
            loaded.general.default_provider,
            Some("anthropic".to_string())
        );
        assert_eq!(loaded.chat.max_context_tokens, 200_000);
        assert!(!loaded.chat.stream);
    }

    #[test]
    fn test_load_with_project_dir() {
        let dir = tempfile::tempdir().unwrap();
        let proj_dir = dir.path().join("myproject");
        let proj_config_dir = proj_dir.join(CONFIG_DIR);
        fs::create_dir_all(&proj_config_dir).unwrap();

        let config_content = r#"
[general]
default_provider = "ollama"
default_model = "llama3"

[chat]
max_context_tokens = 32000
"#;
        fs::write(proj_config_dir.join(CONFIG_FILE), config_content).unwrap();

        let loaded = ConfigLoader::load(Some(&proj_dir)).unwrap();
        assert_eq!(loaded.general.default_provider, Some("ollama".to_string()));
        assert_eq!(loaded.general.default_model, Some("llama3".to_string()));
        assert_eq!(loaded.chat.max_context_tokens, 32_000);
        assert_eq!(loaded.sandbox.policy, "moderate");
    }

    #[test]
    fn test_load_empty_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = ConfigLoader::load(Some(dir.path())).unwrap();
        assert_eq!(loaded.general.theme, "dark");
        assert_eq!(loaded.chat.max_context_tokens, 128_000);
    }

    #[test]
    fn test_partial_config() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        fs::write(
            &path,
            r#"[chat]
stream = false
"#,
        )
        .unwrap();

        let loaded = ConfigLoader::read_file(&path).unwrap();
        assert!(!loaded.chat.stream);
        assert_eq!(loaded.general.theme, "dark");
        assert_eq!(loaded.sandbox.policy, "moderate");
    }

    #[test]
    fn test_delete_config() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        let config = ConfigFile::default();
        ConfigLoader::write_file(&path, &config).unwrap();
        assert!(path.exists());

        fs::remove_file(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn test_config_serialization_full() {
        let config = ConfigFile {
            general: GeneralConfig {
                default_provider: Some("anthropic".to_string()),
                default_model: Some("claude-sonnet-4-20250514".to_string()),
                theme: "light".to_string(),
                language: "zh".to_string(),
                working_directory: Some("/home/user/projects".to_string()),
            },
            chat: ChatConfig {
                max_context_tokens: 200_000,
                compact_threshold: 0.7,
                stream: true,
                default_mode: "plan".to_string(),
                reasoning_effort: Some("high".to_string()),
                show_thinking: true,
            },
            sandbox: SandboxConfig {
                policy: "strict".to_string(),
                allowed_commands: vec!["git".to_string(), "cargo".to_string()],
                blocked_commands: vec!["rm".to_string()],
                timeout_secs: 60,
                max_output_bytes: 500_000,
            },
            terminal: TerminalConfig {
                shell: Some("/bin/zsh".to_string()),
                font_family: "JetBrains Mono".to_string(),
                font_size: 16,
                scrollback: 5_000,
            },
            ui: UiConfig {
                font_size: 16,
                show_sidebar: false,
                sidebar_width: 320,
                message_max_width: "max-w-4xl".to_string(),
            },
            providers: ProvidersConfig {
                openai_base_url: Some("https://proxy.example.com/v1".to_string()),
                anthropic_base_url: None,
                ollama_base_url: Some("http://localhost:11434".to_string()),
                google_base_url: None,
                request_timeout_secs: Some(300),
                retry_attempts: Some(5),
            },
        };

        let toml_str = toml::to_string_pretty(&config).unwrap();
        let parsed: ConfigFile = toml::from_str(&toml_str).unwrap();
        assert_eq!(config, parsed);
    }
}
