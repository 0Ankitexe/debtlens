use git2::{Repository, Signature};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tempfile::TempDir;
use debtlens_lib::commands::db::{budget_crud, register_crud, watchlist_crud};
use debtlens_lib::commands::git::open_workspace;
use debtlens_lib::commands::scoring::{reanalyze_file_internal, run_full_analysis_internal};
use debtlens_lib::commands::settings::{get_settings, save_settings};
use debtlens_lib::models::budget::DebtBudget;
use debtlens_lib::models::file_score::AnalysisCache;
use debtlens_lib::models::register::RegisterItem;

fn create_workspace_with_git_repo() -> (TempDir, String, String) {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let workspace_path = temp_dir.path().to_string_lossy().to_string();
    let relative_file = "src/main.rs";
    let absolute_file = temp_dir.path().join(relative_file).to_string_lossy().to_string();

    fs::create_dir_all(Path::new(&absolute_file).parent().expect("parent")).expect("create src dir");
    fs::write(&absolute_file, "fn main() {\n    println!(\"hello\");\n}\n").expect("write source file");

    let repo = Repository::init(temp_dir.path()).expect("init git repo");
    let mut index = repo.index().expect("open git index");
    index
        .add_path(Path::new(relative_file))
        .expect("add source file");
    index.write().expect("write git index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let signature = Signature::now("Test User", "test@example.com").expect("signature");
    repo.commit(Some("HEAD"), &signature, &signature, "init", &tree, &[])
        .expect("commit");

    (
        temp_dir,
        workspace_path,
        absolute_file,
    )
}

#[tokio::test]
async fn open_workspace_returns_expected_metadata_contract() {
    let (_tmp, workspace_path, _file_path) = create_workspace_with_git_repo();

    let meta = open_workspace(workspace_path.clone())
        .await
        .expect("open workspace");

    assert_eq!(meta.path, workspace_path);
    assert!(!meta.repo_name.is_empty());
    assert!(!meta.branch.is_empty());
    assert!(meta.file_count >= 1);
}

#[tokio::test]
async fn settings_commands_round_trip_and_merge_partial_updates() {
    let (_tmp, workspace_path, _file_path) = create_workspace_with_git_repo();
    open_workspace(workspace_path.clone())
        .await
        .expect("open workspace");

    let initial = get_settings(workspace_path.clone())
        .await
        .expect("load settings");
    assert!(initial.get("weights").is_some());

    let saved = save_settings(
        workspace_path.clone(),
        json!({
            "gitHistoryDays": 30,
            "snapshotSchedule": "manual",
            "notificationsEnabled": false
        }),
    )
    .await
    .expect("save settings");

    assert_eq!(saved["gitHistoryDays"], json!(30));
    assert_eq!(saved["snapshotSchedule"], json!("manual"));
    assert_eq!(saved["notificationsEnabled"], json!(false));
    assert_eq!(saved["criticalThreshold"], initial["criticalThreshold"]);
}

#[tokio::test]
async fn register_and_budget_commands_support_full_crud_contract() {
    let (_tmp, workspace_path, _file_path) = create_workspace_with_git_repo();
    open_workspace(workspace_path.clone())
        .await
        .expect("open workspace");

    let now = chrono::Utc::now().timestamp();
    let register_item = RegisterItem {
        id: "reg-1".to_string(),
        created_at: now,
        updated_at: now,
        title: "Refactor parser".to_string(),
        description: "Legacy parser module has high complexity".to_string(),
        file_path: Some("src/main.rs".to_string()),
        severity: "high".to_string(),
        item_type: "code".to_string(),
        owner: Some("alice".to_string()),
        target_sprint: Some("SPRINT-10".to_string()),
        estimated_hours: Some(8.0),
        actual_hours: None,
        status: "open".to_string(),
        tags: vec!["parser".to_string(), "refactor".to_string()],
        linked_commit: None,
        notes: Some("Prioritize this quarter".to_string()),
    };

    let create_register = register_crud(
        workspace_path.clone(),
        "create".to_string(),
        Some(register_item.clone()),
        None,
    )
    .await
    .expect("create register item");
    assert_eq!(create_register["status"], json!("created"));

    let read_register = register_crud(
        workspace_path.clone(),
        "read".to_string(),
        None,
        Some(register_item.id.clone()),
    )
    .await
    .expect("read register item");
    assert_eq!(read_register["id"], json!(register_item.id.clone()));
    assert_eq!(read_register["title"], json!(register_item.title.clone()));

    let list_register = register_crud(workspace_path.clone(), "list".to_string(), None, None)
        .await
        .expect("list register items");
    let register_items = list_register.as_array().expect("register list array");
    assert!(
        register_items
            .iter()
            .any(|entry| entry["id"] == json!(register_item.id.clone()))
    );

    let update_register = register_crud(
        workspace_path.clone(),
        "update".to_string(),
        Some(RegisterItem {
            status: "in_progress".to_string(),
            updated_at: now + 10,
            ..register_item.clone()
        }),
        None,
    )
    .await
    .expect("update register item");
    assert_eq!(update_register["status"], json!("updated"));

    let budget_item = DebtBudget {
        id: "budget-1".to_string(),
        pattern: "src/**".to_string(),
        label: "Core source".to_string(),
        max_score: 70.0,
        created_at: now,
        notify_on_breach: true,
    };

    let create_budget = budget_crud(
        workspace_path.clone(),
        "create".to_string(),
        Some(budget_item.clone()),
        None,
    )
    .await
    .expect("create budget");
    assert_eq!(create_budget["status"], json!("created"));

    let read_budget = budget_crud(
        workspace_path.clone(),
        "read".to_string(),
        None,
        Some(budget_item.id.clone()),
    )
    .await
    .expect("read budget");
    assert_eq!(read_budget["id"], json!(budget_item.id.clone()));
    assert_eq!(read_budget["max_score"], json!(budget_item.max_score));

    let update_budget = budget_crud(
        workspace_path.clone(),
        "update".to_string(),
        Some(DebtBudget {
            max_score: 65.0,
            ..budget_item.clone()
        }),
        None,
    )
    .await
    .expect("update budget");
    assert_eq!(update_budget["status"], json!("updated"));

    let list_budgets = budget_crud(workspace_path.clone(), "list".to_string(), None, None)
        .await
        .expect("list budgets");
    let budget_items = list_budgets.as_array().expect("budget list array");
    assert!(
        budget_items
            .iter()
            .any(|entry| entry["id"] == json!(budget_item.id.clone()))
    );
}

#[tokio::test]
async fn watchlist_commands_pin_list_and_unpin_files() {
    let (_tmp, workspace_path, file_path) = create_workspace_with_git_repo();
    open_workspace(workspace_path.clone())
        .await
        .expect("open workspace");

    let pin = watchlist_crud(
        workspace_path.clone(),
        "pin".to_string(),
        Some(file_path.clone()),
    )
    .await
    .expect("pin file");
    assert_eq!(pin["status"], json!("pinned"));

    let listed = watchlist_crud(workspace_path.clone(), "list".to_string(), None)
        .await
        .expect("list watchlist");
    let items = listed.as_array().expect("watchlist array");
    assert!(
        items
            .iter()
            .any(|entry| entry["file_path"] == json!(file_path.clone()))
    );

    let unpin = watchlist_crud(
        workspace_path.clone(),
        "unpin".to_string(),
        Some(file_path.clone()),
    )
    .await
    .expect("unpin file");
    assert_eq!(unpin["status"], json!("unpinned"));
}

#[tokio::test]
async fn reanalyze_file_updates_cache_and_persisted_mtime() {
    let (_tmp, workspace_path, file_path) = create_workspace_with_git_repo();
    open_workspace(workspace_path.clone())
        .await
        .expect("open workspace");

    let cache = Arc::new(Mutex::new(AnalysisCache::default()));
    let result = run_full_analysis_internal(&workspace_path, &cache, |_| {})
        .expect("run full analysis");
    assert!(result.file_count >= 1);

    let unchanged = reanalyze_file_internal(&workspace_path, &file_path, &cache)
        .expect("reanalyze unchanged file");
    assert_eq!(unchanged.path, file_path);

    std::thread::sleep(Duration::from_secs(1));
    fs::write(
        &file_path,
        "fn main() {\n    println!(\"changed\");\n    println!(\"again\");\n}\n",
    )
    .expect("rewrite source file");

    let updated = reanalyze_file_internal(&workspace_path, &file_path, &cache)
        .expect("reanalyze changed file");
    assert_eq!(updated.path, file_path);
    assert!(updated.last_modified >= unchanged.last_modified);

    let cache_lock = cache.lock().expect("cache lock");
    let cached_result = cache_lock.result.as_ref().expect("cached result");
    assert!(cached_result.files.iter().any(|file| file.path == file_path));
}
