// src-tauri/src/sidecar_manager.rs

use serde_json::json;
use std::time::Duration;
use tauri::Emitter;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tokio::sync::oneshot; // 引入 one-shot channel，用于一次性信令

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

    // 创建一个一次性通道，用于在 sidecar 启动并输出 stdout 后发出信号
    let (tx, rx) = oneshot::channel::<()>();
    // 将 sender 包装起来，以便在异步任务中安全地、一次性地使用它
    let sender = Mutex::new(Some(tx));

    // 启动 sidecar 进程。 "app" 与您原始 TS 代码中的名称匹配。
    let (mut event_rx, child) = app
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
        while let Some(event) = event_rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    // 锁定 sender 以安全地访问它
                    let mut sender_guard = sender.lock().await;
                    // take() 会取出 Some(tx) 并留下 None，确保信号只被发送一次
                    if let Some(tx) = sender_guard.take() {
                        println!("Sidecar sent first stdout, signaling ready state.");
                        // 发送信号，通知主任务 sidecar 已准备就绪
                        // .ok() 会忽略接收端可能已关闭的错误
                        let _ = tx.send(());
                    }

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

    // 等待来自 sidecar 的 stdout 信号，并设置一个15秒的超时
    println!("Waiting for sidecar to be ready...");
    match tokio::time::timeout(Duration::from_secs(15), rx).await {
        Ok(Ok(_)) => {
            println!("Sidecar is ready. Proceeding to send init data.");
        }
        Ok(Err(_)) => {
            // 如果 sender 在发送前被销毁，会发生这个错误
            return Err("Failed to receive ready signal from sidecar: channel closed.".to_string());
        }
        Err(_) => {
            // 超时错误
            return Err("Timed out waiting for sidecar to start. It may have failed or is not producing any output.".to_string());
        }
    }

    // --- Sidecar 准备就绪后，继续执行以下逻辑 ---

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
