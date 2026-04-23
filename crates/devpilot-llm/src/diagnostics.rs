//! Provider health diagnostics and auto-fix suggestions.
//!
//! Provides a comprehensive diagnostic system that checks provider
//! connectivity, authentication, model availability, and common
//! configuration issues. Returns actionable suggestions for fixes.

use devpilot_protocol::ProviderConfig;
use std::time::Instant;

use crate::error::LlmError;
use crate::registry::create_provider;

/// Severity level for diagnostic checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Everything is working correctly.
    Ok,
    /// Minor issue that doesn't block functionality.
    Warning,
    /// Critical issue preventing the provider from working.
    Error,
}

/// A single diagnostic check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCheck {
    /// Human-readable name of the check (e.g., "API Key").
    pub name: String,
    /// Severity level.
    pub severity: Severity,
    /// Short description of the result.
    pub message: String,
    /// Optional suggestion for fixing an issue.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

/// Full diagnostic report for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    /// Provider ID that was diagnosed.
    pub provider_id: String,
    /// Provider name (display).
    pub provider_name: String,
    /// Overall health status. `true` if the provider can be used.
    pub healthy: bool,
    /// Total diagnostic duration in milliseconds.
    pub duration_ms: u64,
    /// Individual check results.
    pub checks: Vec<DiagnosticCheck>,
    /// Number of available models (if probe succeeded).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models_count: Option<usize>,
}

use serde::{Deserialize, Serialize};

