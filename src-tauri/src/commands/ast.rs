use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AstAnalysisData {
    pub smells: HashMap<String, FileSmells>,
    pub complexity: HashMap<String, FileComplexity>,
    pub imports: HashMap<String, FileImports>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSmells {
    pub god_function: usize,
    pub deep_nesting: usize,
    pub long_param_list: usize,
    pub duplicate_block: usize,
    pub dead_import: usize,
    pub magic_number: usize,
    pub empty_catch: usize,
    pub todo_fixme: usize,
    pub total: usize,
    pub loc: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionComplexity {
    pub name: String,
    pub complexity: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileComplexity {
    pub functions: Vec<FunctionComplexity>,
    pub average: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileImports {
    pub imports: Vec<String>,
    pub imported_by: Vec<String>,
}

#[tauri::command]
pub async fn run_ast_analysis(file_paths: Vec<String>) -> Result<AstAnalysisData, String> {
    let mut smells_map = HashMap::new();
    let mut complexity_map = HashMap::new();
    let mut imports_map = HashMap::new();

    for file_path in &file_paths {
        let source = std::fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read {}: {}", file_path, e))?;

        let lang = detect_language(file_path);
        let loc = source.lines().count();

        // Analyze smells
        let file_smells = crate::analysis::smells::detect_smells(&source, &lang, loc);
        smells_map.insert(file_path.clone(), file_smells);

        // Analyze complexity
        let file_complexity = crate::analysis::complexity::analyze_complexity(&source, &lang);
        complexity_map.insert(file_path.clone(), file_complexity);

        // Analyze imports
        let file_imports = crate::analysis::coupling::extract_imports(&source, &lang);
        imports_map.insert(file_path.clone(), FileImports {
            imports: file_imports,
            imported_by: Vec::new(), // Populated during full analysis
        });
    }

    Ok(AstAnalysisData {
        smells: smells_map,
        complexity: complexity_map,
        imports: imports_map,
    })
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
