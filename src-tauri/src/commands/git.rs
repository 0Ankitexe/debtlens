use crate::models::workspace::WorkspaceMeta;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitAnalysisData {
    pub churn: std::collections::HashMap<String, usize>,
    pub blame_summary: std::collections::HashMap<String, Vec<(String, usize)>>,
    pub co_changes: Vec<(String, String, usize)>,
    pub commit_count: usize,
    pub author_count: usize,
}

#[tauri::command]
pub async fn run_git_analysis(workspace_path: String, history_days: u32) -> Result<GitAnalysisData, String> {
    let churn = crate::analysis::churn::analyze_churn(&workspace_path, history_days)
        .unwrap_or_default();

    let blame = crate::analysis::knowledge::analyze_knowledge(&workspace_path)
        .unwrap_or_default();

    let co_changes = crate::analysis::coupling::analyze_co_changes(&workspace_path, history_days)
        .unwrap_or_default()
        .pairs;

    // Compute summary stats
    let commit_count: usize = churn.values().sum();
    let mut all_authors = std::collections::HashSet::new();
    for authors in blame.values() {
        for author in authors.keys() {
            all_authors.insert(author.clone());
        }
    }

    // Convert blame to serializable format
    let blame_summary: std::collections::HashMap<String, Vec<(String, usize)>> = blame
        .into_iter()
        .map(|(path, authors)| {
            let mut sorted: Vec<(String, usize)> = authors.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            (path, sorted)
        })
        .collect();

    Ok(GitAnalysisData {
        churn,
        blame_summary,
        co_changes,
        commit_count,
        author_count: all_authors.len(),
    })
}

#[tauri::command]
pub async fn open_workspace(path: String) -> Result<WorkspaceMeta, String> {
    let workspace_path = Path::new(&path);

    if !workspace_path.exists() {
        return Err("PATH_NOT_FOUND: Directory does not exist".to_string());
    }

    // Validate it's a Git repository
    let repo = Repository::open(&path)
        .map_err(|_| "NOT_GIT_REPO: Directory is not a Git repository".to_string())?;

    // Create .debtengine directory
    let debtengine_dir = workspace_path.join(".debtengine");
    fs::create_dir_all(&debtengine_dir)
        .map_err(|e| format!("INIT_FAILED: Could not create .debtengine directory: {}", e))?;

    // Initialize SQLite database with migrations.
    let conn = crate::commands::db::get_db_connection(&path)
        .map_err(|e| format!("INIT_FAILED: Could not initialize database: {}", e))?;

    // Initialize settings file with defaults/migrations.
    crate::commands::settings::load_settings_from_disk(&path)
        .map_err(|e| format!("INIT_FAILED: Could not initialize settings: {}", e))?;

    // Get repository info
    let repo_name = workspace_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let branch = repo.head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "main".to_string());

    // Count tracked files
    let file_count = walkdir(&path).len();

    // Check for existing analysis
    let last_analysis_at = get_last_analysis_time(&conn);

    Ok(WorkspaceMeta {
        path: path.clone(),
        repo_name,
        branch,
        file_count,
        last_analysis_at,
    })
}

pub(crate) fn walkdir(root: &str) -> Vec<String> {
    let mut files = Vec::new();
    let root_path = Path::new(root);

    fn walk_recursive(dir: &Path, files: &mut Vec<String>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy();

                // Skip hidden directories and common non-source directories
                if name.starts_with('.') || name == "node_modules" || name == "target"
                    || name == "__pycache__" || name == "vendor" || name == "dist" || name == "build"
                {
                    continue;
                }

                if path.is_dir() {
                    walk_recursive(&path, files);
                } else if is_source_file(&path) {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    walk_recursive(root_path, &mut files);
    files
}

fn is_source_file(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some("ts") | Some("tsx") | Some("js") | Some("jsx") => true,
        Some("py") => true,
        Some("go") => true,
        Some("rs") => true,
        Some("java") => true,
        _ => false,
    }
}

fn get_last_analysis_time(conn: &rusqlite::Connection) -> Option<i64> {
    conn.query_row(
        "SELECT MAX(timestamp) FROM debt_snapshots",
        [],
        |row| row.get(0),
    )
    .ok()
    .flatten()
}
