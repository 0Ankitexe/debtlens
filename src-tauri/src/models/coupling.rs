use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouplingPair {
    pub file_a: String,
    pub file_b: String,
    pub co_change_count: usize,
    pub coupling_ratio: f64,
    pub has_import_link: bool,
    pub context: String,
}
