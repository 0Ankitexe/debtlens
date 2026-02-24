use crate::models::budget::DebtBudget;
use crate::models::file_score::{ComponentScore, FileScore, ScoreComponents};
use crate::models::register::RegisterItem;
use crate::models::snapshot::DebtSnapshot;
use rusqlite::{params, Connection, OptionalExtension, Result};

const DB_SCHEMA_VERSION: i64 = 3;

pub fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;

    let mut version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 1 {
        apply_migration_1(conn)?;
        version = 1;
        conn.pragma_update(None, "user_version", version)?;
    }

    if version < 2 {
        apply_migration_2(conn)?;
        version = 2;
        conn.pragma_update(None, "user_version", version)?;
    }

    if version < 3 {
        apply_migration_3(conn)?;
        version = 3;
        conn.pragma_update(None, "user_version", version)?;
    }

    if version > DB_SCHEMA_VERSION {
        // Future schema; do not fail reads/writes for forward-compatible changes.
        conn.pragma_update(None, "user_version", version)?;
    }

    Ok(())
}

fn apply_migration_1(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS file_scores (
            path TEXT PRIMARY KEY,
            relative_path TEXT NOT NULL,
            composite_score REAL NOT NULL DEFAULT 0,
            loc INTEGER NOT NULL DEFAULT 0,
            language TEXT NOT NULL DEFAULT '',
            last_modified INTEGER NOT NULL DEFAULT 0,
            supervision_status TEXT NOT NULL DEFAULT 'none',
            supervision_note TEXT,
            supervision_score REAL,
            mtime_cached INTEGER,
            score_data_json TEXT NOT NULL DEFAULT '{}',
            updated_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS debt_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            composite_score REAL NOT NULL,
            file_count INTEGER NOT NULL,
            high_debt_count INTEGER NOT NULL,
            commit_count_week INTEGER NOT NULL DEFAULT 0,
            snapshot_metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS debt_register (
            id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            file_path TEXT,
            severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')),
            item_type TEXT CHECK(item_type IN ('design', 'code', 'test', 'dependency', 'documentation', 'security', 'performance')),
            owner TEXT,
            target_sprint TEXT,
            estimated_hours REAL,
            actual_hours REAL,
            status TEXT CHECK(status IN ('open', 'in_progress', 'resolved', 'deferred', 'accepted')) DEFAULT 'open',
            tags TEXT DEFAULT '[]',
            linked_commit TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS debt_budgets (
            id TEXT PRIMARY KEY,
            pattern TEXT NOT NULL,
            label TEXT NOT NULL,
            max_score REAL NOT NULL,
            created_at INTEGER NOT NULL,
            notify_on_breach INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS coupling_pairs (
            file_a TEXT NOT NULL,
            file_b TEXT NOT NULL,
            co_change_count INTEGER NOT NULL DEFAULT 0,
            coupling_ratio REAL NOT NULL DEFAULT 0,
            has_import_link INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (file_a, file_b)
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            file_path TEXT PRIMARY KEY,
            pinned_at INTEGER NOT NULL
        );
        ",
    )
}

fn apply_migration_2(conn: &Connection) -> Result<()> {
    add_column_if_missing(conn, "file_scores", "mtime_cached INTEGER")?;
    add_column_if_missing(conn, "file_scores", "score_data_json TEXT NOT NULL DEFAULT '{}' ")?;
    add_column_if_missing(conn, "file_scores", "updated_at INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "file_scores", "supervision_note TEXT")?;
    add_column_if_missing(conn, "file_scores", "supervision_score REAL")?;

    // Backfill JSON field for old rows.
    conn.execute(
        "UPDATE file_scores SET score_data_json = '{}' WHERE score_data_json IS NULL OR score_data_json = ''",
        [],
    )?;

    Ok(())
}

fn apply_migration_3(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_file_scores_relative_path ON file_scores(relative_path);
        CREATE INDEX IF NOT EXISTS idx_file_scores_mtime ON file_scores(mtime_cached);
        CREATE INDEX IF NOT EXISTS idx_debt_snapshots_timestamp ON debt_snapshots(timestamp);
        CREATE INDEX IF NOT EXISTS idx_watchlist_pinned_at ON watchlist(pinned_at);
        ",
    )
}

fn add_column_if_missing(conn: &Connection, table: &str, column_def: &str) -> Result<()> {
    let column_name = column_def
        .split_whitespace()
        .next()
        .unwrap_or(column_def)
        .to_string();

    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|res| res.ok())
        .any(|name| name == column_name);

    if !exists {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column_def}"), [])?;
    }

    Ok(())
}

