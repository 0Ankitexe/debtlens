use git2::Repository;
use std::collections::HashMap;

/// Churn data: mapping relative path → commit count in the history window
pub type ChurnData = HashMap<String, usize>;

/// Analyze churn rate: count commits per file over a history window
pub fn analyze_churn(workspace_path: &str, history_days: u32) -> Result<ChurnData, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Git error: {}", e))?;

    let mut churn: HashMap<String, usize> = HashMap::new();

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

        // Get parent tree for diff
        let parent_tree = commit.parent(0)
            .ok()
            .and_then(|p| p.tree().ok());

        let diff = repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&tree),
            None,
        );

        if let Ok(diff) = diff {
            diff.foreach(
                &mut |delta, _| {
                    if let Some(path) = delta.new_file().path() {
                        let path_str = path.to_string_lossy().to_string();
                        *churn.entry(path_str).or_insert(0) += 1;
                    }
                    true
                },
                None, None, None,
            ).ok();
        }
    }

    Ok(churn)
}

/// Compute churn score for a single file (0–100)
pub fn compute_file_churn(churn_data: &ChurnData, relative_path: &str, history_days: u32) -> f64 {
    let count = *churn_data.get(relative_path).unwrap_or(&0) as f64;
    let daily_rate = count / history_days.max(1) as f64;

    // Files edited >1x/day = 100
    // Normalize: daily_rate of 1.0 → 100
    (daily_rate * 100.0).min(100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_zero_for_files_without_history() {
        let churn = ChurnData::new();
        assert_eq!(compute_file_churn(&churn, "src/lib.rs", 90), 0.0);
    }

    #[test]
    fn normalizes_commit_count_by_history_window() {
        let mut churn = ChurnData::new();
        churn.insert("src/lib.rs".to_string(), 45);

        let score = compute_file_churn(&churn, "src/lib.rs", 90);
        assert!((score - 50.0).abs() < 1e-6);
    }

    #[test]
    fn caps_scores_at_hundred() {
        let mut churn = ChurnData::new();
        churn.insert("src/lib.rs".to_string(), 365);

        let score = compute_file_churn(&churn, "src/lib.rs", 30);
        assert_eq!(score, 100.0);
    }
}
