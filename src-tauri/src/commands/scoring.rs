use crate::models::file_score::*;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

struct AnalysisInputs {
    history_days: u32,
    weights: std::collections::HashMap<String, f64>,
    churn: crate::analysis::churn::ChurnData,
    blame: crate::analysis::knowledge::BlameData,
    co_changes: crate::analysis::coupling::CoChangeResult,
}

#[tauri::command]
pub async fn run_full_analysis(
    workspace_path: String,
    cache: tauri::State<'_, Arc<Mutex<AnalysisCache>>>,
    app: tauri::AppHandle,
) -> Result<AnalysisResult, String> {
    run_full_analysis_internal(&workspace_path, cache.inner(), |progress| {
        let _ = app.emit("analysis_progress", progress);
    })
}

pub fn run_full_analysis_internal<F>(
    workspace_path: &str,
    cache: &Arc<Mutex<AnalysisCache>>,
    mut emit_progress: F,
) -> Result<AnalysisResult, String>
where
    F: FnMut(AnalysisProgress),
{
    let start = std::time::Instant::now();
    let files = crate::commands::git::walkdir(workspace_path);
    let total = files.len();
    let inputs = load_analysis_inputs(workspace_path)?;

    let mut scored_files = Vec::with_capacity(total);

    for (index, file_path) in files.iter().enumerate() {
        emit_progress(AnalysisProgress {
            current: index + 1,
            total,
            current_file: file_path.clone(),
        });

        if let Ok(score) = score_file(workspace_path, file_path, &inputs) {
            scored_files.push(score);
        }
    }

    let result = build_analysis_result(scored_files, start.elapsed().as_millis() as u64);
    persist_result(workspace_path, &result)?;
    update_cache(cache, workspace_path.to_string(), result.clone());

    Ok(result)
}

#[tauri::command]
pub async fn reanalyze_file(
    workspace_path: String,
    file_path: String,
    cache: tauri::State<'_, Arc<Mutex<AnalysisCache>>>,
) -> Result<FileScore, String> {
    reanalyze_file_internal(&workspace_path, &file_path, cache.inner())
}

pub fn reanalyze_file_internal(
    workspace_path: &str,
    file_path: &str,
    cache: &Arc<Mutex<AnalysisCache>>,
) -> Result<FileScore, String> {
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| format!("Could not read file metadata for {file_path}: {e}"))?;
    let current_mtime = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let conn = crate::commands::db::get_db_connection(workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;

    if let Some(cached_mtime) = crate::commands::db::load_cached_file_mtime(&conn, file_path)
        .map_err(|e| format!("DB read error: {e}"))?
    {
        if cached_mtime == current_mtime {
            if let Some(cached) = crate::commands::db::load_cached_file_score(&conn, file_path)
                .map_err(|e| format!("DB read error: {e}"))?
            {
                patch_cached_result(cache, workspace_path, cached.clone());
                return Ok(cached);
            }
        }
    }

    let inputs = load_analysis_inputs(workspace_path)?;
    let mut updated = score_file(workspace_path, file_path, &inputs)?;
    updated.last_modified = current_mtime;

    crate::commands::db::upsert_file_score(&conn, &updated)
        .map_err(|e| format!("DB upsert error: {e}"))?;

    patch_cached_result(cache, workspace_path, updated.clone());

    Ok(updated)
}

#[tauri::command]
pub async fn get_heatmap_data(
    cache: tauri::State<'_, Arc<Mutex<AnalysisCache>>>,
) -> Result<HeatmapNode, String> {
    let cache_lock = cache.lock().map_err(|_| "Cache lock error".to_string())?;
    cache_lock
        .heatmap
        .clone()
        .ok_or("No analysis data available. Run analysis first.".to_string())
}

