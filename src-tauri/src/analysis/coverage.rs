use std::path::Path;

/// Compute test coverage gap score (0–100)
/// Uses heuristic: check for co-located test files
pub fn compute_coverage_gap(relative_path: &str, workspace_path: &str) -> f64 {
    // First check for coverage reports
    let lcov_path = Path::new(workspace_path).join("coverage/lcov.info");
    let cobertura_path = Path::new(workspace_path).join("coverage.xml");

    if lcov_path.exists() {
        return parse_lcov_coverage(&lcov_path, relative_path);
    }
    if cobertura_path.exists() {
        // Would parse cobertura XML — for MVP, fall through to heuristic
    }

    // Heuristic: check for test file co-location
    let path = Path::new(relative_path);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path.extension().unwrap_or_default().to_string_lossy();
    let parent = path.parent().unwrap_or(Path::new(""));

    // Common test file patterns
    let test_patterns = vec![
        parent.join(format!("{}.test.{}", stem, ext)),
        parent.join(format!("{}.spec.{}", stem, ext)),
        parent.join(format!("test_{}.{}", stem, ext)),
        parent.join(format!("{}_test.{}", stem, ext)),
        Path::new("tests").join(format!("test_{}.{}", stem, ext)),
        Path::new("test").join(format!("{}_test.{}", stem, ext)),
        parent.join("__tests__").join(format!("{}.test.{}", stem, ext)),
    ];

    let workspace = Path::new(workspace_path);
    for pattern in &test_patterns {
        if workspace.join(pattern).exists() {
            return 30.0; // Has tests but coverage unknown → moderate gap
        }
    }

    80.0 // No test file found → high gap
}

fn parse_lcov_coverage(lcov_path: &Path, _relative_path: &str) -> f64 {
    // Simplified LCOV parsing — real implementation would fully parse
    // For MVP, just check if the file exists in the coverage report
    if let Ok(content) = std::fs::read_to_string(lcov_path) {
        if content.contains(_relative_path) {
            return 30.0; // File found in coverage → assume moderate
        }
    }
    80.0
}
