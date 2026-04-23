//! Tauri IPC commands for Git operations.
//!
//! Thin wrappers around `devpilot_git` functions that expose Git status, diff,
//! log, commit, stash, and branch operations to the frontend.

use devpilot_git;

// ── Status ────────────────────────────────────────────────

/// Get repository status: current branch + changed files.
#[tauri::command]
pub fn git_status(repo_path: String) -> Result<devpilot_git::GitStatusResult, String> {
    devpilot_git::get_status(&repo_path).map_err(|e| e.to_string())
}

// ── Diff ───────────────────────────────────────────────────

/// Get unstaged diff (working tree vs index).
#[tauri::command]
pub fn git_diff_unstaged(repo_path: String) -> Result<Vec<devpilot_git::GitDiffResult>, String> {
    devpilot_git::get_diff_unstaged(&repo_path).map_err(|e| e.to_string())
}

/// Get staged diff (index vs HEAD).
#[tauri::command]
pub fn git_diff_staged(repo_path: String) -> Result<Vec<devpilot_git::GitDiffResult>, String> {
    devpilot_git::get_diff_staged(&repo_path).map_err(|e| e.to_string())
}

// ── Log ────────────────────────────────────────────────────

/// Get commit log entries.
#[tauri::command]
pub fn git_log(
    repo_path: String,
    max_count: Option<usize>,
) -> Result<Vec<devpilot_git::GitLogEntry>, String> {
    devpilot_git::get_log(&repo_path, max_count.unwrap_or(50))
        .map_err(|e| e.to_string())
}

// ── Commit ─────────────────────────────────────────────────

/// Stage all changes and commit with a message. Returns the commit hash.
#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    devpilot_git::commit_all(&repo_path, &message).map_err(|e| e.to_string())
}

// ── Branch ─────────────────────────────────────────────────

/// List all local and remote branches.
#[tauri::command]
pub fn git_branches(repo_path: String) -> Result<Vec<devpilot_git::GitBranch>, String> {
    devpilot_git::get_branches(&repo_path).map_err(|e| e.to_string())
}

/// Switch to an existing branch.
#[tauri::command]
pub fn git_switch_branch(repo_path: String, branch: String) -> Result<(), String> {
    devpilot_git::switch_branch(&repo_path, &branch).map_err(|e| e.to_string())
}

/// Create a new branch from HEAD.
#[tauri::command]
pub fn git_create_branch(repo_path: String, branch: String) -> Result<(), String> {
    devpilot_git::create_branch(&repo_path, &branch).map_err(|e| e.to_string())
}

// ── Stash ──────────────────────────────────────────────────

/// Stash save (optionally with a message).
#[tauri::command]
pub fn git_stash_save(repo_path: String, message: Option<String>) -> Result<(), String> {
    devpilot_git::stash_save(&repo_path, message.as_deref()).map_err(|e| e.to_string())
}

/// Stash pop (apply and drop the latest stash).
#[tauri::command]
pub fn git_stash_pop(repo_path: String) -> Result<(), String> {
    devpilot_git::stash_pop(&repo_path).map_err(|e| e.to_string())
}
