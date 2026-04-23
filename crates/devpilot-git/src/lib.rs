//! # devpilot-git
//!
//! Git operations for the DevPilot desktop app. Provides status, diff, log,
//! commit, stash, and branch management via `git2` (libgit2).
//!
//! All types are `Serialize + Deserialize` for Tauri IPC compatibility.

use serde::{Deserialize, Serialize};
use std::path::Path;

// ── Error ──────────────────────────────────────────────

/// Errors that can occur during Git operations.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("Repository not found: {0}")]
    RepoNotFound(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Git error: {0}")]
    GitError(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
}

/// Alias for results in this crate.
pub type GitResult<T> = Result<T, GitError>;

fn map_git_err(e: git2::Error) -> GitError {
    GitError::GitError(e.message().to_string())
}

// ── File Status ────────────────────────────────────────

/// Status of a single file in the working tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitFileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
    Unmerged,
    Ignored,
}

/// A single file status entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub status: GitFileStatus,
}

/// Full status result including current branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusResult {
    /// Current branch name (None if HEAD is detached).
    pub branch: Option<String>,
    /// File status entries.
    pub entries: Vec<GitStatusEntry>,
}

// ── Diff ───────────────────────────────────────────────

/// Kind of diff line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffLineKind {
    Context,
    Add,
    Delete,
}

/// A single line in a diff hunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffLine {
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub content: String,
    pub kind: DiffLineKind,
}

/// A single hunk in a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffHunk {
    pub old_start: u32,
    pub new_start: u32,
    pub lines: Vec<GitDiffLine>,
}

/// Diff result for a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiffResult {
    pub path: String,
    pub hunks: Vec<GitDiffHunk>,
}

// ── Log ────────────────────────────────────────────────

/// A single commit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub time: String,
}

// ── Branch ─────────────────────────────────────────────

/// A single branch reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

// ── Helper ─────────────────────────────────────────────

fn open_repo(repo_path: &str) -> GitResult<git2::Repository> {
    let path = Path::new(repo_path);
    if !path.exists() {
        return Err(GitError::RepoNotFound(repo_path.to_string()));
    }
    git2::Repository::discover(path).map_err(|e| {
        if e.code() == git2::ErrorCode::NotFound {
            GitError::RepoNotFound(repo_path.to_string())
        } else {
            map_git_err(e)
        }
    })
}

fn status_to_enum(status: git2::Status) -> GitFileStatus {
    if status.is_wt_new() || status.is_index_new() {
        GitFileStatus::Added
    } else if status.is_wt_deleted() || status.is_index_deleted() {
        GitFileStatus::Deleted
    } else if status.is_wt_renamed() || status.is_index_renamed() {
        GitFileStatus::Renamed
    } else if status.is_conflicted() {
        GitFileStatus::Unmerged
    } else if status.contains(git2::Status::WT_NEW) {
        GitFileStatus::Untracked
    } else if status.is_ignored() {
        GitFileStatus::Ignored
    } else {
        GitFileStatus::Modified
    }
}

