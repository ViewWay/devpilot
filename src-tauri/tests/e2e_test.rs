//! End-to-end integration tests for DevPilot IPC command flows.
//!
//! These tests exercise the full data path: Store → SQLite (in-memory),
//! simulating the same call chain a Tauri IPC command would traverse.
//! No Tauri runtime required — pure Rust + SQLite.

use devpilot_store::{ProviderRecord, Store};

/// Helper: create a fresh in-memory Store for each test (full isolation).
fn setup() -> Store {
    Store::open_in_memory().expect("in-memory DB should initialize")
}

// ── Session Lifecycle ──────────────────────────────────────

#[test]
fn test_session_crud_lifecycle() {
    let db = setup();

    // Create
    let session = db
        .create_session("Test Chat", "claude-4-sonnet", "anthropic")
        .expect("create_session should succeed");
    assert_eq!(session.title, "Test Chat");
    assert_eq!(session.model, "claude-4-sonnet");
    assert_eq!(session.provider, "anthropic");

    let session_id = session.id.clone();

    // Read
    let fetched = db
        .get_session(&session_id)
        .expect("get_session should succeed");
    assert_eq!(fetched.id, session_id);
    assert_eq!(fetched.title, "Test Chat");

    // List
    let sessions = db.list_sessions().expect("list_sessions should succeed");
    assert!(sessions.iter().any(|s| s.id == session_id));

    // Update title
    db.update_session_title(&session_id, "Updated Title")
        .expect("update title should succeed");
    let updated = db.get_session(&session_id).expect("get after update");
    assert_eq!(updated.title, "Updated Title");

    // Delete
    db.delete_session(&session_id)
        .expect("delete should succeed");
    assert!(db.get_session(&session_id).is_err());
}

// ── Message Lifecycle ──────────────────────────────────────

#[test]
fn test_message_crud_lifecycle() {
    let db = setup();

    let session = db.create_session("Msg Test", "gpt-5.2", "openai").unwrap();

    // Add messages
    let user_msg = db
        .add_message(&session.id, "user", "Hello, AI!", None, None, None)
        .expect("add user message");
    assert_eq!(user_msg.role, "user");
    assert_eq!(user_msg.content, "Hello, AI!");

    let asst_msg = db
        .add_message(&session.id, "assistant", "Hi there!", None, None, None)
        .expect("add assistant message");
    assert_eq!(asst_msg.role, "assistant");

    // List messages
    let messages = db.get_session_messages(&session.id).expect("list messages");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[1].role, "assistant");

    // Update message content
    db.update_message_content(&asst_msg.id, "Updated response")
        .expect("update content");
    let updated_msgs = db
        .get_session_messages(&session.id)
        .expect("list after update");
    let updated = updated_msgs.iter().find(|m| m.id == asst_msg.id).unwrap();
    assert_eq!(updated.content, "Updated response");
}

// ── Settings ───────────────────────────────────────────────

#[test]
fn test_settings_crud() {
    let db = setup();

    // Set
    db.set_setting("theme", "dark").expect("set_setting");
    db.set_setting("locale", "zh").expect("set_setting locale");

    // Get
    let theme = db.get_setting("theme").expect("get_setting");
    assert_eq!(theme, Some("dark".to_string()));

    let locale = db.get_setting("locale").expect("get_setting");
    assert_eq!(locale, Some("zh".to_string()));

    // List
    let settings = db.list_settings().expect("list_settings");
    assert!(settings.len() >= 2);

    // Upsert
    db.set_setting("theme", "light").expect("update setting");
    let updated = db.get_setting("theme").expect("get after upsert");
    assert_eq!(updated, Some("light".to_string()));

    // Non-existent
    let missing = db.get_setting("nonexistent_key").expect("get missing");
    assert_eq!(missing, None);
}

// ── Provider with API Key Encryption ───────────────────────

