use std::path::Path;

/// Compute decision staleness score (0–100)
/// - Files with linked ADRs not reviewed in >180 days = 100
/// - No ADR for complex files (smell > 30) = 50
/// - ADR reviewed <30 days ago = 0
pub fn compute_staleness(relative_path: &str, workspace_path: &str, smell_score: f64) -> f64 {
    let workspace = Path::new(workspace_path);

    // Check for ADR in .debtengine/adrs/ directory
    let adrs_dir = workspace.join(".debtengine/adrs");
    let file_stem = Path::new(relative_path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Look for matching ADR files
    let adr_patterns = vec![
        adrs_dir.join(format!("{}.adr.md", file_stem)),
        adrs_dir.join(format!("{}.md", file_stem)),
    ];

    // Also check for *.adr.md in the same directory as the file
    let file_dir = workspace.join(
        Path::new(relative_path).parent().unwrap_or(Path::new(""))
    );
    let inline_adr = file_dir.join(format!("{}.adr.md", file_stem));

    for adr_path in adr_patterns.iter().chain(std::iter::once(&inline_adr)) {
        if adr_path.exists() {
            // Parse ADR for last_reviewed_at date
            if let Ok(content) = std::fs::read_to_string(adr_path) {
                if let Some(days_since_review) = parse_review_date(&content) {
                    if days_since_review < 30 {
                        return 0.0; // Recently reviewed
                    } else if days_since_review > 180 {
                        return 100.0; // Stale
                    } else {
                        // Linear interpolation between 30-180 days
                        return ((days_since_review - 30) as f64 / 150.0 * 100.0).min(100.0);
                    }
                }
            }

            // ADR exists but no review date — moderate staleness
            return 50.0;
        }
    }

    // No ADR found: penalty only for complex files
    if smell_score > 30.0 {
        return 50.0;
    }

    0.0
}

fn parse_review_date(content: &str) -> Option<i64> {
    // Look for frontmatter or inline date patterns
    // Patterns: last_reviewed_at: YYYY-MM-DD, reviewed: YYYY-MM-DD
    for line in content.lines() {
        let trimmed = line.trim().to_lowercase();
        if trimmed.starts_with("last_reviewed_at:") || trimmed.starts_with("reviewed:") || trimmed.starts_with("last-reviewed:") {
            let date_str = line.split(':').skip(1).collect::<Vec<&str>>().join(":").trim().to_string();
            if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str.trim(), "%Y-%m-%d") {
                let today = chrono::Utc::now().date_naive();
                let diff = today.signed_duration_since(date);
                return Some(diff.num_days());
            }
        }
    }
    None
}
