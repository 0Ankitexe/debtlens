use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentScore {
    pub raw_score: f64,
    pub weight: f64,
    pub contribution: f64,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreComponents {
    pub churn_rate: ComponentScore,
    pub code_smell_density: ComponentScore,
    pub coupling_index: ComponentScore,
    pub change_coupling: ComponentScore,
    pub test_coverage_gap: ComponentScore,
    pub knowledge_concentration: ComponentScore,
    pub cyclomatic_complexity: ComponentScore,
    pub decision_staleness: ComponentScore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileScore {
    pub path: String,
    pub relative_path: String,
    pub composite_score: f64,
    pub components: ScoreComponents,
    pub loc: usize,
    pub language: String,
    pub last_modified: i64,
    pub supervision_status: String, // "none" | "acceptable" | "regressed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapNode {
    pub name: String,
    pub path: String,
    pub score: Option<f64>,
    pub loc: Option<usize>,
    pub children: Option<Vec<HeatmapNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileBreakdown {
    pub path: String,
    pub composite_score: f64,
    pub components: Vec<ComponentDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentDetail {
    pub name: String,
    pub raw_score: f64,
    pub weight: f64,
    pub contribution: f64,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub workspace_score: f64,
    pub file_count: usize,
    pub high_debt_count: usize,
    pub files: Vec<FileScore>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Default scoring weights (sum to 1.0)
pub fn default_weights() -> HashMap<String, f64> {
    let mut w = HashMap::new();
    w.insert("churn_rate".to_string(), 0.22);
    w.insert("code_smell_density".to_string(), 0.20);
    w.insert("coupling_index".to_string(), 0.18);
    w.insert("change_coupling".to_string(), 0.12);
    w.insert("test_coverage_gap".to_string(), 0.12);
    w.insert("knowledge_concentration".to_string(), 0.08);
    w.insert("cyclomatic_complexity".to_string(), 0.05);
    w.insert("decision_staleness".to_string(), 0.03);
    w
}

/// In-memory cache for analysis results
#[derive(Debug, Default)]
pub struct AnalysisCache {
    pub workspace_path: Option<String>,
    pub result: Option<AnalysisResult>,
    pub heatmap: Option<HeatmapNode>,
}
