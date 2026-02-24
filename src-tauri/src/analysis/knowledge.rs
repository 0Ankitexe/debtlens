use git2::Repository;
use std::collections::HashMap;

/// Blame data: file → author → line count
pub type BlameData = HashMap<String, HashMap<String, usize>>;

/// Analyze knowledge concentration via git blame
pub fn analyze_knowledge(workspace_path: &str) -> Result<BlameData, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Git error: {}", e))?;

    let mut blame_data = BlameData::new();

    // Walk tracked files and blame each one
    let head = repo.head()
        .map_err(|e| format!("Head error: {}", e))?;
    let tree = head.peel_to_tree()
        .map_err(|e| format!("Tree error: {}", e))?;

    tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
        if entry.kind() == Some(git2::ObjectType::Blob) {
            let name = entry.name().unwrap_or("");
            let path = if root.is_empty() {
                name.to_string()
            } else {
                format!("{}{}", root, name)
            };

            if is_source_file(&path) {
                if let Ok(blame) = repo.blame_file(std::path::Path::new(&path), None) {
                    let mut authors: HashMap<String, usize> = HashMap::new();
                    for i in 0..blame.len() {
                        if let Some(hunk) = blame.get_index(i) {
                            let sig = hunk.final_signature();
                            let author = sig.name().unwrap_or("unknown").to_string();
                            let lines = hunk.lines_in_hunk();
                            *authors.entry(author).or_insert(0) += lines;
                        }
                    }
                    blame_data.insert(path, authors);
                }
            }
        }
        0 // continue walking
    }).ok();

    Ok(blame_data)
}

/// Compute knowledge concentration score for a single file (0–100)
/// Score = max(0, (concentration - 0.5) / 0.5 * 100)
/// Only triggers when top author concentration > 50%
pub fn compute_knowledge_concentration(blame_data: &BlameData, relative_path: &str) -> f64 {
    let authors = match blame_data.get(relative_path) {
        Some(a) => a,
        None => return 0.0,
    };

    let total_lines: usize = authors.values().sum();
    if total_lines == 0 {
        return 0.0;
    }

    let max_lines = *authors.values().max().unwrap_or(&0);
    let concentration = max_lines as f64 / total_lines as f64;

    if concentration <= 0.5 {
        return 0.0;
    }

    ((concentration - 0.5) / 0.5 * 100.0).min(100.0)
}

fn is_source_file(path: &str) -> bool {
    matches!(
        std::path::Path::new(path).extension().and_then(|e| e.to_str()),
        Some("ts") | Some("tsx") | Some("js") | Some("jsx") | Some("py") | Some("go") | Some("rs") | Some("java")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_zero_for_unknown_file() {
        let blame = BlameData::new();
        assert_eq!(compute_knowledge_concentration(&blame, "unknown.rs"), 0.0);
    }

    #[test]
    fn returns_zero_when_balanced_two_authors() {
        let mut authors = HashMap::new();
        authors.insert("Alice".to_string(), 50);
        authors.insert("Bob".to_string(), 50);
        let mut blame = BlameData::new();
        blame.insert("lib.rs".to_string(), authors);

        assert_eq!(compute_knowledge_concentration(&blame, "lib.rs"), 0.0);
    }

    #[test]
    fn returns_100_for_single_author() {
        let mut authors = HashMap::new();
        authors.insert("Alice".to_string(), 100);
        let mut blame = BlameData::new();
        blame.insert("lib.rs".to_string(), authors);

        assert_eq!(compute_knowledge_concentration(&blame, "lib.rs"), 100.0);
    }

    #[test]
    fn partial_concentration() {
        // 75% concentration → (0.75 - 0.5) / 0.5 * 100 = 50.0
        let mut authors = HashMap::new();
        authors.insert("Alice".to_string(), 75);
        authors.insert("Bob".to_string(), 25);
        let mut blame = BlameData::new();
        blame.insert("lib.rs".to_string(), authors);

        let score = compute_knowledge_concentration(&blame, "lib.rs");
        assert!((score - 50.0).abs() < 1e-6, "Expected 50.0, got {score}");
    }
}

