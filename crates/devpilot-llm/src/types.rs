//! LLM-specific type aliases and utility types.
//!
//! These are types used internally by provider implementations,
//! not part of the shared protocol.

use devpilot_protocol::Usage;

/// Cost calculation result.
#[derive(Debug, Clone)]
pub struct CostEstimate {
    /// Estimated cost in USD.
    pub cost_usd: f64,
    /// Input tokens billed.
    pub input_tokens: u32,
    /// Output tokens billed.
    pub output_tokens: u32,
    /// Cache-read tokens (usually cheaper).
    pub cache_read_tokens: u32,
    /// Cache-write tokens (usually at input price).
    pub cache_write_tokens: u32,
}

/// Pricing information for a model.
#[derive(Debug, Clone)]
pub struct ModelPricing {
    /// Price per 1M input tokens (USD).
    pub input_per_million: f64,
    /// Price per 1M output tokens (USD).
    pub output_per_million: f64,
    /// Price per 1M cache-read tokens (USD). 0.0 if not supported.
    pub cache_read_per_million: f64,
    /// Price per 1M cache-write tokens (USD). 0.0 if not supported.
    pub cache_write_per_million: f64,
}

impl Default for ModelPricing {
    fn default() -> Self {
        Self {
            input_per_million: 0.0,
            output_per_million: 0.0,
            cache_read_per_million: 0.0,
            cache_write_per_million: 0.0,
        }
    }
}

impl ModelPricing {
    /// Calculate cost from usage.
    pub fn calculate(&self, usage: &Usage) -> CostEstimate {
        let cache_read = usage.cache_read_tokens.unwrap_or(0);
        let cache_write = usage.cache_write_tokens.unwrap_or(0);

        CostEstimate {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_tokens: cache_read,
            cache_write_tokens: cache_write,
            cost_usd: {
                (usage.input_tokens as f64 - cache_read as f64 - cache_write as f64)
                    * self.input_per_million
                    / 1_000_000.0
                    + usage.output_tokens as f64 * self.output_per_million / 1_000_000.0
                    + cache_read as f64 * self.cache_read_per_million / 1_000_000.0
                    + cache_write as f64 * self.cache_write_per_million / 1_000_000.0
            },
        }
    }
}

/// Token counting configuration.
#[derive(Debug, Clone)]
pub struct TokenCountConfig {
    /// Characters per token (rough estimate for languages without BPE).
    pub chars_per_token: f32,
    /// Overhead tokens for system prompt formatting.
    pub system_overhead: u32,
    /// Overhead tokens per message (role, delimiters, etc.).
    pub per_message_overhead: u32,
}

impl Default for TokenCountConfig {
    fn default() -> Self {
        Self {
            // English average ~4 chars/token, CJK ~1.5 chars/token.
            // Use conservative middle ground.
            chars_per_token: 3.0,
            system_overhead: 10,
            per_message_overhead: 5,
        }
    }
}

/// Rough token count estimator (character-based).
/// For accurate counts, use the provider's `usage` field in responses.
pub fn estimate_tokens(text: &str, config: &TokenCountConfig) -> u32 {
    let chars = text.chars().count() as f32;
    (chars / config.chars_per_token).ceil() as u32
}

/// Estimate total input tokens for a full chat request.
///
/// This counts tokens for the system prompt, all messages (including
/// per-message overhead), and tool definitions. It uses the character-based
/// estimator which is a rough approximation — actual token counts depend
/// on the tokenizer used by the specific model.
pub fn estimate_chat_tokens(
    system: Option<&str>,
    messages: &[devpilot_protocol::Message],
    tools: Option<&[devpilot_protocol::ToolDefinition]>,
    config: &TokenCountConfig,
) -> u32 {
    let mut total = config.system_overhead;

    // System prompt tokens
    if let Some(sys) = system {
        total += estimate_tokens(sys, config);
    }

    // Message tokens (text content + per-message overhead)
    for msg in messages {
        total += config.per_message_overhead;
        total += estimate_tokens(&msg.text_content(), config);
    }

    // Tool definition tokens (name + description + schema JSON)
    if let Some(tools) = tools {
        for tool in tools {
            total += estimate_tokens(&tool.name, config);
            total += estimate_tokens(&tool.description, config);
            // Schema is typically compact JSON
            let schema_str = serde_json::to_string(&tool.input_schema).unwrap_or_default();
            total += estimate_tokens(&schema_str, config);
        }
    }

    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cost_calculation() {
        let pricing = ModelPricing {
            input_per_million: 3.0,   // $3/1M input
            output_per_million: 15.0, // $15/1M output
            cache_read_per_million: 0.3,
            cache_write_per_million: 3.75,
        };

        let usage = Usage {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: Some(200),
            cache_write_tokens: Some(100),
        };

        let cost = pricing.calculate(&usage);
        // input: (1000 - 200 - 100) * 3/1M = 0.0021
        // output: 500 * 15/1M = 0.0075
        // cache_read: 200 * 0.3/1M = 0.00006
        // cache_write: 100 * 3.75/1M = 0.000375
        // total ≈ 0.010035
        assert!((cost.cost_usd - 0.010035).abs() < 0.0001);
    }

    #[test]
    fn estimate_tokens_simple() {
        let config = TokenCountConfig::default();
        let count = estimate_tokens("Hello, world!", &config);
        assert!(count > 0);
        // "Hello, world!" = 13 chars / 3.0 ≈ 4.33 → 5
        assert_eq!(count, 5);
    }

    #[test]
    fn estimate_chat_tokens_basic() {
        use devpilot_protocol::{Message, MessageRole};

        let config = TokenCountConfig::default();
        let messages = vec![
            Message::text(MessageRole::User, "Hello"),
            Message::text(MessageRole::Assistant, "Hi there!"),
        ];

        let count = estimate_chat_tokens(Some("You are helpful."), &messages, None, &config);
        // system overhead (10) + "You are helpful." estimate (6) + 2 messages * (5 + text tokens)
        assert!(count > 20);
    }

    #[test]
    fn estimate_chat_tokens_with_tools() {
        use devpilot_protocol::{Message, MessageRole, ToolDefinition};

        let config = TokenCountConfig::default();
        let messages = vec![Message::text(MessageRole::User, "Use the tool")];
        let tools = vec![ToolDefinition {
            name: "read_file".to_string(),
            description: "Read a file from disk".to_string(),
            input_schema: serde_json::json!({"type": "object", "properties": {"path": {"type": "string"}}}),
        }];

        let without_tools = estimate_chat_tokens(None, &messages, None, &config);
        let with_tools = estimate_chat_tokens(None, &messages, Some(&tools), &config);
        assert!(with_tools > without_tools);
    }
}
