use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebtSnapshot {
    pub id: i64,
    pub timestamp: i64,
    pub composite_score: f64,
    pub file_count: usize,
    pub high_debt_count: usize,
    pub commit_count_week: usize,
    pub snapshot_metadata: Option<String>, // JSON string
}
