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
    devpilot_git::get_log(&repo_path, max_count.unwrap_or(50)).map_err(|e| e.to_string())
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

// ── Worktree ──────────────────────────────────────────────

/// List all worktrees in the repository.
#[tauri::command]
pub fn git_list_worktrees(repo_path: String) -> Result<Vec<devpilot_git::WorktreeInfo>, String> {
    devpilot_git::list_worktrees(&repo_path).map_err(|e| e.to_string())
}

/// Add a new worktree.
#[tauri::command]
pub fn git_add_worktree(
    repo_path: String,
    name: String,
    path: String,
    branch: Option<String>,
) -> Result<(), String> {
    devpilot_git::add_worktree(&repo_path, &name, &path, branch.as_deref())
        .map_err(|e| e.to_string())
}

/// Remove a worktree by name.
#[tauri::command]
pub fn git_remove_worktree(repo_path: String, name: String) -> Result<(), String> {
    devpilot_git::remove_worktree(&repo_path, &name).map_err(|e| e.to_string())
}

// ── Remote ────────────────────────────────────────────────

/// Fetch from a remote.
#[tauri::command]
pub fn git_fetch(repo_path: String, remote: String) -> Result<(), String> {
    devpilot_git::fetch(&repo_path, &remote).map_err(|e| e.to_string())
}

/// Pull (fetch + merge) from a remote branch.
#[tauri::command]
pub fn git_pull(repo_path: String, remote: String, branch: String) -> Result<(), String> {
    devpilot_git::pull(&repo_path, &remote, &branch).map_err(|e| e.to_string())
}

/// Push current branch to remote.
#[tauri::command]
pub fn git_push(repo_path: String, remote: String, branch: String) -> Result<(), String> {
    devpilot_git::push(&repo_path, &remote, &branch).map_err(|e| e.to_string())
}

// ── Staging (Add / Reset) ────────────────────────────────

/// Stage specific files (git add <paths>).
#[tauri::command]
pub fn git_add_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    devpilot_git::add_files(&repo_path, &paths).map_err(|e| e.to_string())
}

/// Stage all changes (git add -A).
#[tauri::command]
pub fn git_add_all(repo_path: String) -> Result<(), String> {
    devpilot_git::add_all(&repo_path).map_err(|e| e.to_string())
}

/// Unstage specific files (git reset HEAD -- <paths>).
#[tauri::command]
pub fn git_unstage_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    devpilot_git::unstage_files(&repo_path, &paths).map_err(|e| e.to_string())
}

// ── Blame ──────────────────────────────────────────────────

/// Get per-file blame with line-level commit info.
#[tauri::command]
pub fn git_blame(
    repo_path: String,
    file_path: String,
) -> Result<Vec<devpilot_git::GitBlameLine>, String> {
    devpilot_git::blame_file(&repo_path, &file_path).map_err(|e| e.to_string())
}

// ── Diff between two commits ──────────────────────────────

/// Show diff between any two refs (commits, branches, tags).
#[tauri::command]
pub fn git_diff_commits(
    repo_path: String,
    from_ref: String,
    to_ref: String,
) -> Result<Vec<devpilot_git::GitDiffResult>, String> {
    devpilot_git::diff_commits(&repo_path, &from_ref, &to_ref).map_err(|e| e.to_string())
}

// ── Discard changes ──────────────────────────────────────

/// Discard working tree changes for specific files or all files.
#[tauri::command]
pub fn git_discard_changes(repo_path: String, paths: Option<Vec<String>>) -> Result<(), String> {
    devpilot_git::discard_changes(&repo_path, paths.as_deref()).map_err(|e| e.to_string())
}

// ── Revert commit ────────────────────────────────────────

/// Create a new commit that undoes a previous commit.
#[tauri::command]
pub fn git_revert_commit(repo_path: String, commit_hash: String) -> Result<String, String> {
    devpilot_git::revert_commit(&repo_path, &commit_hash).map_err(|e| e.to_string())
}

// ── Merge branch ─────────────────────────────────────────

/// Merge a branch into the current HEAD.
#[tauri::command]
pub fn git_merge_branch(repo_path: String, branch: String) -> Result<(), String> {
    devpilot_git::merge_branch(&repo_path, &branch).map_err(|e| e.to_string())
}

// ── Stash list & apply ───────────────────────────────────

/// List all stash entries.
#[tauri::command]
pub fn git_stash_list(repo_path: String) -> Result<Vec<devpilot_git::GitStashEntry>, String> {
    devpilot_git::stash_list(&repo_path).map_err(|e| e.to_string())
}

/// Apply a stash entry by index (without dropping it).
#[tauri::command]
pub fn git_stash_apply(repo_path: String, stash_index: Option<usize>) -> Result<(), String> {
    devpilot_git::stash_apply(&repo_path, stash_index.unwrap_or(0)).map_err(|e| e.to_string())
}