fn extract_diff_results(diff: &git2::Diff) -> GitResult<Vec<GitDiffResult>> {
    use std::cell::RefCell;

    let mut results: Vec<GitDiffResult> = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        results.push(GitDiffResult {
            path,
            hunks: Vec::new(),
        });
    }

    let file_count = results.len();
    let file_hunks: RefCell<Vec<Vec<GitDiffHunk>>> = RefCell::new(vec![Vec::new(); file_count]);
    let file_idx: RefCell<usize> = RefCell::new(0);
    let hunk_lines: RefCell<Vec<GitDiffLine>> = RefCell::new(Vec::new());
    let hunk_old_start: RefCell<u32> = RefCell::new(0);
    let hunk_new_start: RefCell<u32> = RefCell::new(0);

    diff.foreach(
        &mut |delta, _| {
            let p = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|pp| pp.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut idx = file_idx.borrow_mut();
            for (i, r) in results.iter().enumerate() {
                if p == r.path {
                    *idx = i;
                    break;
                }
            }
            if *idx >= file_count {
                *idx = 0;
            }
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            // Flush previous hunk
            let lines = hunk_lines.borrow();
            if !lines.is_empty() {
                let idx = *file_idx.borrow();
                if idx < file_count {
                    file_hunks.borrow_mut()[idx].push(GitDiffHunk {
                        old_start: *hunk_old_start.borrow(),
                        new_start: *hunk_new_start.borrow(),
                        lines: lines.clone(),
                    });
                }
            }
            drop(lines);
            *hunk_old_start.borrow_mut() = hunk.old_start();
            *hunk_new_start.borrow_mut() = hunk.new_start();
            hunk_lines.borrow_mut().clear();
            true
        }),
        Some(&mut |_delta: git2::DiffDelta,
                   _hunk: Option<git2::DiffHunk>,
                   line: git2::DiffLine| {
            let kind = match line.origin() {
                '+' => DiffLineKind::Add,
                '-' => DiffLineKind::Delete,
                _ => DiffLineKind::Context,
            };
            let old_no = line.old_lineno().filter(|&n| n != 0);
            let new_no = line.new_lineno().filter(|&n| n != 0);
            hunk_lines.borrow_mut().push(GitDiffLine {
                old_line: old_no,
                new_line: new_no,
                content: String::from_utf8_lossy(line.content()).to_string(),
                kind,
            });
            true
        }),
    )
    .map_err(map_git_err)?;

    // Flush last hunk
    {
        let lines = hunk_lines.borrow();
        if !lines.is_empty() {
            let idx = *file_idx.borrow();
            if idx < file_count {
                file_hunks.borrow_mut()[idx].push(GitDiffHunk {
                    old_start: *hunk_old_start.borrow(),
                    new_start: *hunk_new_start.borrow(),
                    lines: lines.clone(),
                });
            }
        }
    }

    let file_hunks = file_hunks.into_inner();
    for (i, hunks) in file_hunks.into_iter().enumerate() {
        if i < results.len() {
            results[i].hunks = hunks;
        }
    }

    Ok(results)
}

// ── Public API ─────────────────────────────────────────

/// Get repository status: current branch + file status entries.
pub fn get_status(repo_path: &str) -> GitResult<GitStatusResult> {
    let repo = open_repo(repo_path)?;

    // Get branch name
    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    // Get statuses
    let statuses = repo
        .statuses(Some(
            git2::StatusOptions::new()
                .include_untracked(true)
                .recurse_untracked_dirs(true),
        ))
        .map_err(map_git_err)?;

    let entries = statuses
        .iter()
        .filter_map(|s| {
            let path = s.path()?.to_string();
            let status = status_to_enum(s.status());
            Some(GitStatusEntry { path, status })
        })
        .collect();

    Ok(GitStatusResult { branch, entries })
}

/// Get unstaged diff (working tree vs index).
pub fn get_diff_unstaged(repo_path: &str) -> GitResult<Vec<GitDiffResult>> {
    let repo = open_repo(repo_path)?;
    let mut opts = git2::DiffOptions::new();
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(map_git_err)?;
    extract_diff_results(&diff)
}

/// Get staged diff (index vs HEAD).
pub fn get_diff_staged(repo_path: &str) -> GitResult<Vec<GitDiffResult>> {
    let repo = open_repo(repo_path)?;
    let head = repo.head().map_err(map_git_err)?;
    let parent = head.peel_to_tree().map_err(map_git_err)?;
    let index = repo.index().map_err(map_git_err)?;
    let mut opts = git2::DiffOptions::new();
    let diff = repo
        .diff_tree_to_index(Some(&parent), Some(&index), Some(&mut opts))
        .map_err(map_git_err)?;
    extract_diff_results(&diff)
}

