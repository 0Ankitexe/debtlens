use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMeta {
    pub path: String,
    pub repo_name: String,
    pub branch: String,
    pub file_count: usize,
    pub last_analysis_at: Option<i64>,
}