#[test]
fn test_provider_lifecycle_with_encryption() {
    let db = setup();

    let provider = ProviderRecord {
        id: "provider-anthropic".to_string(),
        name: "Anthropic".to_string(),
        provider_type: "anthropic".to_string(),
        base_url: "https://api.anthropic.com".to_string(),
        api_key_set: true,
        models: Some("[{\"id\":\"claude-4-sonnet\"}]".to_string()),
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // Create with encrypted API key
    db.upsert_provider_with_key(&provider, Some("sk-ant-secret-key-123"))
        .expect("upsert provider with key");

    // List
    let providers = db.list_providers().expect("list providers");
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].id, "provider-anthropic");
    assert!(providers[0].api_key_set);

    // Retrieve decrypted key
    let key = db
        .get_provider_api_key("provider-anthropic")
        .expect("get api key");
    assert_eq!(key, Some("sk-ant-secret-key-123".to_string()));

    // Get by ID
    let fetched = db.get_provider("provider-anthropic").expect("get provider");
    assert_eq!(fetched.name, "Anthropic");

    // Delete
    db.delete_provider("provider-anthropic")
        .expect("delete provider");
    assert!(db.get_provider("provider-anthropic").is_err());
}

// ── Checkpoint + Rewind ────────────────────────────────────

#[test]
fn test_checkpoint_create_list_rewind() {
    let db = setup();

    // Create session with messages
    let session = db
        .create_session("Checkpoint Test", "model", "provider")
        .unwrap();
    let msg1 = db
        .add_message(&session.id, "user", "msg1", None, None, None)
        .unwrap();
    let msg2 = db
        .add_message(&session.id, "assistant", "reply1", None, None, None)
        .unwrap();
    let _msg3 = db
        .add_message(&session.id, "user", "msg2", None, None, None)
        .unwrap();
    let _msg4 = db
        .add_message(&session.id, "assistant", "reply2", None, None, None)
        .unwrap();

    // Create checkpoint at msg2
    let cp = db
        .create_checkpoint(&session.id, &msg2.id, "After first exchange", 100)
        .expect("create checkpoint");
    assert_eq!(cp.session_id, session.id);
    assert_eq!(cp.message_id, msg2.id);
    assert_eq!(cp.summary, "After first exchange");
    assert_eq!(cp.token_count, 100);

    // List checkpoints
    let cps = db.list_checkpoints(&session.id).expect("list checkpoints");
    assert_eq!(cps.len(), 1);
    assert_eq!(cps[0].id, cp.id);

    // Rewind to checkpoint
    let removed = db.rewind_to_checkpoint(&cp.id).expect("rewind");
    assert!(removed > 0);

    // Verify messages after rewind — msg3 and msg4 should be gone
    let remaining = db
        .get_session_messages(&session.id)
        .expect("messages after rewind");
    assert!(remaining.len() < 4);
    assert!(remaining.iter().any(|m| m.id == msg1.id));
    assert!(remaining.iter().any(|m| m.id == msg2.id));
}

// ── Multi-Session Isolation ────────────────────────────────

#[test]
fn test_multi_session_isolation() {
    let db = setup();

    let s1 = db.create_session("Session 1", "m1", "p1").unwrap();
    let s2 = db.create_session("Session 2", "m2", "p2").unwrap();

    db.add_message(&s1.id, "user", "for session 1", None, None, None)
        .unwrap();
    db.add_message(&s2.id, "user", "for session 2", None, None, None)
        .unwrap();

    let msgs1 = db.get_session_messages(&s1.id).unwrap();
    let msgs2 = db.get_session_messages(&s2.id).unwrap();

    assert_eq!(msgs1.len(), 1);
    assert_eq!(msgs2.len(), 1);
    assert_eq!(msgs1[0].content, "for session 1");
    assert_eq!(msgs2[0].content, "for session 2");

    // Delete session 1 should not affect session 2
    db.delete_session(&s1.id).unwrap();
    assert_eq!(db.get_session_messages(&s2.id).unwrap().len(), 1);
}

// ── Full Chat Flow (E2E simulation) ────────────────────────

