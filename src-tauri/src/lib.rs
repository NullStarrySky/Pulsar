// src-tauri/src/lib.rs

mod backup;
mod secrets_manager;
mod script_manager;
mod remote_service;
mod proxy_server;

mod error;

use std::collections::HashMap; // 引入 HashMap
use std::sync::Arc;
use remote_service::{RemoteServiceState, init_remote_service};
use tauri::{Manager, RunEvent, WindowEvent}; // 引入 RunEvent
use tokio::sync::Mutex; // 确保 Mutex 被引入

/// 统一的子进程清理函数
/// 这个函数会阻塞式地执行清理，以确保在应用退出前完成
fn cleanup_child_processes(handle: &tauri::AppHandle) {
    println!("Starting cleanup of child processes...");

    // 创建一个新的、单线程的 tokio 运行时来同步执行异步的清理代码
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    rt.block_on(async {

        // 关闭所有脚本
        let script_state = handle.state::<script_manager::ScriptProcessState>();
        let mut children_lock = script_state.children.lock().await;
        let paths: Vec<String> = children_lock.keys().cloned().collect();

        if !paths.is_empty() {
            println!("Shutting down {} script process(es)...", paths.len());
        }

        for path in paths {
            if let Some(child) = children_lock.remove(&path) {
                if let Err(e) = child.kill() {
                    eprintln!("Failed to kill script process for {}: {}", path, e);
                } else {
                    println!("Script process for {} terminated.", path);
                }
            }
        }
    });
    println!("Cleanup of child processes finished.");
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 将 Builder 的结果赋值给一个变量 `app`
    let app = tauri::Builder::default()
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
        .manage(script_manager::ScriptProcessState { // 添加 ScriptProcessState
               children: Mutex::new(HashMap::new()),
           })
        // 注册端口状态，初始为 0
        .manage(proxy_server::ProxyPort(std::sync::Mutex::new(0)))
        // 注册所有命令
        .invoke_handler(tauri::generate_handler![
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
            secrets_manager::delete_secret_key,
            proxy_server::get_proxy_port,
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
                // --- 启动代理服务器 ---
                         let port = proxy_server::start_proxy_server(app.handle().clone());
                         // 将端口号保存到 State 中
                         let port_state = app.state::<proxy_server::ProxyPort>();
                         *port_state.0.lock().unwrap() = port;
                         println!("Proxy server initialized on port: {}", port);

              Ok(())
            })
        .on_window_event(|window, event| match event {
                  WindowEvent::Destroyed => {
                      // 当最后一个窗口被销毁时，执行清理。
                      // len() <= 1 是因为在这个事件触发时，被销毁的窗口可能还在窗口列表中。
                      if window.app_handle().webview_windows().len() <= 1 {
                          println!("Last window destroyed, cleaning up child processes...");
                          cleanup_child_processes(&window.app_handle());
                      }
                  }
                  _ => {}
              })
              .build(tauri::generate_context!())
              .expect("error while running tauri application");

          // 调用 .run() 并传入一个闭包来处理应用级别的事件
          app.run(|app_handle, event| {
              if let RunEvent::ExitRequested { .. } = event {
                  println!("Application exit requested, cleaning up child processes...");
                  cleanup_child_processes(app_handle);
                  // 这里不需要调用 api.prevent_exit()，因为我们的清理函数是同步阻塞的。
              }
          });
      }
