use notify::Watcher;
use tauri::Emitter;
use std::sync::mpsc;
use std::time::Duration;

#[tauri::command]
pub async fn start_file_watcher(
    workspace_path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    }).map_err(|e| format!("Watcher init error: {}", e))?;

    watcher.watch(
        std::path::Path::new(&workspace_path),
        notify::RecursiveMode::Recursive,
    ).map_err(|e| format!("Watch error: {}", e))?;

    // Spawn a thread to forward events (debounced)
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let _watcher = watcher; // Keep watcher alive
        let mut last_event_time = std::time::Instant::now();

        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(event) => {
                    let now = std::time::Instant::now();
                    if now.duration_since(last_event_time) > Duration::from_millis(500) {
                        for path in &event.paths {
                            let path_str = path.to_string_lossy().to_string();
                            let _ = app_handle.emit("file_changed", serde_json::json!({
                                "path": path_str,
                                "event_type": format!("{:?}", event.kind),
                            }));
                        }
                        last_event_time = now;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(())
}
