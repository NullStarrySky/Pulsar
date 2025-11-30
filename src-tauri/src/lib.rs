// src-tauri/src/lib.rs
mod backup;
mod secrets_manager;
mod script_manager;
mod sidecar_manager;
mod remote_service;
mod error;

use std::sync::Arc;
use remote_service::{RemoteServiceState, init_remote_service};
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        // 初始化 SidecarState
        .manage(sidecar_manager::SidecarState {
            child_process: Default::default(),
        })
        // 注册所有命令
        .invoke_handler(tauri::generate_handler![
            sidecar_manager::initialize_sidecar,
            sidecar_manager::shutdown_sidecar,
            backup::list,
            backup::perform,
            backup::restore,
            backup::compress,
            backup::decompress,
            script_manager::execute_script,
            script_manager::shutdown_script,
            secrets_manager::get_all_available_keys,
            secrets_manager::is_key_available,
            secrets_manager::write_secret_key,
            remote_service::open_remote_window,
            remote_service::send_to_remote_window
        ])
        .setup(|app| {
                let remote_state = Arc::new(RemoteServiceState::new());
                app.manage(remote_state.clone());
                #[cfg(desktop)]
                init_remote_service(app.handle().clone(), remote_state);

                {
                  app.handle().plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--flag1", "--flag2"])))?;
                  app.handle().plugin(tauri_plugin_positioner::init())?;
                  tauri::tray::TrayIconBuilder::new()
                      .on_tray_icon_event(|tray_handle, event| {
                        tauri_plugin_positioner::on_tray_event(tray_handle.app_handle(), &event);
                      })
                      .build(app)?;
                }
              Ok(())
            })
        .on_window_event(|window, event| match event {
            WindowEvent::Destroyed => {
                if window.app_handle().webview_windows().len() == 1 {
                    println!("Last window closed, terminating sidecar process...");

                    let app_handle = window.app_handle().clone();

                    // 在异步任务中终止子进程，以避免阻塞UI线程
                    tauri::async_runtime::spawn(async move {
                        // 现在 `app_handle` 是一个独立的副本，拥有 'static 生命周期
                        let state = app_handle.state::<sidecar_manager::SidecarState>();
                        let mut child_lock = state.child_process.lock().await;

                        // 使用 take() 将值从 Option 中移出，并留下 None
                        if let Some(child) = child_lock.take() {
                            // 尝试终止子进程
                            if let Err(e) = child.kill() {
                                eprintln!("Failed to kill sidecar process: {}", e);
                            } else {
                                println!("Sidecar process terminated successfully.");
                            }
                        }
                    });
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
