use crate::commands::ast::FileComplexity;
use crate::commands::ast::FunctionComplexity;

/// Analyze cyclomatic complexity using line-based heuristics
/// Full implementation would use tree-sitter AST node counting
pub fn analyze_complexity(source: &str, language: &str) -> FileComplexity {
    let mut functions: Vec<FunctionComplexity> = Vec::new();
    let mut current_func_name = String::new();
    let mut current_complexity = 1usize; // Base complexity
    let mut in_function = false;
    let mut brace_depth = 0i32;
    let mut func_start_depth = 0i32;

    let branching_keywords = match language {
        "python" => vec!["if ", "elif ", "for ", "while ", "except ", "and ", "or "],
        "go" | "rust" => vec!["if ", "else if ", "for ", "while ", "match ", "case ", "|| ", "&& "],
        _ => vec!["if ", "else if ", "for ", "while ", "switch ", "case ", "catch ", "|| ", "&& ", "? "],
    };

    for line in source.lines() {
        let trimmed = line.trim();

        // Detect function start
        if is_function_declaration(trimmed, language) && !in_function {
            current_func_name = extract_function_name(trimmed, language);
            current_complexity = 1;
            in_function = true;
            func_start_depth = brace_depth;
        }

        let opens = line.matches('{').count() as i32;
        let closes = line.matches('}').count() as i32;
        brace_depth += opens - closes;

        if in_function {
            // Count branching nodes
            for keyword in &branching_keywords {
                if trimmed.contains(keyword) {
                    current_complexity += 1;
                }
            }

            // Ternary operators
            if trimmed.contains(" ? ") && trimmed.contains(" : ") {
                current_complexity += 1;
            }

            // Function ended
            if language == "python" {
                // Python: function ends when indentation returns to function level
                // Simplified: just track current function until next function
            } else if brace_depth <= func_start_depth && closes > 0 {
                functions.push(FunctionComplexity {
                    name: current_func_name.clone(),
                    complexity: current_complexity,
                });
                in_function = false;
            }
        }
    }

    // If still in a function at EOF (e.g., Python), record it
    if in_function && !current_func_name.is_empty() {
        functions.push(FunctionComplexity {
            name: current_func_name,
            complexity: current_complexity,
        });
    }

    let average = if functions.is_empty() {
        0.0
    } else {
        functions.iter().map(|f| f.complexity as f64).sum::<f64>() / functions.len() as f64
    };

    FileComplexity { functions, average }
}

fn is_function_declaration(line: &str, language: &str) -> bool {
    match language {
        "typescript" | "javascript" => {
            line.contains("function ") || (line.contains("(") && line.contains(")") && line.contains("{")
                && !line.starts_with("if") && !line.starts_with("for") && !line.starts_with("while"))
        }
        "python" => line.starts_with("def ") || line.starts_with("async def "),
        "go" => line.starts_with("func "),
        "rust" => line.starts_with("fn ") || line.starts_with("pub fn ") || line.starts_with("pub(crate) fn "),
        "java" => (line.contains("public ") || line.contains("private ") || line.contains("protected "))
            && line.contains("(") && line.contains("{"),
        _ => false,
    }
}

fn extract_function_name(line: &str, language: &str) -> String {
    match language {
        "python" => {
            line.strip_prefix("def ").or(line.strip_prefix("async def "))
                .unwrap_or("")
                .split('(').next().unwrap_or("unknown")
                .trim().to_string()
        }
        "go" => {
            line.strip_prefix("func ")
                .unwrap_or("")
                .split('(').next().unwrap_or("unknown")
                .trim().to_string()
        }
        "rust" => {
            let s = line.replace("pub fn ", "").replace("pub(crate) fn ", "").replace("fn ", "");
            s.split('(').next().unwrap_or("unknown").trim().to_string()
        }
        _ => {
            // TS/JS/Java: extract name before (
            let parts: Vec<&str> = line.split('(').collect();
            if let Some(before_paren) = parts.first() {
                let words: Vec<&str> = before_paren.split_whitespace().collect();
                words.last().unwrap_or(&"unknown").to_string()
            } else {
                "unknown".to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_function_has_complexity_one() {
        let source = "fn simple() {\n  println!(\"hello\");\n}\n";
        let result = analyze_complexity(source, "rust");
        assert_eq!(result.functions.len(), 1);
        assert_eq!(result.functions[0].complexity, 1);
    }

    #[test]
    fn if_statement_adds_complexity() {
        let source = "function foo() {\n  if (x > 0) {\n    return x;\n  }\n}\n";
        let result = analyze_complexity(source, "typescript");
        assert_eq!(result.functions.len(), 1);
        assert!(result.functions[0].complexity >= 2, "if should increase complexity");
    }

    #[test]
    fn multiple_branches_increase_complexity() {
        let source = "function bar() {\n  if (a) {\n  } else if (b) {\n  }\n  for (let i=0; i<n; i++) {\n  }\n  while (c) {\n  }\n}\n";
        let result = analyze_complexity(source, "typescript");
        assert_eq!(result.functions.len(), 1);
        assert!(result.functions[0].complexity >= 4, "Multiple branches should increase complexity, got {}", result.functions[0].complexity);
    }

    #[test]
    fn average_complexity_across_functions() {
        let source = "fn simple() {\n  42\n}\nfn complex() {\n  if true {\n  }\n  if false {\n  }\n}\n";
        let result = analyze_complexity(source, "rust");
        assert_eq!(result.functions.len(), 2);
        assert!(result.average > 1.0, "Average should be > 1.0, got {}", result.average);
    }

    #[test]
    fn empty_source_has_no_functions() {
        let result = analyze_complexity("", "rust");
        assert_eq!(result.functions.len(), 0);
        assert_eq!(result.average, 0.0);
    }

    #[test]
    fn python_detects_functions() {
        let source = "def foo():\n    if x:\n        pass\n";
        let result = analyze_complexity(source, "python");
        assert_eq!(result.functions.len(), 1);
        assert!(result.functions[0].complexity >= 2);
    }
}