pub fn get_db_connection(workspace_path: &str) -> Result<Connection> {
    let db_path = format!("{workspace_path}/.debtengine/state.db");
    let conn = Connection::open(db_path)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

pub fn upsert_file_scores(conn: &Connection, files: &[FileScore]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for file in files {
        upsert_file_score_with_conn(&tx, file)?;
    }
    tx.commit()
}

pub fn upsert_file_score(conn: &Connection, file: &FileScore) -> Result<()> {
    upsert_file_score_with_conn(conn, file)
}

fn upsert_file_score_with_conn(conn: &Connection, file: &FileScore) -> Result<()> {
    let components_json = serde_json::to_string(&file.components).unwrap_or_else(|_| "{}".to_string());
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "
        INSERT INTO file_scores (
            path,
            relative_path,
            composite_score,
            loc,
            language,
            last_modified,
            supervision_status,
            mtime_cached,
            score_data_json,
            updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(path) DO UPDATE SET
            relative_path = excluded.relative_path,
            composite_score = excluded.composite_score,
            loc = excluded.loc,
            language = excluded.language,
            last_modified = excluded.last_modified,
            supervision_status = excluded.supervision_status,
            mtime_cached = excluded.mtime_cached,
            score_data_json = excluded.score_data_json,
            updated_at = excluded.updated_at
        ",
        params![
            file.path,
            file.relative_path,
            file.composite_score,
            file.loc as i64,
            file.language,
            file.last_modified,
            file.supervision_status,
            file.last_modified,
            components_json,
            now,
        ],
    )?;

    Ok(())
}

pub fn load_cached_file_mtime(conn: &Connection, file_path: &str) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT mtime_cached FROM file_scores WHERE path = ?1",
        params![file_path],
        |row| row.get(0),
    )
    .optional()
}

pub fn load_cached_file_score(conn: &Connection, file_path: &str) -> Result<Option<FileScore>> {
    conn.query_row(
        "SELECT path, relative_path, composite_score, loc, language, last_modified, supervision_status, score_data_json FROM file_scores WHERE path = ?1",
        params![file_path],
        |row| {
            let score_data_json: String = row.get(7)?;
            let components = serde_json::from_str::<ScoreComponents>(&score_data_json)
                .unwrap_or_else(|_| empty_components());

            Ok(FileScore {
                path: row.get(0)?,
                relative_path: row.get(1)?,
                composite_score: row.get(2)?,
                components,
                loc: row.get::<_, i64>(3)? as usize,
                language: row.get(4)?,
                last_modified: row.get(5)?,
                supervision_status: row.get::<_, String>(6)?,
            })
        },
    )
    .optional()
}

fn empty_components() -> ScoreComponents {
    let zero = ComponentScore {
        raw_score: 0.0,
        weight: 0.0,
        contribution: 0.0,
        details: Vec::new(),
    };

    ScoreComponents {
        churn_rate: zero.clone(),
        code_smell_density: zero.clone(),
        coupling_index: zero.clone(),
        change_coupling: zero.clone(),
        test_coverage_gap: zero.clone(),
        knowledge_concentration: zero.clone(),
        cyclomatic_complexity: zero.clone(),
        decision_staleness: zero,
    }
}

