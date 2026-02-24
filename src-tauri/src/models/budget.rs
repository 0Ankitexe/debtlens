use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebtBudget {
    pub id: String,
    pub pattern: String,
    pub label: String,
    pub max_score: f64,
    pub created_at: i64,
    pub notify_on_breach: bool,
}