/// Run a comprehensive diagnostic on a provider configuration.
///
/// This performs several checks:
/// 1. Configuration completeness (API key, base URL, models)
/// 2. Network connectivity (DNS resolution, TCP connection)
/// 3. Authentication (valid API key)
/// 4. Model availability (can list models)
/// 5. Quick chat test (optional, minimal token request)
pub async fn run_diagnostics(config: ProviderConfig) -> DiagnosticReport {
    let start = Instant::now();
    let mut checks = Vec::new();
    let mut healthy = true;
    let mut models_count: Option<usize> = None;

    // ── Check 1: Configuration completeness ────────────
    checks.push(check_config_completeness(&config));

    // ── Check 2: Provider instantiation ────────────────
    let provider_result = create_provider(config.clone());
    match provider_result {
        Ok(provider) => {
            checks.push(DiagnosticCheck {
                name: "Provider Instantiation".into(),
                severity: Severity::Ok,
                message: "Provider created successfully".into(),
                suggestion: None,
            });

            // ── Check 3: Connectivity & Authentication (probe) ──
            match provider.probe().await {
                Ok(()) => {
                    checks.push(DiagnosticCheck {
                        name: "Connectivity".into(),
                        severity: Severity::Ok,
                        message: "Provider is reachable and API key is valid".into(),
                        suggestion: None,
                    });
                }
                Err(LlmError::AuthError(msg)) => {
                    healthy = false;
                    checks.push(DiagnosticCheck {
                        name: "Authentication".into(),
                        severity: Severity::Error,
                        message: format!("Authentication failed: {msg}"),
                        suggestion: Some(format!(
                            "Check your API key for {}. Make sure it's valid and has not expired.",
                            config.name
                        )),
                    });
                }
                Err(LlmError::RateLimitError { retry_after }) => {
                    checks.push(DiagnosticCheck {
                        name: "Rate Limit".into(),
                        severity: Severity::Warning,
                        message: format!(
                            "Rate limited. Retry after {}s.",
                            retry_after.map_or("?".to_string(), |s| format!("{s:.0}"))
                        ),
                        suggestion: Some(
                            "Wait a moment before trying again. If this persists, check your plan limits.".into(),
                        ),
                    });
                }
                Err(LlmError::NetworkError(msg)) => {
                    healthy = false;
                    checks.push(DiagnosticCheck {
                        name: "Network".into(),
                        severity: Severity::Error,
                        message: format!("Cannot reach provider: {msg}"),
                        suggestion: Some(format!(
                            "Check your internet connection and the base URL: {}",
                            config.base_url
                        )),
                    });
                }
                Err(LlmError::ApiError { status, message }) => {
                    healthy = false;
                    let suggestion = match status {
                        401 | 403 => Some(format!(
                            "Verify your API key for {}. It may be invalid or lack permissions.",
                            config.name
                        )),
                        404 => Some(format!(
                            "The base URL '{}' may be incorrect. Check the provider's documentation.",
                            config.base_url
                        )),
                        429 => Some(
                            "You are being rate-limited. Wait and try again, or upgrade your plan."
                                .into(),
                        ),
                        500..=599 => Some(
                            "The provider server is experiencing issues. Try again later.".into(),
                        ),
                        _ => Some(format!("Unexpected API error (HTTP {status}): {message}")),
                    };
                    checks.push(DiagnosticCheck {
                        name: "API Response".into(),
                        severity: Severity::Error,
                        message: format!("API returned HTTP {status}: {message}"),
                        suggestion,
                    });
                }
                Err(e) => {
                    healthy = false;
                    checks.push(DiagnosticCheck {
                        name: "Probe".into(),
                        severity: Severity::Error,
                        message: e.display_message(),
                        suggestion: Some(format!(
                            "Check your configuration for {} and try again.",
                            config.name
                        )),
                    });
                }
            }

            // ── Check 4: Model availability ─────────────
            match provider.list_models().await {
                Ok(models) => {
                    let count = models.len();
                    models_count = Some(count);
                    if count == 0 {
                        checks.push(DiagnosticCheck {
                            name: "Models".into(),
                            severity: Severity::Warning,
                            message: "No models found via API. Using static config list.".into(),
                            suggestion: Some(
                                "Add models manually in the provider settings.".into(),
                            ),
                        });
                    } else {
                        checks.push(DiagnosticCheck {
                            name: "Models".into(),
                            severity: Severity::Ok,
                            message: format!("Found {count} available models"),
                            suggestion: None,
                        });
                    }
                }
                Err(e) => {
                    // Non-critical: fall back to static config
                    let static_count = config.models.len();
                    models_count = if static_count > 0 {
                        Some(static_count)
                    } else {
                        None
                    };
                    checks.push(DiagnosticCheck {
                        name: "Models".into(),
                        severity: Severity::Warning,
                        message: format!(
                            "Could not fetch models from API: {}. {} models in static config.",
                            e.display_message(),
                            static_count
                        ),
                        suggestion: if static_count == 0 {
                            Some("No models configured. Add at least one model to use this provider.".into())
                        } else {
                            None
                        },
                    });
                }
            }

            // ── Check 5: Model config consistency ───────
            checks.push(check_model_config(&config));
        }
        Err(e) => {
            healthy = false;
            checks.push(DiagnosticCheck {
                name: "Provider Instantiation".into(),
                severity: Severity::Error,
                message: format!("Failed to create provider: {}", e.display_message()),
                suggestion: Some(
                    "Check your provider configuration. Ensure the provider type is supported."
                        .into(),
                ),
            });
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    DiagnosticReport {
        provider_id: config.id.clone(),
        provider_name: config.name.clone(),
        healthy,
        duration_ms,
        checks,
        models_count,
    }
}

/// Check if the provider configuration has all required fields.
fn check_config_completeness(config: &ProviderConfig) -> DiagnosticCheck {
    let mut issues = Vec::new();

    if config.base_url.is_empty() {
        issues.push("Base URL is empty");
    }

    if !config.base_url.is_empty()
        && !config.base_url.starts_with("http://")
        && !config.base_url.starts_with("https://")
    {
        issues.push("Base URL should start with http:// or https://");
    }

    if config.api_key.is_none() || config.api_key.as_ref().is_none_or(|k| k.is_empty()) {
        // Ollama doesn't require API keys
        let needs_key = !matches!(
            config.provider_type,
            devpilot_protocol::ProviderType::Ollama
        );
        if needs_key {
            issues.push("API key is missing");
        }
    }

    if config.models.is_empty() {
        issues.push("No models configured");
    }

    if issues.is_empty() {
        DiagnosticCheck {
            name: "Configuration".into(),
            severity: Severity::Ok,
            message: "Configuration is complete".into(),
            suggestion: None,
        }
    } else {
        DiagnosticCheck {
            name: "Configuration".into(),
            severity: if issues
                .iter()
                .any(|i| i.contains("API key") || i.contains("Base URL"))
            {
                Severity::Error
            } else {
                Severity::Warning
            },
            message: issues.join("; "),
            suggestion: Some("Fill in the missing fields in provider settings.".into()),
        }
    }
}

/// Check if model configurations have proper metadata.
fn check_model_config(config: &ProviderConfig) -> DiagnosticCheck {
    let mut warnings = Vec::new();

    for model in &config.models {
        if model.max_input_tokens == 0 {
            warnings.push(format!("Model '{}' has max_input_tokens=0", model.id));
        }
        if model.max_output_tokens == 0 {
            warnings.push(format!("Model '{}' has max_output_tokens=0", model.id));
        }
    }

    if warnings.is_empty() {
        DiagnosticCheck {
            name: "Model Metadata".into(),
            severity: Severity::Ok,
            message: format!("{} models with valid metadata", config.models.len()),
            suggestion: None,
        }
    } else {
        DiagnosticCheck {
            name: "Model Metadata".into(),
            severity: Severity::Warning,
            message: warnings.join("; "),
            suggestion: Some(
                "Some models have incomplete metadata. This may affect token counting and context window limits.".into(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::{ModelInfo, ProviderType};

    fn test_config_with_key() -> ProviderConfig {
        ProviderConfig {
            id: "test-openai".into(),
            name: "Test OpenAI".into(),
            provider_type: ProviderType::OpenAI,
            base_url: "https://api.openai.com".into(),
            api_key: Some("sk-test-key".into()),
            models: vec![ModelInfo {
                id: "gpt-4".into(),
                name: "GPT-4".into(),
                provider: ProviderType::OpenAI,
                max_input_tokens: 128000,
                max_output_tokens: 4096,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: true,
                input_price_per_million: Some(30.0),
                output_price_per_million: Some(60.0),
            }],
            enabled: true,
            fallback_provider_ids: vec![],
        }
    }

    #[test]
    fn config_completeness_all_good() {
        let config = test_config_with_key();
        let check = check_config_completeness(&config);
        assert_eq!(check.severity, Severity::Ok);
    }

    #[test]
    fn config_completeness_missing_key() {
        let mut config = test_config_with_key();
        config.api_key = None;
        let check = check_config_completeness(&config);
        assert_eq!(check.severity, Severity::Error);
        assert!(check.message.contains("API key"));
    }

    #[test]
    fn config_completeness_ollama_no_key_ok() {
        let config = ProviderConfig {
            id: "test-ollama".into(),
            name: "Test Ollama".into(),
            provider_type: ProviderType::Ollama,
            base_url: "http://localhost:11434".into(),
            api_key: None,
            models: vec![ModelInfo {
                id: "llama3".into(),
                name: "Llama 3".into(),
                provider: ProviderType::Ollama,
                max_input_tokens: 8192,
                max_output_tokens: 4096,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: false,
                input_price_per_million: None,
                output_price_per_million: None,
            }],
            enabled: true,
            fallback_provider_ids: vec![],
        };
        let check = check_config_completeness(&config);
        assert_eq!(check.severity, Severity::Ok);
    }

    #[test]
    fn config_completeness_no_models() {
        let mut config = test_config_with_key();
        config.models = vec![];
        let check = check_config_completeness(&config);
        assert_eq!(check.severity, Severity::Warning);
        assert!(check.message.contains("No models"));
    }

    #[test]
    fn config_completeness_bad_url() {
        let mut config = test_config_with_key();
        config.base_url = "not-a-url".into();
        let check = check_config_completeness(&config);
        assert_eq!(check.severity, Severity::Error);
        assert!(check.message.contains("http"));
    }

    #[test]
    fn model_metadata_all_good() {
        let config = test_config_with_key();
        let check = check_model_config(&config);
        assert_eq!(check.severity, Severity::Ok);
    }

    #[test]
    fn model_metadata_zero_tokens() {
        let mut config = test_config_with_key();
        config.models[0].max_input_tokens = 0;
        let check = check_model_config(&config);
        assert_eq!(check.severity, Severity::Warning);
        assert!(check.message.contains("max_input_tokens=0"));
    }

    #[tokio::test]
    async fn diagnostics_report_structure() {
        // This will fail at the probe step (no real server) but tests the structure
        let config = test_config_with_key();
        let report = run_diagnostics(config).await;
        assert_eq!(report.provider_id, "test-openai");
        assert_eq!(report.provider_name, "Test OpenAI");
        assert!(report.duration_ms > 0);
        // Should have at least: config, instantiation, and one more check
        assert!(report.checks.len() >= 2);
    }
}
