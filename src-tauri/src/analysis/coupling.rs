use std::collections::HashMap;
use git2::Repository;

/// Extended co-change analysis result
#[derive(Debug, Clone, Default)]
pub struct CoChangeResult {
    /// (file_a, file_b, co_change_count) — canonical order: a < b
    pub pairs: Vec<(String, String, usize)>,
    /// Per-file total change count within the history window
    pub file_change_counts: HashMap<String, usize>,
}

/// Legacy alias for backwards compatibility
pub type CoChangeData = Vec<(String, String, usize)>;

/// Analyze co-changes: find file pairs that changed together in commits
/// Also tracks per-file change counts needed for proper coupling ratio.
pub fn analyze_co_changes(workspace_path: &str, history_days: u32) -> Result<CoChangeResult, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Git error: {}", e))?;

    let mut pair_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut file_change_counts: HashMap<String, usize> = HashMap::new();

    let mut revwalk = repo.revwalk()
        .map_err(|e| format!("Revwalk error: {}", e))?;
    revwalk.push_head().ok();
    revwalk.set_sorting(git2::Sort::TIME).ok();

    let cutoff = chrono::Utc::now().timestamp() - (history_days as i64 * 86400);

    for oid in revwalk.flatten() {
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if commit.time().seconds() < cutoff {
            break;
        }

        let tree = match commit.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None);

        if let Ok(diff) = diff {
            let mut changed_files = Vec::new();
            diff.foreach(
                &mut |delta, _| {
                    if let Some(path) = delta.new_file().path() {
                        let path_str = path.to_string_lossy().to_string();
                        if is_source_file(&path_str) {
                            changed_files.push(path_str);
                        }
                    }
                    true
                },
                None, None, None,
            ).ok();

            // Track per-file change counts
            for file in &changed_files {
                *file_change_counts.entry(file.clone()).or_insert(0) += 1;
            }

            // Record all pairs from this commit
            for i in 0..changed_files.len() {
                for j in (i + 1)..changed_files.len() {
                    let a = &changed_files[i];
                    let b = &changed_files[j];
                    let key = if a < b {
                        (a.clone(), b.clone())
                    } else {
                        (b.clone(), a.clone())
                    };
                    *pair_counts.entry(key).or_insert(0) += 1;
                }
            }
        }
    }

    let pairs: Vec<_> = pair_counts.into_iter()
        .map(|((a, b), count)| (a, b, count))
        .collect();

    Ok(CoChangeResult { pairs, file_change_counts })
}

/// Compute change coupling score for a single file (0–100)
/// Uses the spec formula: coupling_ratio = co_changes / min(changes_a, changes_b)
/// then averages the top-5 peer ratios.
pub fn compute_change_coupling(relative_path: &str, co_change_result: &CoChangeResult) -> f64 {
    let mut ratios: Vec<f64> = Vec::new();

    for (a, b, co_count) in &co_change_result.pairs {
        if a == relative_path || b == relative_path {
            let changes_a = co_change_result.file_change_counts.get(a).copied().unwrap_or(1);
            let changes_b = co_change_result.file_change_counts.get(b).copied().unwrap_or(1);
            let min_changes = changes_a.min(changes_b).max(1) as f64;
            let ratio = (*co_count as f64 / min_changes).min(1.0);
            ratios.push(ratio);
        }
    }

    if ratios.is_empty() {
        return 0.0;
    }

    // Sort descending, take top 5, average — per spec
    ratios.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let top_n = ratios.iter().take(5).copied().collect::<Vec<f64>>();
    let avg = top_n.iter().sum::<f64>() / top_n.len() as f64;

    (avg * 100.0).min(100.0)
}

