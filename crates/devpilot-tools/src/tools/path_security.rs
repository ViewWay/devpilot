//! Path traversal prevention — shared path validation for file tools.
//!
//! Provides `validate_path()` which canonicalises the requested path,
//! resolves symlinks, and ensures the result stays within the allowed
//! working directory.

use std::path::{Path, PathBuf};

/// Validate that a user-supplied `path` resolves to a location inside `workdir`.
///
/// Steps performed:
/// 1. If `path` is relative, join it to `workdir`.
/// 2. Canonicalise the `workdir` (resolves symlinks, removes `..`, etc.).
/// 3. Canonicalise the resolved path (if it exists) **or** normalise it
///    lexically and verify it doesn't escape `workdir`.
/// 4. Ensure the final path starts with the canonical `workdir`.
///
/// Returns the validated, canonicalised `PathBuf` on success.
pub fn validate_path(path: &str, workdir: &str) -> Result<PathBuf, String> {
    let workdir = Path::new(workdir);

    // Canonicalise workdir first so we have a reliable anchor.
    // If workdir doesn't exist yet (unlikely but possible), fall back to
    // lexically-normalised absolute form.
    let canonical_workdir = match workdir.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let p = normalize_to_absolute(workdir);
            if !p.is_absolute() {
                return Err(format!(
                    "Working directory is not absolute: {}",
                    workdir.display()
                ));
            }
            p
        }
    };

    // Resolve the requested path
    let resolved = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else {
        canonical_workdir.join(path)
    };

    // Try to canonicalise (resolves symlinks + `..`). If the file doesn't
    // exist yet (write case), fall back to lexical normalisation.
    let canonical_path = match resolved.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // File doesn't exist yet — normalise lexically and check.
            let normalised = normalize_to_absolute(&resolved);
            if !normalised.is_absolute() {
                return Err(format!(
                    "Resolved path is not absolute: {}",
                    resolved.display()
                ));
            }
            normalised
        }
    };

    // Ensure the canonical path starts with the canonical workdir.
    // As a fallback (e.g. on macOS where /tmp → /private/tmp and the file
    // doesn't exist yet so canonicalisation fails), also check against the
    // original workdir string.
    if canonical_path.starts_with(&canonical_workdir)
        || canonical_path.starts_with(workdir)
    {
        Ok(canonical_path)
    } else {
        Err(format!(
            "Path traversal detected: '{}' is outside working directory '{}'",
            canonical_path.display(),
            canonical_workdir.display(),
        ))
    }
}

/// Lexically normalise a path and make it absolute (resolve `.` and `..`).
fn normalize_to_absolute(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for comp in path.components() {
        match comp {
            std::path::Component::CurDir => { /* skip `.` */ }
            std::path::Component::ParentDir => {
                // Pop the last component, but don't go above root
                if components.last().is_some() {
                    components.pop();
                }
            }
            _ => components.push(comp),
        }
    }
    let mut result = PathBuf::new();
    for comp in components {
        result.push(comp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_path_inside_workdir() {
        let dir = "/tmp";
        // Use a file that actually exists so canonicalise works
        let result = validate_path("/tmp", dir);
        assert!(result.is_ok());
    }

    #[test]
    fn relative_path_inside_workdir() {
        let dir = "/tmp";
        // Relative to /tmp — normalised to /tmp/subdir/file.txt
        let result = validate_path("subdir/file.txt", dir);
        assert!(result.is_ok());
    }

    #[test]
    fn dotdot_traversal_blocked() {
        let dir = "/tmp";
        let result = validate_path("../../../etc/passwd", dir);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn absolute_path_outside_workdir_blocked() {
        let dir = "/tmp";
        let result = validate_path("/etc/passwd", dir);
        assert!(result.is_err());
    }

    #[test]
    fn path_with_dot_components() {
        let dir = "/tmp";
        let result = validate_path("./subdir/../file.txt", dir);
        assert!(result.is_ok());
    }
}
