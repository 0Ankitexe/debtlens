use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterItem {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub title: String,
    pub description: String,
    pub file_path: Option<String>,
    pub severity: String, // "low" | "medium" | "high" | "critical"
    pub item_type: String, // "design" | "code" | "test" | "dependency" | "documentation" | "security" | "performance"
    pub owner: Option<String>,
    pub target_sprint: Option<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub status: String, // "open" | "in_progress" | "resolved" | "deferred" | "accepted"
    pub tags: Vec<String>,
    pub linked_commit: Option<String>,
    pub notes: Option<String>,
}