#[test]
fn test_full_chat_flow() {
    let db = setup();

    // 1. Create session
    let session = db
        .create_session("Full Flow", "claude-4-sonnet", "anthropic")
        .unwrap();
    let sid = &session.id;

    // 2. User sends message
    let user_msg = db
        .add_message(sid, "user", "Write a Rust hello world", None, None, None)
        .unwrap();

    // 3. Assistant responds
    let asst_msg = db
        .add_message(
            sid,
            "assistant",
            "Here's a simple Rust hello world:\n\n```rust\nfn main() {\n    println!(\"Hello, world!\");\n}\n```",
            Some("claude-4-sonnet"),
            None,
            None,
        )
        .unwrap();

    // 4. Create checkpoint
    let cp = db
        .create_checkpoint(sid, &asst_msg.id, "After code generation", 150)
        .unwrap();

    // 5. Continue conversation
    db.add_message(sid, "user", "Add error handling", None, None, None)
        .unwrap();
    db.add_message(
        sid,
        "assistant",
        "Updated with Result type...",
        Some("claude-4-sonnet"),
        None,
        None,
    )
    .unwrap();

    // 6. Verify 4 messages total
    let msgs = db.get_session_messages(sid).unwrap();
    assert_eq!(msgs.len(), 4);

    // 7. Rewind to checkpoint
    let removed = db.rewind_to_checkpoint(&cp.id).unwrap();
    assert_eq!(removed, 2); // 2 messages removed after checkpoint

    // 8. Verify state after rewind
    let msgs_after = db.get_session_messages(sid).unwrap();
    assert_eq!(msgs_after.len(), 2);
    assert_eq!(msgs_after[0].id, user_msg.id);
    assert_eq!(msgs_after[1].id, asst_msg.id);

    // 9. Update session title
    db.update_session_title(sid, "Rust Hello World").unwrap();
    let s = db.get_session(sid).unwrap();
    assert_eq!(s.title, "Rust Hello World");
}

// ── Multiple Providers ─────────────────────────────────────

#[test]
fn test_multiple_providers() {
    let db = setup();

    let p1 = ProviderRecord {
        id: "p-openai".to_string(),
        name: "OpenAI".to_string(),
        provider_type: "openai".to_string(),
        base_url: "https://api.openai.com".to_string(),
        api_key_set: true,
        models: None,
        enabled: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let p2 = ProviderRecord {
        id: "p-anthropic".to_string(),
        name: "Anthropic".to_string(),
        provider_type: "anthropic".to_string(),
        base_url: "https://api.anthropic.com".to_string(),
        api_key_set: false,
        models: None,
        enabled: false,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    db.upsert_provider_with_key(&p1, Some("sk-openai-key"))
        .unwrap();
    db.upsert_provider_with_key(&p2, None).unwrap();

    let providers = db.list_providers().unwrap();
    assert_eq!(providers.len(), 2);

    // Only OpenAI has key set
    let key1 = db.get_provider_api_key("p-openai").unwrap();
    assert_eq!(key1, Some("sk-openai-key".to_string()));

    let key2 = db.get_provider_api_key("p-anthropic").unwrap();
    assert_eq!(key2, None);
}

// ── Settings Edge Cases ────────────────────────────────────

#[test]
fn test_settings_unicode_and_long_values() {
    let db = setup();

    // Unicode keys/values
    db.set_setting("主题", "深色模式🌙").unwrap();
    let val = db.get_setting("主题").unwrap();
    assert_eq!(val, Some("深色模式🌙".to_string()));

    // Long JSON value
    let long_value = serde_json::json!({
        "models": ["gpt-5.2", "claude-4-sonnet", "gemini-3"],
        "defaults": {"temperature": 0.7}
    })
    .to_string();
    db.set_setting("llm_config", &long_value).unwrap();
    let retrieved = db.get_setting("llm_config").unwrap();
    assert_eq!(retrieved, Some(long_value));
}

// ── Session with Working Dir ───────────────────────────────

#[test]
fn test_session_with_working_dir_and_mode() {
    let db = setup();

    let session = db.create_session("Project X", "gpt-5.2", "openai").unwrap();
    assert_eq!(session.mode, "code"); // default mode
    assert!(session.working_dir.is_none());

    let sid = &session.id;

    // Add tool-use message
    let tool_msg = db
        .add_message(
            sid,
            "assistant",
            "Let me check the files.",
            None,
            Some("[{\"type\":\"tool_use\",\"id\":\"tu1\",\"name\":\"list_files\"}]"),
            None,
        )
        .unwrap();
    assert!(tool_msg.tool_calls.is_some());

    let tool_result = db
        .add_message(
            sid,
            "tool",
            "[\"main.rs\", \"lib.rs\"]",
            None,
            None,
            Some("tu1"),
        )
        .unwrap();
    assert_eq!(tool_result.role, "tool");
    assert_eq!(tool_result.tool_call_id, Some("tu1".to_string()));
}