/// Compute coupling index based on import relationships (0–100)
/// Formula: (in_degree + out_degree) / (2 * max_degree) * 100
/// where max_degree is the highest (in + out) across all files.
pub fn compute_coupling_index(
    relative_path: &str,
    workspace_path: &str,
) -> f64 {
    // Build workspace-wide import graph
    let files = crate::commands::git::walkdir(workspace_path);
    let mut out_degree: HashMap<String, usize> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = HashMap::new();

    for file_path in &files {
        let source = match std::fs::read_to_string(file_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let lang = detect_language_for_coupling(file_path);
        let imports = extract_imports(&source, &lang);
        let rel = file_path
            .strip_prefix(workspace_path)
            .unwrap_or(file_path)
            .trim_start_matches('/')
            .to_string();

        out_degree.insert(rel.clone(), imports.len());

        // For each import, try to resolve to a workspace file and bump in_degree
        for import_path in &imports {
            let basename = std::path::Path::new(import_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            // Match any workspace file whose stem matches the import
            for other_file in &files {
                let other_rel = other_file
                    .strip_prefix(workspace_path)
                    .unwrap_or(other_file)
                    .trim_start_matches('/');
                let other_stem = std::path::Path::new(other_rel)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                if other_stem == basename && other_rel != rel {
                    *in_degree.entry(other_rel.to_string()).or_insert(0) += 1;
                    break;
                }
            }
        }
    }

    // Find max degree across all files
    let mut max_degree: usize = 0;
    let all_files: std::collections::HashSet<&String> = out_degree.keys().chain(in_degree.keys()).collect();
    for f in &all_files {
        let total = out_degree.get(*f).copied().unwrap_or(0) + in_degree.get(*f).copied().unwrap_or(0);
        if total > max_degree {
            max_degree = total;
        }
    }

    if max_degree == 0 {
        return 0.0;
    }

    let file_in = in_degree.get(relative_path).copied().unwrap_or(0);
    let file_out = out_degree.get(relative_path).copied().unwrap_or(0);
    let score = (file_in + file_out) as f64 / (2.0 * max_degree as f64) * 100.0;

    score.min(100.0)
}

fn detect_language_for_coupling(path: &str) -> String {
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

fn extract_import_path(line: &str) -> Option<String> {
    // Extract from: import ... from 'path' or require('path')
    if let Some(pos) = line.rfind('\'') {
        let before = &line[..pos];
        if let Some(start) = before.rfind('\'') {
            return Some(line[start + 1..pos].to_string());
        }
    }
    if let Some(pos) = line.rfind('"') {
        let before = &line[..pos];
        if let Some(start) = before.rfind('"') {
            return Some(line[start + 1..pos].to_string());
        }
    }
    None
}

fn extract_python_import(line: &str) -> Option<String> {
    if line.starts_with("from ") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            return Some(parts[1].to_string());
        }
    }
    if line.starts_with("import ") {
        let module = line.strip_prefix("import ")?.split(',').next()?.trim().to_string();
        return Some(module);
    }
    None
}

fn is_source_file(path: &str) -> bool {
    matches!(
        std::path::Path::new(path).extension().and_then(|e| e.to_str()),
        Some("ts") | Some("tsx") | Some("js") | Some("jsx") | Some("py") | Some("go") | Some("rs") | Some("java")
    )
}

/// Extract all import paths from a source file.
/// Returns a list of module/path strings referenced by the file.
pub fn extract_imports(source: &str, language: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim();
        match language {
            "python" => {
                if let Some(module) = extract_python_import(trimmed) {
                    imports.push(module);
                }
            }
            "rust" => {
                if trimmed.starts_with("use ") || trimmed.starts_with("pub use ") {
                    // e.g. `use crate::foo::bar;` → `crate::foo::bar`
                    let path = trimmed
                        .trim_start_matches("pub ")
                        .trim_start_matches("use ")
                        .trim_end_matches(';')
                        .split("::{")
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !path.is_empty() {
                        imports.push(path);
                    }
                }
            }
            "go" => {
                if trimmed.starts_with("import ") || trimmed.starts_with("\"") {
                    if let Some(p) = extract_import_path(trimmed) {
                        imports.push(p);
                    }
                }
            }
            _ => {
                // JS/TS/Java: import ... from '...' or require('...')
                if trimmed.starts_with("import ") || trimmed.contains("require(") {
                    if let Some(p) = extract_import_path(trimmed) {
                        imports.push(p);
                    }
                }
            }
        }
    }
    imports
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_co_change_result(pairs: Vec<(String, String, usize)>, file_counts: Vec<(String, usize)>) -> CoChangeResult {
        CoChangeResult {
            pairs,
            file_change_counts: file_counts.into_iter().collect(),
        }
    }

    #[test]
    fn change_coupling_is_zero_when_file_has_no_pairs() {
        let result = make_co_change_result(
            vec![("a.rs".to_string(), "b.rs".to_string(), 3)],
            vec![("a.rs".to_string(), 5), ("b.rs".to_string(), 5)],
        );
        assert_eq!(compute_change_coupling("c.rs", &result), 0.0);
    }

    #[test]
    fn change_coupling_uses_spec_formula() {
        // File A changed 10 times, file B changed 5 times, they co-changed 4 times.
        // ratio = 4 / min(10, 5) = 4/5 = 0.8 => score = 80.0
        let result = make_co_change_result(
            vec![("a.rs".to_string(), "b.rs".to_string(), 4)],
            vec![("a.rs".to_string(), 10), ("b.rs".to_string(), 5)],
        );
        let score = compute_change_coupling("a.rs", &result);
        assert!((score - 80.0).abs() < 1e-6, "Expected 80.0, got {score}");
    }

    #[test]
    fn change_coupling_averages_top_five() {
        // target changed 10 times, each peer changed 10 times
        // co-changes: 2, 4, 6, 8, 10, 10  => ratios: 0.2, 0.4, 0.6, 0.8, 1.0, 1.0
        // top 5 = 1.0, 1.0, 0.8, 0.6, 0.4 => avg 0.76 => score 76.0
        let result = make_co_change_result(
            vec![
                ("target.rs".to_string(), "a.rs".to_string(), 2),
                ("target.rs".to_string(), "b.rs".to_string(), 4),
                ("target.rs".to_string(), "c.rs".to_string(), 6),
                ("target.rs".to_string(), "d.rs".to_string(), 8),
                ("target.rs".to_string(), "e.rs".to_string(), 10),
                ("target.rs".to_string(), "f.rs".to_string(), 10),
            ],
            vec![
                ("target.rs".to_string(), 10),
                ("a.rs".to_string(), 10),
                ("b.rs".to_string(), 10),
                ("c.rs".to_string(), 10),
                ("d.rs".to_string(), 10),
                ("e.rs".to_string(), 10),
                ("f.rs".to_string(), 10),
            ],
        );

        let score = compute_change_coupling("target.rs", &result);
        assert!((score - 76.0).abs() < 1e-6, "Expected 76.0, got {score}");
    }

    #[test]
    fn extracts_imports_for_multiple_languages() {
        let js = "import x from './x';\nconst y = require(\"./y\");";
        let rust = "use crate::module::Type;";

        let js_imports = extract_imports(js, "typescript");
        let rust_imports = extract_imports(rust, "rust");

        assert_eq!(js_imports, vec!["./x".to_string(), "./y".to_string()]);
        assert_eq!(rust_imports, vec!["crate::module::Type".to_string()]);
    }
}
