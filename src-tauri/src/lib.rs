pub mod commands;
pub mod models;
pub mod analysis;

use commands::{
    git::{open_workspace, run_git_analysis},
    scoring::{run_full_analysis, get_heatmap_data, get_file_breakdown, get_change_couplings, reanalyze_file},
    ast::run_ast_analysis,
    db::{register_crud, budget_crud, take_snapshot, get_debt_snapshots, watchlist_crud},
    settings::{get_settings, save_settings},
    watcher::start_file_watcher,
};
use models::file_score::AnalysisCache;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(AnalysisCache::default())))
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            run_git_analysis,
            run_full_analysis,
            reanalyze_file,
            run_ast_analysis,
            get_heatmap_data,
            get_file_breakdown,
            get_change_couplings,
            take_snapshot,
            get_debt_snapshots,
            register_crud,
            budget_crud,
            watchlist_crud,
            get_settings,
            save_settings,
            start_file_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
