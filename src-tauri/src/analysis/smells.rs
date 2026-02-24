use crate::commands::ast::FileSmells;

/// Simple code smell detection using line-by-line heuristics.
/// For a production version, this would use tree-sitter AST traversal.
pub fn detect_smells(source: &str, language: &str, loc: usize) -> FileSmells {
    let lines: Vec<&str> = source.lines().collect();
    let mut smells = FileSmells {
        god_function: 0,
        deep_nesting: 0,
        long_param_list: 0,
        duplicate_block: 0,
        dead_import: 0,
        magic_number: 0,
        empty_catch: 0,
        todo_fixme: 0,
        total: 0,
        loc,
    };

    // Track function/method bodies for god function detection
    let mut current_func_lines = 0;
    let mut in_function = false;
    let mut brace_depth = 0i32;
    let mut func_start_depth = 0i32;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // TODO/FIXME/HACK/XXX comments
        if is_comment(trimmed, language) {
            let upper = trimmed.to_uppercase();
            if upper.contains("TODO") || upper.contains("FIXME") || upper.contains("HACK") || upper.contains("XXX") {
                smells.todo_fixme += 1;
            }
        }

        // Track brace depth for nesting and function detection
        let opens = line.matches('{').count() as i32;
        let closes = line.matches('}').count() as i32;

        // Detect function start (simplified)
        if is_function_declaration(trimmed, language) && !in_function {
            in_function = true;
            func_start_depth = brace_depth;
            current_func_lines = 0;
        }

        brace_depth += opens - closes;

        if in_function {
            current_func_lines += 1;

            if brace_depth <= func_start_depth && closes > 0 {
                // Function ended
                if current_func_lines > 60 {
                    smells.god_function += 1;
                }
                in_function = false;
                current_func_lines = 0;
            }
        }

        // Deep nesting: count indent level
        let indent_level = count_nesting_level(trimmed, language);
        if indent_level > 4 {
            smells.deep_nesting += 1;
        }

        // Long parameter list
        if is_function_declaration(trimmed, language) {
            let params = count_parameters(trimmed);
            if params > 5 {
                smells.long_param_list += 1;
            }
        }

        // Magic numbers (outside const/let/var declarations)
        if !trimmed.starts_with("const ") && !trimmed.starts_with("let ") 
            && !trimmed.starts_with("var ") && !is_comment(trimmed, language) 
        {
            let magic_count = count_magic_numbers(trimmed);
            smells.magic_number += magic_count;
        }

        // Empty catch block
        if trimmed.contains("catch") {
            if let Some(next_line) = lines.get(i + 1) {
                let next_trimmed = next_line.trim();
                if next_trimmed == "}" || next_trimmed.is_empty() {
                    smells.empty_catch += 1;
                }
            }
        }
    }

    // For Python, use indentation for nesting instead of braces
    if language == "python" {
        smells.deep_nesting = 0;
        for line in &lines {
            let spaces = line.len() - line.trim_start().len();
            let indent = spaces / 4;
            if indent > 4 && !line.trim().is_empty() {
                smells.deep_nesting += 1;
            }
        }
    }

    smells.total = smells.god_function + smells.deep_nesting + smells.long_param_list
        + smells.duplicate_block + smells.dead_import + smells.magic_number
        + smells.empty_catch + smells.todo_fixme;

    smells
}

fn is_comment(line: &str, language: &str) -> bool {
    match language {
        "python" => line.starts_with('#'),
        _ => line.starts_with("//") || line.starts_with('*') || line.starts_with("/*"),
    }
}

fn is_function_declaration(line: &str, language: &str) -> bool {
    match language {
        "typescript" | "javascript" => {
            line.contains("function ") || line.contains("=> {") || line.contains("async ") 
                || (line.contains('(') && line.contains(')') && line.contains('{')
                    && !line.starts_with("if") && !line.starts_with("for") 
                    && !line.starts_with("while") && !line.starts_with("switch"))
        }
        "python" => line.starts_with("def ") || line.starts_with("async def "),
        "go" => line.starts_with("func "),
        "rust" => line.starts_with("fn ") || line.starts_with("pub fn ") || line.starts_with("pub(crate) fn ") || line.starts_with("async fn "),
        "java" => {
            (line.contains("public ") || line.contains("private ") || line.contains("protected ") || line.contains("static "))
                && line.contains('(') && line.contains('{')
        }
        _ => false,
    }
}

fn count_nesting_level(line: &str, _language: &str) -> usize {
    let indent = line.len() - line.trim_start().len();
    // Approximate: 2 or 4 spaces per level
    if indent >= 4 { indent / 4 } else { indent / 2 }
}

fn count_parameters(line: &str) -> usize {
    if let Some(start) = line.find('(') {
        if let Some(end) = line.rfind(')') {
            if end > start {
                let params = &line[start + 1..end];
                if params.trim().is_empty() { return 0; }
                return params.split(',').count();
            }
        }
    }
    0
}

fn count_magic_numbers(line: &str) -> usize {
    let allowed = [0.0f64, 1.0, -1.0, 2.0, 100.0];
    let mut count = 0;

    for word in line.split(|c: char| !c.is_ascii_digit() && c != '.' && c != '-') {
        if let Ok(num) = word.parse::<f64>() {
            if !allowed.contains(&num) && word.len() > 0 && word != "0" {
                count += 1;
            }
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_todo_comment() {
        let source = "// TODO: fix this later\nlet x = 1;\n";
        let smells = detect_smells(source, "typescript", 2);
        assert_eq!(smells.todo_fixme, 1);
    }

    #[test]
    fn detects_god_function_over_60_lines() {
        // Create a function body > 60 lines
        let mut lines = vec!["function bigFunction() {".to_string()];
        for i in 0..65 {
            lines.push(format!("  const x{} = {};", i, i));
        }
        lines.push("}".to_string());
        let source = lines.join("\n");

        let smells = detect_smells(&source, "typescript", lines.len());
        assert_eq!(smells.god_function, 1, "Should detect one god function");
    }

    #[test]
    fn detects_long_param_list() {
        let source = "function foo(a, b, c, d, e, f) {\n  return a;\n}\n";
        let smells = detect_smells(source, "typescript", 3);
        assert!(smells.long_param_list >= 1, "Should detect long param list");
    }

    #[test]
    fn detects_empty_catch_block() {
        let source = "try {\n  foo();\n} catch(e) {\n}\n";
        let smells = detect_smells(source, "typescript", 4);
        assert_eq!(smells.empty_catch, 1);
    }

    #[test]
    fn total_equals_sum_of_all_smells() {
        let source = "// TODO: fix\nfunction foo(a, b, c, d, e, f) { return 42; }\n";
        let smells = detect_smells(source, "typescript", 2);
        let expected = smells.god_function + smells.deep_nesting + smells.long_param_list
            + smells.duplicate_block + smells.dead_import + smells.magic_number
            + smells.empty_catch + smells.todo_fixme;
        assert_eq!(smells.total, expected);
    }

    #[test]
    fn zero_smells_for_clean_code() {
        let source = "const x = 1;\n";
        let smells = detect_smells(source, "typescript", 1);
        assert_eq!(smells.todo_fixme, 0);
        assert_eq!(smells.god_function, 0);
        assert_eq!(smells.empty_catch, 0);
    }

    #[test]
    fn count_params_works() {
        assert_eq!(count_parameters("function foo(a, b, c)"), 3);
        assert_eq!(count_parameters("function foo()"), 0);
    }
}

