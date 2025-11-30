// src-tauri/src/sidecar_manager.rs

use serde_json::json;
use std::time::Duration;
use tauri::Emitter;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

/// 定义用于管理 Sidecar 进程状态的结构体。
/// 这与您在 main.rs 中初始化的方式相匹配。
pub struct SidecarState {
    pub child_process: Mutex<Option<CommandChild>>,
}

#[tauri::command]
pub async fn initialize_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    // 锁定 state 以检查子进程是否已存在
    let mut child_lock = state.child_process.lock().await;

    if child_lock.is_some() {
        println!("Sidecar process is already running.");
        return Ok(()); // 如果已存在，直接返回成功
    }

    println!("Initializing sidecar process...");

    // 启动 sidecar 进程。 "app" 与您原始 TS 代码中的名称匹配。
    let (mut rx, child) = app
        .shell()
        .sidecar("app")
        .expect("Failed to create sidecar command")
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // 将子进程句柄存储到 state 中
    *child_lock = Some(child);

    // 克隆 AppHandle 以在新的异步任务中使用
    let app_handle_clone = app.clone();

    // 异步任务：监听 sidecar 的输出并通过事件发送到前端
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    println!("[Sidecar STDOUT]: {}", line_str);
                    app_handle_clone
                        .emit("sidecar-stdout", &line_str)
                        .expect("Failed to emit stdout event");
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[Sidecar STDERR]: {}", line_str);
                    app_handle_clone
                        .emit("sidecar-stderr", &line_str)
                        .expect("Failed to emit stderr event");
                }
                CommandEvent::Error(e) => {
                    eprintln!("[Sidecar Error]: {}", e);
                    app_handle_clone
                        .emit("sidecar-stderr", &e)
                        .expect("Failed to emit error event");
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[Sidecar Terminated]: code={}, signal={}",
                        payload.code.unwrap_or(-1),
                        payload.signal.unwrap_or(-1)
                    );
                    app_handle_clone.emit("sidecar-terminated", ()).unwrap();
                }
                _ => {}
            }
        }
    });

    // 等待一小段时间，确保 sidecar 内的 HTTP 服务器已启动
    tokio::time::sleep(Duration::from_millis(1500)).await;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let data_dir_str = data_dir
        .to_str()
        .ok_or("Path contains invalid UTF-8")?
        .to_string();

    println!("Sending appDataDir to sidecar: {}", data_dir_str);

    let client = reqwest::Client::new();
    let res = client
        .post("http://127.0.0.1:4130/api/init")
        .json(&json!({ "appDataDir": data_dir_str }))
        .send()
        .await;

    match res {
        Ok(response) => {
            if !response.status().is_success() {
                let error_msg = format!(
                    "Failed to send appDataDir, status: {}, body: {}",
                    response.status(),
                    response.text().await.unwrap_or_else(|_| "N/A".to_string())
                );
                eprintln!("{}", error_msg);
                return Err(error_msg);
            }
            println!("Successfully sent appDataDir to sidecar.");
        }
        Err(e) => {
            let error_msg = format!("Error sending appDataDir to sidecar: {}", e);
            eprintln!("{}", error_msg);
            return Err(error_msg);
        }
    }

    Ok(())
}

// 用于手动关闭 Sidecar 的命令
#[tauri::command]
pub async fn shutdown_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    println!("Attempting to shut down sidecar process manually...");

    // 锁定 state 以安全地访问子进程句柄
    let mut child_lock = state.child_process.lock().await;

    // 使用 take() 将值从 Option 中移出，留下 None
    if let Some(child) = child_lock.take() {
        // 尝试终止子进程
        match child.kill() {
            Ok(_) => {
                println!("Sidecar process terminated successfully via command.");
                Ok(())
            }
            Err(e) => {
                let error_msg = format!("Failed to kill sidecar process: {}", e);
                eprintln!("{}", error_msg);
                Err(error_msg)
            }
        }
    } else {
        println!("Sidecar process was not running.");
        Ok(()) // 如果进程本就不存在，也视为成功
    }
}
