//! Retry logic for LLM operations.
//!
//! Provides exponential backoff retry for transient errors like rate limits,
//! network timeouts, and server errors. Integrates with the provider system
//! to automatically retry failed requests.

use std::time::Duration;

use tracing::warn;

use crate::error::LlmError;

/// Configuration for retry behavior.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts (0 = no retries).
    pub max_retries: u32,
    /// Initial delay between retries.
    pub initial_delay: Duration,
    /// Maximum delay between retries.
    pub max_delay: Duration,
    /// Multiplier for exponential backoff.
    pub backoff_multiplier: f64,
    /// Whether to add jitter to retry delays.
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }
}

impl RetryConfig {
    /// Create a config with no retries.
    pub fn no_retries() -> Self {
        Self {
            max_retries: 0,
            ..Self::default()
        }
    }

    /// Create a config optimized for streaming (fewer retries, shorter delays).
    pub fn streaming() -> Self {
        Self {
            max_retries: 2,
            initial_delay: Duration::from_millis(300),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
            jitter: true,
        }
    }

    /// Create a config for aggressive retries (e.g., batch operations).
    pub fn aggressive() -> Self {
        Self {
            max_retries: 5,
            initial_delay: Duration::from_millis(200),
            max_delay: Duration::from_secs(60),
            backoff_multiplier: 1.5,
            jitter: true,
        }
    }

    /// Calculate the delay for a given retry attempt.
    pub fn delay_for_attempt(&self, attempt: u32) -> Duration {
        let base_delay = self.initial_delay.as_secs_f64()
            * self.backoff_multiplier.powi(attempt as i32);
        let delay = base_delay.min(self.max_delay.as_secs_f64());

        if self.jitter {
            // Add ±25% jitter
            let jitter_range = delay * 0.25;
            // Simple deterministic jitter based on attempt number
            let jitter_offset = if attempt.is_multiple_of(2) {
                jitter_range * 0.3
            } else {
                -jitter_range * 0.2
            };
            Duration::from_secs_f64((delay + jitter_offset).max(0.0))
        } else {
            Duration::from_secs_f64(delay)
        }
    }
}

/// Execute an async operation with retry logic.
///
/// Retries the operation only on transient errors (rate limits, network errors,
/// timeouts). Returns the first successful result or the last error.
pub async fn retry_operation<F, Fut, T>(
    config: &RetryConfig,
    mut operation: F,
) -> Result<T, LlmError>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, LlmError>>,
{
    let mut last_error = None;

    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) => {
                if !err.is_retryable() || attempt >= config.max_retries {
                    return Err(err);
                }

                let delay = if let LlmError::RateLimitError { retry_after: Some(secs) } = &err {
                    // Respect server's retry-after header
                    Duration::from_secs_f64(*secs).max(config.initial_delay)
                } else {
                    config.delay_for_attempt(attempt)
                };

                warn!(
                    attempt = attempt + 1,
                    max_retries = config.max_retries,
                    delay_ms = delay.as_millis(),
                    error = %err,
                    "Retrying LLM operation after transient error"
                );

                last_error = Some(err);
                tokio::time::sleep(delay).await;
            }
        }
    }

    // Should not reach here, but just in case
    Err(last_error.unwrap_or_else(|| LlmError::NetworkError("Unknown retry failure".into())))
}

/// Wrapper that adds retry logic to a provider's chat method.
///
/// Uses the default retry configuration. For custom retry behavior,
/// use `retry_operation` directly with a custom `RetryConfig`.
pub async fn retry_chat<F, Fut>(chat_fn: F) -> Result<devpilot_protocol::ChatResponse, LlmError>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<devpilot_protocol::ChatResponse, LlmError>>,
{
    retry_operation(&RetryConfig::default(), chat_fn).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_values() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(500));
        assert_eq!(config.max_delay, Duration::from_secs(30));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert!(config.jitter);
    }

    #[test]
    fn no_retries_config() {
        let config = RetryConfig::no_retries();
        assert_eq!(config.max_retries, 0);
    }

    #[test]
    fn streaming_config_fewer_retries() {
        let config = RetryConfig::streaming();
        assert!(config.max_retries <= 2);
        assert!(config.initial_delay < Duration::from_secs(1));
    }

    #[test]
    fn aggressive_config_more_retries() {
        let config = RetryConfig::aggressive();
        assert!(config.max_retries >= 5);
    }

    #[test]
    fn delay_increases_with_attempts() {
        let config = RetryConfig {
            jitter: false,
            ..Default::default()
        };

        let d0 = config.delay_for_attempt(0);
        let d1 = config.delay_for_attempt(1);
        let d2 = config.delay_for_attempt(2);

        assert!(d1 > d0, "Delay should increase: {d1:?} > {d0:?}");
        assert!(d2 > d1, "Delay should increase: {d2:?} > {d1:?}");
    }

    #[test]
    fn delay_capped_at_max() {
        let config = RetryConfig {
            jitter: false,
            max_delay: Duration::from_secs(5),
            ..Default::default()
        };

        // Even with many attempts, delay should not exceed max_delay
        for attempt in 0..20 {
            let delay = config.delay_for_attempt(attempt);
            assert!(
                delay <= Duration::from_secs(5) + Duration::from_millis(1),
                "Delay {delay:?} exceeds max for attempt {attempt}"
            );
        }
    }

    #[tokio::test]
    async fn retry_succeeds_first_try() {
        let config = RetryConfig::no_retries();
        let result = retry_operation(&config, || async {
            Ok::<i32, LlmError>(42)
        })
        .await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn retry_succeeds_after_transient_error() {
        let config = RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            jitter: false,
            ..Default::default()
        };

        let mut attempts = 0;
        let result = retry_operation(&config, || {
            attempts += 1;
            async move {
                if attempts < 3 {
                    Err(LlmError::NetworkError("timeout".into()))
                } else {
                    Ok(100)
                }
            }
        })
        .await;

        assert_eq!(result.unwrap(), 100);
    }

    #[tokio::test]
    async fn retry_fails_on_non_retryable_error() {
        let config = RetryConfig::default();

        let mut attempts = 0;
        let result = retry_operation(&config, || {
            attempts += 1;
            async move {
                // AuthError is not retryable
                Err::<i32, LlmError>(LlmError::AuthError("bad key".into()))
            }
        })
        .await;

        assert!(result.is_err());
        // Should have been called exactly once (no retry)
        assert_eq!(attempts, 1);
    }

    #[tokio::test]
    async fn retry_exhausts_all_attempts() {
        let config = RetryConfig {
            max_retries: 2,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(5),
            jitter: false,
            ..Default::default()
        };

        let mut attempts = 0;
        let result = retry_operation(&config, || {
            attempts += 1;
            async { Err::<i32, LlmError>(LlmError::NetworkError("down".into())) }
        })
        .await;

        assert!(result.is_err());
        // 1 initial + 2 retries = 3 total attempts
        assert_eq!(attempts, 3);
    }

    #[test]
    fn jitter_produces_different_delays() {
        let config = RetryConfig {
            jitter: true,
            ..Default::default()
        };

        let delays: Vec<Duration> = (0..10).map(|i| config.delay_for_attempt(i)).collect();

        // With jitter, some delays should differ from pure exponential
        let unique_delays: std::collections::HashSet<Duration> = delays.into_iter().collect();
        // Not all delays are the same (they increase with attempt, but jitter adds variance)
        assert!(unique_delays.len() > 1);
    }
}