/// Get commit log.
pub fn get_log(repo_path: &str, max_count: usize) -> GitResult<Vec<GitLogEntry>> {
    let repo = open_repo(repo_path)?;
    let mut revwalk = repo.revwalk().map_err(map_git_err)?;
    revwalk.push_head().map_err(map_git_err)?;

    let entries: Vec<GitLogEntry> = revwalk
        .take(max_count)
        .filter_map(|oid| {
            let commit = repo.find_commit(oid.ok()?).ok()?;
            let hash = commit.id().to_string();
            let short_hash = hash.get(..7)?.to_string();
            let message = commit.message()?.to_string();
            let lines: Vec<&str> = message.lines().collect();
            let first_line = lines.first().unwrap_or(&"").to_string();
            let author = commit.author().name().unwrap_or("unknown").to_string();
            let time = {
                let secs = commit.time().seconds();
                chrono::DateTime::from_timestamp(secs, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_default()
            };
            Some(GitLogEntry {
                hash,
                short_hash,
                message: first_line,
                author,
                time,
            })
        })
        .collect();

    Ok(entries)
}

/// Stage all changes and commit with the given message. Returns the commit hash.
pub fn commit_all(repo_path: &str, message: &str) -> GitResult<String> {
    let repo = open_repo(repo_path)?;

    // Stage all
    let mut index = repo.index().map_err(map_git_err)?;
    index
        .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
        .map_err(map_git_err)?;
    index.write().map_err(map_git_err)?;

    // Get tree
    let tree_id = index.write_tree().map_err(map_git_err)?;
    let tree = repo.find_tree(tree_id).map_err(map_git_err)?;

    // Get parent commit (or create initial commit)
    let head = repo.head().ok();
    let parents: Vec<git2::Commit> = if let Some(h) = &head {
        let parent = h.peel_to_commit().map_err(map_git_err)?;
        vec![parent]
    } else {
        vec![]
    };

    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("DevPilot", "devpilot@local").unwrap());

    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
        .map_err(map_git_err)?;

    Ok(commit_id.to_string())
}

/// List local and remote branches.
pub fn get_branches(repo_path: &str) -> GitResult<Vec<GitBranch>> {
    let repo = open_repo(repo_path)?;
    let current_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut result = Vec::new();

    // Local branches
    let locals = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(map_git_err)?;
    for b in locals {
        let (branch, _) = b.map_err(map_git_err)?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        let is_current = current_branch.as_deref() == Some(&name);
        result.push(GitBranch {
            name,
            is_current,
            is_remote: false,
        });
    }

    // Remote branches
    let remotes = repo
        .branches(Some(git2::BranchType::Remote))
        .map_err(map_git_err)?;
    for b in remotes {
        let (branch, _) = b.map_err(map_git_err)?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        // Skip HEAD symbolic refs
        if name.ends_with("/HEAD") {
            continue;
        }
        result.push(GitBranch {
            name,
            is_current: false,
            is_remote: true,
        });
    }

    Ok(result)
}

/// Stash save (optionally with a message).
pub fn stash_save(repo_path: &str, message: Option<&str>) -> GitResult<()> {
    let mut repo = open_repo(repo_path)?;
    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("DevPilot", "devpilot@local").unwrap());

    if let Some(msg) = message {
        repo.stash_save2(&sig, Some(msg), None)
            .map_err(map_git_err)?;
    } else {
        repo.stash_save(&sig, "stash", None).map_err(map_git_err)?;
    }

    Ok(())
}

/// Stash pop (apply and drop the latest stash).
pub fn stash_pop(repo_path: &str) -> GitResult<()> {
    let mut repo = open_repo(repo_path)?;
    let index = 0usize;
    repo.stash_pop(index, None).map_err(map_git_err)?;
    Ok(())
}

/// Switch to an existing branch.
pub fn switch_branch(repo_path: &str, branch: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let obj = repo
        .revparse_single(&format!("refs/heads/{branch}"))
        .map_err(map_git_err)?;
    repo.checkout_tree(&obj, None).map_err(map_git_err)?;
    repo.set_head(&format!("refs/heads/{branch}"))
        .map_err(map_git_err)?;
    Ok(())
}

/// Create a new branch from HEAD.
pub fn create_branch(repo_path: &str, branch: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let head = repo.head().map_err(map_git_err)?;
    let target = head
        .target()
        .ok_or_else(|| GitError::GitError("No HEAD target".into()))?;
    let commit = repo.find_commit(target).map_err(map_git_err)?;
    repo.branch(branch, &commit, false).map_err(map_git_err)?;
    Ok(())
}

// ── Worktree ─────────────────────────────────────────────

/// A git worktree entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    /// Worktree directory path.
    pub path: String,
    /// Branch name (HEAD).
    pub branch: String,
    /// Whether this is the main worktree.
    pub is_main: bool,
    /// Whether the worktree is prunable.
    pub is_prunable: bool,
}

