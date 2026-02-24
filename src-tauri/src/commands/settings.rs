use crate::models::file_score::default_weights;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const SETTINGS_SCHEMA_VERSION: i64 = 2;

#[derive(Debug, Clone)]
pub struct EffectiveAnalysisSettings {
    pub history_days: u32,
    pub weights: HashMap<String, f64>,
}

#[tauri::command]
pub async fn get_settings(workspace_path: String) -> Result<Value, String> {
    load_settings_from_disk(&workspace_path)
}

#[tauri::command]
pub async fn save_settings(workspace_path: String, settings: Value) -> Result<Value, String> {
    save_settings_to_disk(&workspace_path, settings)
}

pub fn load_effective_analysis_settings(workspace_path: &str) -> Result<EffectiveAnalysisSettings, String> {
    let settings = load_settings_from_disk(workspace_path)?;
    let history_days = settings
        .get("gitHistoryDays")
        .and_then(Value::as_u64)
        .unwrap_or(90)
        .clamp(7, 365) as u32;

    let mut weights = default_weights();
    if let Some(obj) = settings.get("weights").and_then(Value::as_object) {
        for (key, value) in obj {
            if let Some(v) = value.as_f64() {
                weights.insert(key.clone(), v);
            }
        }
    }

    // Defensive normalization to avoid malformed saved state.
    let sum: f64 = weights.values().copied().sum();
    if sum > f64::EPSILON {
        for value in weights.values_mut() {
            *value = (*value / sum).clamp(0.0, 1.0);
        }
    } else {
        weights = default_weights();
    }

    Ok(EffectiveAnalysisSettings {
        history_days,
        weights,
    })
}

pub fn load_settings_from_disk(workspace_path: &str) -> Result<Value, String> {
    let path = settings_path(workspace_path);
    ensure_debtengine_dir(workspace_path)?;

    let original = if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings.json: {e}"))?;
        serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let migrated = migrate_settings(original.clone());
    if migrated != original || !path.exists() {
        write_settings_file(&path, &migrated)?;
    }

    Ok(migrated)
}

pub fn save_settings_to_disk(workspace_path: &str, settings: Value) -> Result<Value, String> {
    let path = settings_path(workspace_path);
    ensure_debtengine_dir(workspace_path)?;

    let mut merged = load_settings_from_disk(workspace_path).unwrap_or_else(|_| default_settings());
    merge_settings(&mut merged, &settings);

    let migrated = migrate_settings(merged);
    write_settings_file(&path, &migrated)?;
    Ok(migrated)
}

fn settings_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path)
        .join(".debtengine")
        .join("settings.json")
}

fn ensure_debtengine_dir(workspace_path: &str) -> Result<(), String> {
    let dir = Path::new(workspace_path).join(".debtengine");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create .debtengine directory: {e}"))
}

fn write_settings_file(path: &Path, settings: &Value) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(path, raw)
        .map_err(|e| format!("Failed to write settings.json: {e}"))
}

fn migrate_settings(input: Value) -> Value {
    let defaults = default_settings();
    let mut out = match input {
        Value::Object(map) => Value::Object(map),
        _ => Value::Object(Map::new()),
    };

    deep_merge_defaults(&mut out, &defaults);

    let version = out
        .get("schema_version")
        .and_then(Value::as_i64)
        .unwrap_or(0);

    if version < 1 {
        migrate_weights_from_percentages(&mut out);
    }

    if version < 2 {
        // V2 introduces snapshot/notification keys with explicit defaults.
        ensure_key(&mut out, "snapshotSchedule", json!("weekly"));
        ensure_key(&mut out, "snapshotRetention", json!(52));
        ensure_key(&mut out, "notificationsEnabled", json!(true));
    }

    sanitize_settings(&mut out);
    if let Some(obj) = out.as_object_mut() {
        obj.insert("schema_version".to_string(), json!(SETTINGS_SCHEMA_VERSION));
    }

    out
}

fn default_settings() -> Value {
    json!({
        "schema_version": SETTINGS_SCHEMA_VERSION,
        "gitHistoryDays": 90,
        "churnNormalizationPercentile": 90,
        "weights": default_weights(),
        "warningThreshold": 65,
        "criticalThreshold": 80,
        "busFactor": 70,
        "colorScheme": "default",
        "nodeLabel": "always",
        "animationsEnabled": true,
        "snapshotSchedule": "weekly",
        "snapshotRetention": 52,
        "notificationsEnabled": true
    })
}

fn deep_merge_defaults(target: &mut Value, defaults: &Value) {
    let (Some(target_obj), Some(default_obj)) = (target.as_object_mut(), defaults.as_object()) else {
        return;
    };

    for (key, default_value) in default_obj {
        match target_obj.get_mut(key) {
            Some(existing) => {
                if existing.is_object() && default_value.is_object() {
                    deep_merge_defaults(existing, default_value);
                }
            }
            None => {
                target_obj.insert(key.clone(), default_value.clone());
            }
        }
    }
}

