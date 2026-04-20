//! Tauri commands for the Skills system.
//!
//! Skills are stored at `~/.devpilot/skills/{name}/SKILL.md` and managed through
//! these invoke handlers.

use devpilot_protocol::SkillInfo;
use devpilot_tools::SkillLoader;

// ── Commands ─────────────────────────────────────────

/// List all installed skills.
#[tauri::command]
pub async fn list_skills() -> Result<Vec<SkillInfo>, String> {
    let loader = SkillLoader::new();
    loader.list_skills().await.map_err(|e| e.to_string())
}

/// Get a single skill by name.
#[tauri::command]
pub async fn get_skill(name: String) -> Result<SkillInfo, String> {
    let loader = SkillLoader::new();
    loader.load_skill(&name).await.map_err(|e| e.to_string())
}

/// Install (or overwrite) a skill.
///
/// `content` is the full SKILL.md text including optional YAML frontmatter.
#[tauri::command]
pub async fn install_skill(name: String, content: String) -> Result<(), String> {
    let loader = SkillLoader::new();
    loader
        .install_skill(&name, &content)
        .await
        .map_err(|e| e.to_string())
}

/// Uninstall (delete) a skill by name.
#[tauri::command]
pub async fn uninstall_skill(name: String) -> Result<(), String> {
    let loader = SkillLoader::new();
    loader
        .uninstall_skill(&name)
        .await
        .map_err(|e| e.to_string())
}

/// Enable or disable a skill.
#[tauri::command]
pub async fn toggle_skill(name: String, enabled: bool) -> Result<(), String> {
    let loader = SkillLoader::new();
    loader
        .toggle_skill(&name, enabled)
        .await
        .map_err(|e| e.to_string())
}

/// Search installed skills by query (matches name, description, tags, category).
#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillInfo>, String> {
    let loader = SkillLoader::new();
    loader
        .search_skills(&query)
        .await
        .map_err(|e| e.to_string())
}

/// List skills from both global and project-level directories.
///
/// Project skills (located at `<workspace_path>/.devpilot/skills/`) override
/// global skills (`~/.devpilot/skills/`) with the same name.
#[tauri::command]
pub async fn list_project_skills(workspace_path: Option<String>) -> Result<Vec<SkillInfo>, String> {
    let global_dir = dirs::home_dir()
        .expect("could not determine home directory")
        .join(".devpilot")
        .join("skills");

    let project_dir =
        workspace_path.map(|p| std::path::PathBuf::from(p).join(".devpilot").join("skills"));

    match project_dir {
        Some(pdir) => SkillLoader::list_skills_with_project(global_dir, pdir)
            .await
            .map_err(|e| e.to_string()),
        None => {
            let loader = SkillLoader::new();
            loader.list_skills().await.map_err(|e| e.to_string())
        }
    }
}
