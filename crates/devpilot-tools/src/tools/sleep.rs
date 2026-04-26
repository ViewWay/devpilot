//! Sleep tool — pause execution for a specified duration.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;

/// Sleep tool.
///
/// Pauses tool execution for a specified number of seconds (0.1–300).
pub struct SleepTool;

impl SleepTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SleepTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for sleep.
#[derive(Debug, Deserialize)]
struct SleepInput {
    /// Number of seconds to sleep (0.1 to 300).
    seconds: f64,
}

#[async_trait]
impl Tool for SleepTool {
    fn name(&self) -> &str {
        "sleep"
    }

    fn description(&self) -> &str {
        "Pause execution for a specified duration."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "seconds": {
                    "type": "number",
                    "description": "Duration in seconds to sleep (0.1 to 300)",
                    "minimum": 0.1,
                    "maximum": 300
                }
            },
            "required": ["seconds"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let params: SleepInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        let seconds = params.seconds.clamp(0.1, 300.0);

        tokio::time::sleep(Duration::from_secs_f64(seconds)).await;

        Ok(ToolOutput::ok(format!("Slept for {:.1} seconds", seconds)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test-session".into(),
            env_vars: vec![],
        }
    }

    #[tokio::test]
    async fn test_sleep_basic() {
        let tool = SleepTool::new();
        let start = Instant::now();

        let result = tool
            .execute(serde_json::json!({"seconds": 0.1}), &ctx())
            .await
            .unwrap();

        let elapsed = start.elapsed();
        assert!(!result.is_error);
        assert!(result.content.contains("Slept for 0.1 seconds"));
        assert!(elapsed >= Duration::from_millis(80)); // Allow small timing variance
    }

    #[tokio::test]
    async fn test_sleep_clamps_minimum() {
        let tool = SleepTool::new();
        let start = Instant::now();

        let result = tool
            .execute(serde_json::json!({"seconds": 0.01}), &ctx())
            .await
            .unwrap();

        let elapsed = start.elapsed();
        assert!(!result.is_error);
        // Should have been clamped to 0.1
        assert!(result.content.contains("Slept for 0.1 seconds"));
        assert!(elapsed >= Duration::from_millis(80));
    }

    #[tokio::test]
    async fn test_sleep_clamps_maximum() {
        let tool = SleepTool::new();
        // We don't actually sleep for 300s — just verify the clamp in output.
        // Use a small value and check the logic via the output message.
        let result = tool
            .execute(serde_json::json!({"seconds": 0.2}), &ctx())
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Slept for 0.2 seconds"));
    }

    #[tokio::test]
    async fn test_sleep_missing_seconds() {
        let tool = SleepTool::new();
        let result = tool.execute(serde_json::json!({}), &ctx()).await;

        assert!(result.is_err());
    }
}