/// List all worktrees in the repository.
pub fn list_worktrees(repo_path: &str) -> GitResult<Vec<WorktreeInfo>> {
    let repo = open_repo(repo_path)?;
    let main_path = repo.path().to_string_lossy().to_string();
    let mut result = Vec::new();
    for wt_name in repo.worktrees().map_err(map_git_err)?.iter() {
        let name = wt_name.unwrap_or("");
        let wt = repo.find_worktree(name).map_err(map_git_err)?;
        let path = wt.path().to_string_lossy().to_string();
        let is_main = path == main_path;
        let is_prunable = wt.is_prunable(None).unwrap_or(false);
        result.push(WorktreeInfo {
            path,
            branch: wt.name().unwrap_or("").to_string(),
            is_main,
            is_prunable,
        });
    }
    Ok(result)
}

/// Add a new worktree for the given branch at the specified path.
pub fn add_worktree(
    repo_path: &str,
    name: &str,
    path: &str,
    branch: Option<&str>,
) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let target_path = Path::new(path);

    if let Some(ref_branch) = branch {
        let ref_name = format!("refs/heads/{ref_branch}");
        let r = repo.find_reference(&ref_name).map_err(map_git_err)?;
        let mut opts = git2::WorktreeAddOptions::new();
        opts.reference(Some(&r));
        repo.worktree(name, target_path, Some(&opts))
            .map_err(map_git_err)?;
    } else {
        repo.worktree(name, target_path, None)
            .map_err(map_git_err)?;
    }

    Ok(())
}

/// Remove a worktree by name.
pub fn remove_worktree(repo_path: &str, name: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let wt = repo.find_worktree(name).map_err(map_git_err)?;
    wt.prune(None).map_err(map_git_err)?;
    Ok(())
}

// ── Remote ──────────────────────────────────────────────

/// Fetch from the default remote (origin).
pub fn fetch(repo_path: &str, remote: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let mut remote = repo.find_remote(remote).map_err(map_git_err)?;
    remote
        .fetch(&[] as &[&str], None, None)
        .map_err(map_git_err)?;
    Ok(())
}

/// Pull (fetch + merge) from the default remote.
pub fn pull(repo_path: &str, remote: &str, branch: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;

    // Fetch
    let mut rem = repo.find_remote(remote).map_err(map_git_err)?;
    rem.fetch(&[] as &[&str], None, None).map_err(map_git_err)?;

    // Merge fetch head into current branch
    let fetch_head = repo.find_reference("FETCH_HEAD").map_err(map_git_err)?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(map_git_err)?;

    let (analysis, _) = repo.merge_analysis(&[&fetch_commit]).map_err(map_git_err)?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if analysis.is_fast_forward() {
        let refname = format!("refs/heads/{branch}");
        let mut reference = repo.find_reference(&refname).map_err(map_git_err)?;
        reference
            .set_target(fetch_commit.id(), "Fast-forward")
            .map_err(map_git_err)?;
        repo.set_head(&refname).map_err(map_git_err)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(map_git_err)?;
    } else {
        // Normal merge — create merge commit
        repo.merge(&[&fetch_commit], None, None)
            .map_err(map_git_err)?;

        let head = repo.head().map_err(map_git_err)?;
        let head_commit = head
            .target()
            .ok_or_else(|| GitError::GitError("No HEAD".into()))?;
        let commit = repo.find_commit(head_commit).map_err(map_git_err)?;

        let tree_id = repo
            .index()
            .map_err(map_git_err)?
            .write_tree()
            .map_err(map_git_err)?;
        let tree = repo.find_tree(tree_id).map_err(map_git_err)?;

        let sig = repo
            .signature()
            .unwrap_or_else(|_| git2::Signature::now("DevPilot", "devpilot@local").unwrap());

        let parents: Vec<&git2::Commit> = vec![&commit];
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("Merge remote-tracking branch '{remote}/{branch}'"),
            &tree,
            &parents,
        )
        .map_err(map_git_err)?;

        repo.cleanup_state().map_err(map_git_err)?;
    }

    Ok(())
}

/// Push current branch to remote.
pub fn push(repo_path: &str, remote: &str, branch: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let mut remote = repo.find_remote(remote).map_err(map_git_err)?;
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote.push(&[&refspec], None).map_err(map_git_err)?;
    Ok(())
}

// ── Staging (Add / Reset) ────────────────────────────────

/// Stage specific files (git add <paths>).
pub fn add_files(repo_path: &str, paths: &[String]) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let mut index = repo.index().map_err(map_git_err)?;
    for p in paths {
        index.add_path(Path::new(p)).map_err(map_git_err)?;
    }
    index.write().map_err(map_git_err)?;
    Ok(())
}