fn ensure_key(target: &mut Value, key: &str, value: Value) {
    if let Some(obj) = target.as_object_mut() {
        obj.entry(key.to_string()).or_insert(value);
    }
}

fn merge_settings(target: &mut Value, incoming: &Value) {
    match (target, incoming) {
        (Value::Object(target_obj), Value::Object(incoming_obj)) => {
            for (key, value) in incoming_obj {
                if let Some(existing) = target_obj.get_mut(key) {
                    merge_settings(existing, value);
                } else {
                    target_obj.insert(key.clone(), value.clone());
                }
            }
        }
        (target_slot, incoming_value) => {
            *target_slot = incoming_value.clone();
        }
    }
}

fn migrate_weights_from_percentages(settings: &mut Value) {
    let Some(weights) = settings.get_mut("weights").and_then(Value::as_object_mut) else {
        return;
    };

    let has_percentage_like_values = weights.values().any(|v| v.as_f64().unwrap_or(0.0) > 1.0);
    if !has_percentage_like_values {
        return;
    }

    for value in weights.values_mut() {
        if let Some(v) = value.as_f64() {
            *value = json!(v / 100.0);
        }
    }
}

fn sanitize_settings(settings: &mut Value) {
    let Some(obj) = settings.as_object_mut() else {
        return;
    };

    // Clamp numerics.
    clamp_u64(obj, "gitHistoryDays", 7, 365, 90);
    clamp_u64(obj, "churnNormalizationPercentile", 50, 99, 90);
    clamp_u64(obj, "warningThreshold", 30, 90, 65);
    clamp_u64(obj, "criticalThreshold", 50, 100, 80);
    clamp_u64(obj, "busFactor", 50, 95, 70);
    clamp_u64(obj, "snapshotRetention", 10, 260, 52);

    // Validate enums.
    sanitize_enum(obj, "colorScheme", &["default", "heatwave", "monochrome"], "default");
    sanitize_enum(obj, "nodeLabel", &["always", "hover", "never"], "always");
    sanitize_enum(obj, "snapshotSchedule", &["weekly", "biweekly", "manual"], "weekly");

    // Bools with defaults.
    ensure_bool(obj, "animationsEnabled", true);
    ensure_bool(obj, "notificationsEnabled", true);

    // Normalize weights.
    let default_weight_map = default_weights();
    let weights = obj
        .entry("weights".to_string())
        .or_insert_with(|| json!({}));

    if let Some(weight_obj) = weights.as_object_mut() {
        for (key, default_value) in default_weight_map {
            let current = weight_obj.get(&key).and_then(Value::as_f64).unwrap_or(default_value);
            weight_obj.insert(key, json!(current.clamp(0.0, 1.0)));
        }

        let sum: f64 = weight_obj.values().filter_map(Value::as_f64).sum();
        if sum > f64::EPSILON {
            for value in weight_obj.values_mut() {
                if let Some(v) = value.as_f64() {
                    *value = json!((v / sum).clamp(0.0, 1.0));
                }
            }
        }
    } else {
        *weights = json!(default_weight_map);
    }
}

fn clamp_u64(map: &mut Map<String, Value>, key: &str, min: u64, max: u64, default: u64) {
    let raw = map.get(key).and_then(Value::as_u64).unwrap_or(default);
    map.insert(key.to_string(), json!(raw.clamp(min, max)));
}

fn sanitize_enum(map: &mut Map<String, Value>, key: &str, allowed: &[&str], default: &str) {
    let valid = map
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| allowed.contains(value))
        .unwrap_or(default);
    map.insert(key.to_string(), json!(valid));
}

fn ensure_bool(map: &mut Map<String, Value>, key: &str, default: bool) {
    let value = map.get(key).and_then(Value::as_bool).unwrap_or(default);
    map.insert(key.to_string(), json!(value));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_percentage_weights_and_normalizes() {
        let input = json!({
            "schema_version": 0,
            "weights": {
                "churn_rate": 22,
                "code_smell_density": 20,
                "coupling_index": 18,
                "change_coupling": 12,
                "test_coverage_gap": 12,
                "knowledge_concentration": 8,
                "cyclomatic_complexity": 5,
                "decision_staleness": 3
            }
        });

        let migrated = migrate_settings(input);
        let sum: f64 = migrated
            .get("weights")
            .and_then(Value::as_object)
            .unwrap()
            .values()
            .filter_map(Value::as_f64)
            .sum();

        assert!((sum - 1.0).abs() < 1e-6);
        assert_eq!(
            migrated
                .get("schema_version")
                .and_then(Value::as_i64)
                .unwrap(),
            SETTINGS_SCHEMA_VERSION
        );
    }

    #[test]
    fn merges_partial_settings_without_losing_existing_values() {
        let mut existing = default_settings();
        merge_settings(&mut existing, &json!({ "gitHistoryDays": 30 }));
        let migrated = migrate_settings(existing);

        assert_eq!(migrated["gitHistoryDays"], json!(30));
        assert_eq!(migrated["criticalThreshold"], json!(80));
        assert!(migrated.get("weights").is_some());
    }
}