#[tauri::command]
pub async fn get_file_breakdown(
    path: String,
    cache: tauri::State<'_, Arc<Mutex<AnalysisCache>>>,
) -> Result<FileBreakdown, String> {
    let cache_lock = cache.lock().map_err(|_| "Cache lock error".to_string())?;
    let result = cache_lock.result.as_ref().ok_or("No analysis data")?;

    let file = result
        .files
        .iter()
        .find(|f| f.relative_path == path || f.path == path)
        .ok_or(format!("File not found: {path}"))?;

    Ok(FileBreakdown {
        path: file.relative_path.clone(),
        composite_score: file.composite_score,
        components: vec![
            to_detail("churn_rate", &file.components.churn_rate),
            to_detail("code_smell_density", &file.components.code_smell_density),
            to_detail("coupling_index", &file.components.coupling_index),
            to_detail("change_coupling", &file.components.change_coupling),
            to_detail("test_coverage_gap", &file.components.test_coverage_gap),
            to_detail("knowledge_concentration", &file.components.knowledge_concentration),
            to_detail("cyclomatic_complexity", &file.components.cyclomatic_complexity),
            to_detail("decision_staleness", &file.components.decision_staleness),
        ],
    })
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CouplingPair {
    pub file_a: String,
    pub file_b: String,
    pub coupling_ratio: f64,
    pub co_change_count: usize,
    pub has_import_link: bool,
}

#[tauri::command]
pub async fn get_change_couplings(
    workspace_path: String,
    threshold: Option<f64>,
    cache: tauri::State<'_, Arc<Mutex<AnalysisCache>>>,
) -> Result<Vec<CouplingPair>, String> {
    let min_threshold = threshold.unwrap_or(0.05);

    let co_change_result = crate::analysis::coupling::analyze_co_changes(&workspace_path, 90)
        .unwrap_or_default();

    let cache_lock = cache.lock().map_err(|_| "Cache lock error")?;
    let all_files: Vec<String> = cache_lock
        .result
        .as_ref()
        .map(|r| r.files.iter().map(|f| f.relative_path.clone()).collect())
        .unwrap_or_default();
    drop(cache_lock);

    let mut pairs: Vec<CouplingPair> = co_change_result.pairs
        .iter()
        .filter(|(_, _, count)| *count >= 2)
        .map(|(a, b, count)| {
            // Use spec formula: co_changes / min(changes_a, changes_b)
            let changes_a = co_change_result.file_change_counts.get(a).copied().unwrap_or(1);
            let changes_b = co_change_result.file_change_counts.get(b).copied().unwrap_or(1);
            let min_changes = changes_a.min(changes_b).max(1) as f64;
            let ratio = (*count as f64 / min_changes).min(1.0);
            let b_basename = std::path::Path::new(b)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let source_path = format!("{workspace_path}/{a}");
            let has_import_link = std::fs::read_to_string(&source_path)
                .map(|src| src.contains(&b_basename))
                .unwrap_or(false);
            CouplingPair {
                file_a: a.clone(),
                file_b: b.clone(),
                coupling_ratio: ratio,
                co_change_count: *count,
                has_import_link,
            }
        })
        .filter(|p| {
            p.coupling_ratio >= min_threshold
                && (all_files.is_empty()
                    || all_files.contains(&p.file_a)
                    || all_files.contains(&p.file_b))
        })
        .collect();

    pairs.sort_by(|a, b| b.co_change_count.cmp(&a.co_change_count));
    pairs.truncate(200);
    Ok(pairs)
}

fn load_analysis_inputs(workspace_path: &str) -> Result<AnalysisInputs, String> {
    let settings = crate::commands::settings::load_effective_analysis_settings(workspace_path)?;

    let churn = crate::analysis::churn::analyze_churn(workspace_path, settings.history_days)
        .unwrap_or_default();
    let blame = crate::analysis::knowledge::analyze_knowledge(workspace_path).unwrap_or_default();
    let co_change_result =
        crate::analysis::coupling::analyze_co_changes(workspace_path, settings.history_days)
            .unwrap_or_default();

    Ok(AnalysisInputs {
        history_days: settings.history_days,
        weights: settings.weights,
        churn,
        blame,
        co_changes: co_change_result,
    })
}

fn score_file(workspace_path: &str, file_path: &str, inputs: &AnalysisInputs) -> Result<FileScore, String> {
    let source = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read {file_path}: {e}"))?;

    let relative_path = to_relative_path(workspace_path, file_path);
    let lang = detect_language(file_path);
    let loc = source.lines().count();
    let last_modified = std::fs::metadata(file_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let churn_raw = crate::analysis::churn::compute_file_churn(
        &inputs.churn,
        &relative_path,
        inputs.history_days,
    );
    let smells = crate::analysis::smells::detect_smells(&source, &lang, loc);
    let smell_raw = compute_smell_score(&smells, loc);
    let coupling_raw = crate::analysis::coupling::compute_coupling_index(&relative_path, workspace_path);
    let change_coupling_raw =
        crate::analysis::coupling::compute_change_coupling(&relative_path, &inputs.co_changes);
    let coverage_raw = crate::analysis::coverage::compute_coverage_gap(&relative_path, workspace_path);
    let knowledge_raw =
        crate::analysis::knowledge::compute_knowledge_concentration(&inputs.blame, &relative_path);
    let complexity_data = crate::analysis::complexity::analyze_complexity(&source, &lang);
    let complexity_raw = (complexity_data.average / 20.0 * 100.0).min(100.0);
    let staleness_raw = crate::analysis::staleness::compute_staleness(&relative_path, workspace_path, smell_raw);

    let w = &inputs.weights;
    let components = ScoreComponents {
        churn_rate: ComponentScore {
            raw_score: churn_raw,
            weight: *w.get("churn_rate").unwrap_or(&0.22),
            contribution: churn_raw * w.get("churn_rate").unwrap_or(&0.22),
            details: vec![],
        },
        code_smell_density: ComponentScore {
            raw_score: smell_raw,
            weight: *w.get("code_smell_density").unwrap_or(&0.20),
            contribution: smell_raw * w.get("code_smell_density").unwrap_or(&0.20),
            details: vec![format!("{} smells in {} LOC", smells.total, loc)],
        },
        coupling_index: ComponentScore {
            raw_score: coupling_raw,
            weight: *w.get("coupling_index").unwrap_or(&0.18),
            contribution: coupling_raw * w.get("coupling_index").unwrap_or(&0.18),
            details: vec![],
        },
        change_coupling: ComponentScore {
            raw_score: change_coupling_raw,
            weight: *w.get("change_coupling").unwrap_or(&0.12),
            contribution: change_coupling_raw * w.get("change_coupling").unwrap_or(&0.12),
            details: vec![],
        },
        test_coverage_gap: ComponentScore {
            raw_score: coverage_raw,
            weight: *w.get("test_coverage_gap").unwrap_or(&0.12),
            contribution: coverage_raw * w.get("test_coverage_gap").unwrap_or(&0.12),
            details: vec![],
        },
        knowledge_concentration: ComponentScore {
            raw_score: knowledge_raw,
            weight: *w.get("knowledge_concentration").unwrap_or(&0.08),
            contribution: knowledge_raw * w.get("knowledge_concentration").unwrap_or(&0.08),
            details: vec![],
        },
        cyclomatic_complexity: ComponentScore {
            raw_score: complexity_raw,
            weight: *w.get("cyclomatic_complexity").unwrap_or(&0.05),
            contribution: complexity_raw * w.get("cyclomatic_complexity").unwrap_or(&0.05),
            details: vec![format!("avg complexity: {:.1}", complexity_data.average)],
        },
        decision_staleness: ComponentScore {
            raw_score: staleness_raw,
            weight: *w.get("decision_staleness").unwrap_or(&0.03),
            contribution: staleness_raw * w.get("decision_staleness").unwrap_or(&0.03),
            details: vec![],
        },
    };

    let composite_score = components.churn_rate.contribution
        + components.code_smell_density.contribution
        + components.coupling_index.contribution
        + components.change_coupling.contribution
        + components.test_coverage_gap.contribution
        + components.knowledge_concentration.contribution
        + components.cyclomatic_complexity.contribution
        + components.decision_staleness.contribution;

    Ok(FileScore {
        path: file_path.to_string(),
        relative_path,
        composite_score,
        components,
        loc,
        language: lang,
        last_modified,
        supervision_status: "none".to_string(),
    })
}

fn persist_result(workspace_path: &str, result: &AnalysisResult) -> Result<(), String> {
    let conn = crate::commands::db::get_db_connection(workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;
    crate::commands::db::upsert_file_scores(&conn, &result.files)
        .map_err(|e| format!("DB upsert error: {e}"))
}

fn build_analysis_result(files: Vec<FileScore>, duration_ms: u64) -> AnalysisResult {
    let file_count = files.len();
    let total_score: f64 = files.iter().map(|f| f.composite_score).sum();
    let high_debt_count = files.iter().filter(|f| f.composite_score > 65.0).count();

    AnalysisResult {
        workspace_score: if file_count == 0 {
            0.0
        } else {
            total_score / file_count as f64
        },
        file_count,
        high_debt_count,
        files,
        duration_ms,
    }
}

fn patch_cached_result(cache: &Arc<Mutex<AnalysisCache>>, workspace_path: &str, file: FileScore) {
    if let Ok(mut lock) = cache.lock() {
        if lock.workspace_path.as_deref() != Some(workspace_path) {
            lock.workspace_path = Some(workspace_path.to_string());
            lock.result = Some(AnalysisResult {
                workspace_score: file.composite_score,
                file_count: 1,
                high_debt_count: usize::from(file.composite_score > 65.0),
                files: vec![file.clone()],
                duration_ms: 0,
            });
            lock.heatmap = lock
                .result
                .as_ref()
                .map(|result| build_heatmap_tree(workspace_path, &result.files));
            return;
        }

        let result = lock.result.get_or_insert(AnalysisResult {
            workspace_score: 0.0,
            file_count: 0,
            high_debt_count: 0,
            files: Vec::new(),
            duration_ms: 0,
        });

        if let Some(existing) = result
            .files
            .iter_mut()
            .find(|existing| existing.path == file.path || existing.relative_path == file.relative_path)
        {
            *existing = file;
        } else {
            result.files.push(file);
        }

        result.file_count = result.files.len();
        let total: f64 = result.files.iter().map(|f| f.composite_score).sum();
        result.workspace_score = if result.files.is_empty() {
            0.0
        } else {
            total / result.files.len() as f64
        };
        result.high_debt_count = result.files.iter().filter(|f| f.composite_score > 65.0).count();

        lock.heatmap = Some(build_heatmap_tree(workspace_path, &result.files));
    }
}

fn update_cache(cache: &Arc<Mutex<AnalysisCache>>, workspace_path: String, result: AnalysisResult) {
    if let Ok(mut lock) = cache.lock() {
        lock.workspace_path = Some(workspace_path.clone());
        lock.heatmap = Some(build_heatmap_tree(&workspace_path, &result.files));
        lock.result = Some(result);
    }
}

fn to_relative_path(workspace_path: &str, file_path: &str) -> String {
    file_path
        .strip_prefix(workspace_path)
        .unwrap_or(file_path)
        .trim_start_matches('/')
        .trim_start_matches('\\')
        .to_string()
}

fn to_detail(name: &str, component: &ComponentScore) -> ComponentDetail {
    ComponentDetail {
        name: name.to_string(),
        raw_score: component.raw_score,
        weight: component.weight,
        contribution: component.contribution,
        details: component.details.clone(),
    }
}

fn compute_smell_score(smells: &crate::commands::ast::FileSmells, loc: usize) -> f64 {
    if loc == 0 {
        return 0.0;
    }
    (smells.total as f64 / loc as f64 * 5000.0).min(100.0)
}

fn detect_language(path: &str) -> String {
    match std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("ts") | Some("tsx") => "typescript".to_string(),
        Some("js") | Some("jsx") => "javascript".to_string(),
        Some("py") => "python".to_string(),
        Some("go") => "go".to_string(),
        Some("rs") => "rust".to_string(),
        Some("java") => "java".to_string(),
        _ => "unknown".to_string(),
    }
}

fn build_heatmap_tree(workspace_path: &str, files: &[FileScore]) -> HeatmapNode {
    let root_name = std::path::Path::new(workspace_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "root".to_string());

    let mut root = HeatmapNode {
        name: root_name,
        path: workspace_path.to_string(),
        score: None,
        loc: None,
        children: Some(Vec::new()),
    };

    for file in files {
        let parts: Vec<&str> = file.relative_path.split('/').collect();
        insert_into_tree(&mut root, &parts, file, String::new());
    }

    root
}

fn insert_into_tree(node: &mut HeatmapNode, parts: &[&str], file: &FileScore, prefix: String) {
    if parts.is_empty() {
        return;
    }

    if parts.len() == 1 {
        let children = node.children.get_or_insert_with(Vec::new);
        children.push(HeatmapNode {
            name: parts[0].to_string(),
            path: file.relative_path.clone(),
            score: Some(file.composite_score),
            loc: Some(file.loc),
            children: None,
        });
        return;
    }

    let dir_name = parts[0];
    let next_prefix = if prefix.is_empty() {
        dir_name.to_string()
    } else {
        format!("{prefix}/{dir_name}")
    };

    let children = node.children.get_or_insert_with(Vec::new);

    if let Some(existing) = children
        .iter_mut()
        .find(|child| child.name == dir_name && child.children.is_some())
    {
        insert_into_tree(existing, &parts[1..], file, next_prefix);
        return;
    }

    let mut new_dir = HeatmapNode {
        name: dir_name.to_string(),
        path: next_prefix.clone(),
        score: None,
        loc: None,
        children: Some(Vec::new()),
    };
    insert_into_tree(&mut new_dir, &parts[1..], file, next_prefix);
    children.push(new_dir);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_valid_relative_path() {
        let relative = to_relative_path("/tmp/repo", "/tmp/repo/src/main.rs");
        assert_eq!(relative, "src/main.rs");
    }

    #[test]
    fn build_result_counts_high_debt_files() {
        let file = FileScore {
            path: "/tmp/repo/src/main.rs".to_string(),
            relative_path: "src/main.rs".to_string(),
            composite_score: 80.0,
            components: ScoreComponents {
                churn_rate: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                code_smell_density: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                coupling_index: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                change_coupling: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                test_coverage_gap: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                knowledge_concentration: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                cyclomatic_complexity: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
                decision_staleness: ComponentScore {
                    raw_score: 0.0,
                    weight: 0.0,
                    contribution: 0.0,
                    details: vec![],
                },
            },
            loc: 1,
            language: "rust".to_string(),
            last_modified: 0,
            supervision_status: "none".to_string(),
        };

        let result = build_analysis_result(vec![file], 10);
        assert_eq!(result.file_count, 1);
        assert_eq!(result.high_debt_count, 1);
        assert_eq!(result.workspace_score, 80.0);
    }

    #[test]
    fn smell_score_is_bounded() {
        let smells = crate::commands::ast::FileSmells {
            god_function: 0,
            deep_nesting: 0,
            long_param_list: 0,
            duplicate_block: 0,
            dead_import: 0,
            magic_number: 0,
            empty_catch: 0,
            todo_fixme: 0,
            total: 500,
            loc: 10,
        };

        assert_eq!(compute_smell_score(&smells, 0), 0.0);
        assert_eq!(compute_smell_score(&smells, 10), 100.0);
    }
}