#[tauri::command]
pub async fn take_snapshot(
    workspace_path: String,
    composite_score: f64,
    file_count: usize,
    high_debt_count: usize,
    commit_count_week: usize,
    metadata_json: Option<String>,
) -> Result<DebtSnapshot, String> {
    let conn = get_db_connection(&workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO debt_snapshots (timestamp, composite_score, file_count, high_debt_count, commit_count_week, snapshot_metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![now, composite_score, file_count as i64, high_debt_count as i64, commit_count_week as i64, metadata_json],
    ).map_err(|e| format!("Insert error: {e}"))?;

    let id = conn.last_insert_rowid();

    Ok(DebtSnapshot {
        id,
        timestamp: now,
        composite_score,
        file_count,
        high_debt_count,
        commit_count_week,
        snapshot_metadata: metadata_json,
    })
}

#[tauri::command]
pub async fn get_debt_snapshots(workspace_path: String) -> Result<Vec<DebtSnapshot>, String> {
    let conn = get_db_connection(&workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, composite_score, file_count, high_debt_count, commit_count_week, snapshot_metadata FROM debt_snapshots ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let snapshots = stmt
        .query_map([], |row| {
            Ok(DebtSnapshot {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                composite_score: row.get(2)?,
                file_count: row.get::<_, i64>(3)? as usize,
                high_debt_count: row.get::<_, i64>(4)? as usize,
                commit_count_week: row.get::<_, i64>(5)? as usize,
                snapshot_metadata: row.get(6)?,
            })
        })
        .map_err(|e| format!("Map error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(snapshots)
}

#[tauri::command]
pub async fn register_crud(
    workspace_path: String,
    operation: String,
    item: Option<RegisterItem>,
    id: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = get_db_connection(&workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;

    match operation.as_str() {
        "create" => {
            let item = item.ok_or("Item required for create")?;
            let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT INTO debt_register (id, created_at, updated_at, title, description, file_path, severity, item_type, owner, target_sprint, estimated_hours, actual_hours, status, tags, linked_commit, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![&item.id, item.created_at, item.updated_at, &item.title, &item.description, item.file_path.as_deref(), &item.severity, &item.item_type, item.owner.as_deref(), item.target_sprint.as_deref(), item.estimated_hours, item.actual_hours, &item.status, tags_json, item.linked_commit.as_deref(), item.notes.as_deref()],
            )
            .map_err(|e| format!("Insert error: {e}"))?;
            Ok(serde_json::json!({"status": "created", "id": item.id}))
        }
        "update" => {
            let item = item.ok_or("Item required for update")?;
            let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "UPDATE debt_register SET updated_at=?2, title=?3, description=?4, file_path=?5, severity=?6, item_type=?7, owner=?8, target_sprint=?9, estimated_hours=?10, actual_hours=?11, status=?12, tags=?13, linked_commit=?14, notes=?15 WHERE id=?1",
                params![&item.id, item.updated_at, &item.title, &item.description, item.file_path.as_deref(), &item.severity, &item.item_type, item.owner.as_deref(), item.target_sprint.as_deref(), item.estimated_hours, item.actual_hours, &item.status, tags_json, item.linked_commit.as_deref(), item.notes.as_deref()],
            )
            .map_err(|e| format!("Update error: {e}"))?;
            Ok(serde_json::json!({"status": "updated", "id": item.id}))
        }
        "read" => {
            let id = id.ok_or("ID required for read")?;
            let mut stmt = conn
                .prepare("SELECT id, created_at, updated_at, title, description, file_path, severity, item_type, owner, target_sprint, estimated_hours, actual_hours, status, tags, linked_commit, notes FROM debt_register WHERE id = ?1")
                .map_err(|e| format!("Query error: {e}"))?;

            let item: Option<RegisterItem> = stmt
                .query_row(params![id], |row| {
                    let tags_str: String = row.get(13)?;
                    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                    Ok(RegisterItem {
                        id: row.get(0)?,
                        created_at: row.get(1)?,
                        updated_at: row.get(2)?,
                        title: row.get(3)?,
                        description: row.get(4)?,
                        file_path: row.get(5)?,
                        severity: row.get(6)?,
                        item_type: row.get(7)?,
                        owner: row.get(8)?,
                        target_sprint: row.get(9)?,
                        estimated_hours: row.get(10)?,
                        actual_hours: row.get(11)?,
                        status: row.get(12)?,
                        tags,
                        linked_commit: row.get(14)?,
                        notes: row.get(15)?,
                    })
                })
                .optional()
                .map_err(|e| format!("Read error: {e}"))?;

            Ok(serde_json::to_value(item).unwrap_or(serde_json::Value::Null))
        }
        "list" => {
            let mut stmt = conn
                .prepare("SELECT id, created_at, updated_at, title, description, file_path, severity, item_type, owner, target_sprint, estimated_hours, actual_hours, status, tags, linked_commit, notes FROM debt_register ORDER BY created_at DESC")
                .map_err(|e| format!("Query error: {e}"))?;

            let items: Vec<RegisterItem> = stmt
                .query_map([], |row| {
                    let tags_str: String = row.get(13)?;
                    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                    Ok(RegisterItem {
                        id: row.get(0)?,
                        created_at: row.get(1)?,
                        updated_at: row.get(2)?,
                        title: row.get(3)?,
                        description: row.get(4)?,
                        file_path: row.get(5)?,
                        severity: row.get(6)?,
                        item_type: row.get(7)?,
                        owner: row.get(8)?,
                        target_sprint: row.get(9)?,
                        estimated_hours: row.get(10)?,
                        actual_hours: row.get(11)?,
                        status: row.get(12)?,
                        tags,
                        linked_commit: row.get(14)?,
                        notes: row.get(15)?,
                    })
                })
                .map_err(|e| format!("Map error: {e}"))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(serde_json::to_value(items).unwrap_or_default())
        }
        "delete" => {
            let id = id.ok_or("ID required for delete")?;
            conn.execute("DELETE FROM debt_register WHERE id = ?1", params![id])
                .map_err(|e| format!("Delete error: {e}"))?;
            Ok(serde_json::json!({"status": "deleted"}))
        }
        _ => Err(format!("Unknown operation: {operation}")),
    }
}

#[tauri::command]
pub async fn budget_crud(
    workspace_path: String,
    operation: String,
    item: Option<DebtBudget>,
    id: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = get_db_connection(&workspace_path)
        .map_err(|e| format!("DB error: {e}"))?;

    match operation.as_str() {
        "create" => {
            let item = item.ok_or("Item required for create")?;
            conn.execute(
                "INSERT INTO debt_budgets (id, pattern, label, max_score, created_at, notify_on_breach) VALUES (?1,?2,?3,?4,?5,?6)",
                params![&item.id, &item.pattern, &item.label, item.max_score, item.created_at, item.notify_on_breach as i32],
            )
            .map_err(|e| format!("Insert error: {e}"))?;
            Ok(serde_json::json!({"status": "created", "id": item.id}))
        }
        "update" => {
            let item = item.ok_or("Item required for update")?;
            conn.execute(
                "UPDATE debt_budgets SET pattern=?2, label=?3, max_score=?4, notify_on_breach=?5 WHERE id=?1",
                params![&item.id, &item.pattern, &item.label, item.max_score, item.notify_on_breach as i32],
            )
            .map_err(|e| format!("Update error: {e}"))?;
            Ok(serde_json::json!({"status": "updated", "id": item.id}))
        }
        "read" => {
            let id = id.ok_or("ID required for read")?;
            let mut stmt = conn
                .prepare("SELECT id, pattern, label, max_score, created_at, notify_on_breach FROM debt_budgets WHERE id = ?1")
                .map_err(|e| format!("Query error: {e}"))?;

            let item: Option<DebtBudget> = stmt
                .query_row(params![id], |row| {
                    Ok(DebtBudget {
                        id: row.get(0)?,
                        pattern: row.get(1)?,
                        label: row.get(2)?,
                        max_score: row.get(3)?,
                        created_at: row.get(4)?,
                        notify_on_breach: row.get::<_, i32>(5)? != 0,
                    })
                })
                .optional()
                .map_err(|e| format!("Read error: {e}"))?;

            Ok(serde_json::to_value(item).unwrap_or(serde_json::Value::Null))
        }
        "list" => {
            let mut stmt = conn
                .prepare("SELECT id, pattern, label, max_score, created_at, notify_on_breach FROM debt_budgets ORDER BY created_at DESC")
                .map_err(|e| format!("Query error: {e}"))?;

            let items: Vec<DebtBudget> = stmt
                .query_map([], |row| {
                    Ok(DebtBudget {
                        id: row.get(0)?,
                        pattern: row.get(1)?,
                        label: row.get(2)?,
                        max_score: row.get(3)?,
                        created_at: row.get(4)?,
                        notify_on_breach: row.get::<_, i32>(5)? != 0,
                    })
                })
                .map_err(|e| format!("Map error: {e}"))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(serde_json::to_value(items).unwrap_or_default())
        }
        "delete" => {
            let id = id.ok_or("ID required for delete")?;
            conn.execute("DELETE FROM debt_budgets WHERE id = ?1", params![id])
                .map_err(|e| format!("Delete error: {e}"))?;
            Ok(serde_json::json!({"status": "deleted"}))
        }
        _ => Err(format!("Unknown operation: {operation}")),
    }
}

#[tauri::command]
pub async fn watchlist_crud(
    workspace_path: String,
    operation: String,
    file_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = get_db_connection(&workspace_path).map_err(|e| e.to_string())?;

    match operation.as_str() {
        "list" => {
            let mut stmt = conn
                .prepare("SELECT file_path, pinned_at FROM watchlist ORDER BY pinned_at ASC")
                .map_err(|e| format!("Query error: {e}"))?;
            let items: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    Ok(serde_json::json!({
                        "file_path": row.get::<_, String>(0)?,
                        "pinned_at": row.get::<_, i64>(1)?,
                    }))
                })
                .map_err(|e| format!("Query error: {e}"))?
                .filter_map(|r| r.ok())
                .collect();
            Ok(serde_json::to_value(items).unwrap_or_default())
        }
        "pin" => {
            let fp = file_path.ok_or("file_path required")?;
            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM watchlist", [], |r| r.get(0))
                .unwrap_or(0);

            let already_pinned: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM watchlist WHERE file_path = ?1)",
                    params![&fp],
                    |r| r.get(0),
                )
                .unwrap_or(false);

            if count >= 5 && !already_pinned {
                return Err("Watchlist is full (max 5 files). Unpin a file first.".to_string());
            }

            let now = chrono::Utc::now().timestamp();
            conn.execute(
                "INSERT OR REPLACE INTO watchlist (file_path, pinned_at) VALUES (?1, ?2)",
                params![&fp, now],
            )
            .map_err(|e| format!("Insert error: {e}"))?;
            Ok(serde_json::json!({"status": "pinned"}))
        }
        "unpin" => {
            let fp = file_path.ok_or("file_path required")?;
            conn.execute("DELETE FROM watchlist WHERE file_path = ?1", params![fp])
                .map_err(|e| format!("Delete error: {e}"))?;
            Ok(serde_json::json!({"status": "unpinned"}))
        }
        _ => Err(format!("Unknown operation: {operation}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_initializes_with_expected_version() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        initialize_schema(&conn).expect("schema init");
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("schema version");
        assert_eq!(version, DB_SCHEMA_VERSION);
    }

    #[test]
    fn file_score_round_trip_preserves_score_data() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        initialize_schema(&conn).expect("schema init");

        let score = FileScore {
            path: "/tmp/example.rs".to_string(),
            relative_path: "src/example.rs".to_string(),
            composite_score: 42.5,
            components: empty_components(),
            loc: 100,
            language: "rust".to_string(),
            last_modified: 123,
            supervision_status: "none".to_string(),
        };

        upsert_file_score(&conn, &score).expect("upsert file score");
        let loaded = load_cached_file_score(&conn, &score.path)
            .expect("load file score")
            .expect("score exists");

        assert_eq!(loaded.relative_path, score.relative_path);
        assert_eq!(loaded.composite_score, score.composite_score);
        assert_eq!(loaded.loc, score.loc);
    }
}