/// Stage all changes (git add -A).
pub fn add_all(repo_path: &str) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let mut index = repo.index().map_err(map_git_err)?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(map_git_err)?;
    index.write().map_err(map_git_err)?;
    Ok(())
}

/// Unstage specific files (git reset HEAD -- <paths>).
///
/// This uses `git2::Repository::reset_default` which performs a mixed reset
/// of the specified paths, effectively unstaging them from the index.
pub fn unstage_files(repo_path: &str, paths: &[String]) -> GitResult<()> {
    let repo = open_repo(repo_path)?;
    let head = repo.head().map_err(map_git_err)?;
    let head_tree = head.peel_to_tree().map_err(map_git_err)?;

    // Collect path specs for the reset
    let path_specs: Vec<&Path> = paths.iter().map(|p| Path::new(p.as_str())).collect();

    // reset_default performs a mixed reset of only the specified paths,
    // which is equivalent to `git reset HEAD -- <paths>`
    let head_obj = head_tree.as_object();
    repo.reset_default(Some(head_obj), &path_specs)
        .map_err(map_git_err)?;

    Ok(())
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_file_status_serde_roundtrip() {
        for status in [
            GitFileStatus::Modified,
            GitFileStatus::Added,
            GitFileStatus::Deleted,
            GitFileStatus::Renamed,
            GitFileStatus::Untracked,
            GitFileStatus::Unmerged,
            GitFileStatus::Ignored,
        ] {
            let json = serde_json::to_string(&status).unwrap();
            let parsed: GitFileStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(status, parsed);
        }
    }

    #[test]
    fn git_status_result_serde() {
        let result = GitStatusResult {
            branch: Some("main".into()),
            entries: vec![
                GitStatusEntry {
                    path: "src/main.rs".into(),
                    status: GitFileStatus::Modified,
                },
                GitStatusEntry {
                    path: "new_file.rs".into(),
                    status: GitFileStatus::Untracked,
                },
            ],
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: GitStatusResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.branch, Some("main".into()));
        assert_eq!(parsed.entries.len(), 2);
    }

    #[test]
    fn git_log_entry_serde() {
        let entry = GitLogEntry {
            hash: "abc123def456".repeat(6),
            short_hash: "abc123d".into(),
            message: "feat: add git crate".into(),
            author: "devpilot".into(),
            time: "2026-04-23 08:00".into(),
        };
        let json = serde_json::to_string(&entry).unwrap();
        let parsed: GitLogEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.short_hash, "abc123d");
    }

    #[test]
    fn git_diff_line_serde() {
        let line = GitDiffLine {
            old_line: Some(10),
            new_line: Some(10),
            content: "fn main() {\n".into(),
            kind: DiffLineKind::Context,
        };
        let json = serde_json::to_string(&line).unwrap();
        let parsed: GitDiffLine = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.kind, DiffLineKind::Context);
    }

    #[test]
    fn git_branch_serde() {
        let branch = GitBranch {
            name: "feature/git".into(),
            is_current: false,
            is_remote: false,
        };
        let json = serde_json::to_string(&branch).unwrap();
        let parsed: GitBranch = serde_json::from_str(&json).unwrap();
        assert!(!parsed.is_current);
    }

    #[test]
    fn git_error_display() {
        let e = GitError::RepoNotFound("/no/repo".into());
        assert!(e.to_string().contains("/no/repo"));

        let e = GitError::GitError("some error".into());
        assert!(e.to_string().contains("some error"));

        let e = GitError::InvalidPath("bad path".into());
        assert!(e.to_string().contains("bad path"));
    }

    #[test]
    fn get_status_nonexistent_path() {
        let result = get_status("/nonexistent/path/to/repo");
        assert!(result.is_err());
        match result.unwrap_err() {
            GitError::RepoNotFound(_) => {}
            other => panic!("Expected RepoNotFound, got: {other}"),
        }
    }

    #[test]
    fn get_log_nonexistent_path() {
        let result = get_log("/nonexistent/path/to/repo", 10);
        assert!(result.is_err());
    }

    #[test]
    fn create_branch_nonexistent_repo() {
        let result = create_branch("/nonexistent/path/to/repo", "test-branch");
        assert!(result.is_err());
    }
}
