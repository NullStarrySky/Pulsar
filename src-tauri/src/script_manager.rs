// src-tauri/src/script_manager.rs

use std::collections::HashMap;
use std::path::{PathBuf};
use tauri::{AppHandle, Manager, State, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

// 用于管理所有脚本子进程的状态结构
pub struct ScriptProcessState {
    // 使用脚本的路径作为 Key，方便管理
    pub children: Mutex<HashMap<String, CommandChild>>,
}

// 定义发送到前端的事件载荷 (This part is unchanged)
#[derive(Clone, serde::Serialize)]
struct ScriptOutput {
    path: String,
    line: String,
    stream: String, // "stdout" or "stderr"
}

#[derive(Clone, serde::Serialize)]
struct ScriptTerminated {
    path: String,
    code: Option<i32>,
    signal: Option<i32>,
}

// 验证并规范化脚本路径 (This function is unchanged)
fn validate_script_path(app: &AppHandle, path_str: &str) -> Result<PathBuf, String> {
    // 1. 检查文件后缀
    if !path_str.ends_with(".sh") && !path_str.ends_with(".bat") {
        return Err("Invalid script type. Only .sh and .bat files are allowed.".into());
    }

    // 2. 获取 <app_data_dir>/executable 安全目录
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let executable_dir = app_data_dir.join("executable");

    // 3. 解析并规范化用户传入的路径
    let script_path = PathBuf::from(path_str);
    let canonical_path = script_path
        .canonicalize()
        .map_err(|_| format!("Script not found at path: {}", path_str))?;

    // 4. 确保脚本路径在我们的安全目录内
    if !canonical_path.starts_with(&executable_dir) {
        return Err(format!(
            "Security Error: Script is not located within the allowed directory."
        ));
    }

    Ok(canonical_path)
}

#[tauri::command]
pub async fn execute_script(
    app: AppHandle,
    state: State<'_, ScriptProcessState>,
    path: String,
) -> Result<(), String> {
    let script_path = validate_script_path(&app, &path)?;
    let script_path_str = script_path.to_str().unwrap().to_string();

    let mut children = state.children.lock().await;

    if children.contains_key(&script_path_str) {
        return Err("Script is already running.".into());
    }

    // 根据操作系统选择解释器
    let (cmd, args) = if cfg!(windows) {
        ("cmd", vec!["/C", &script_path_str])
    } else {
        ("sh", vec!["-c", &script_path_str])
    };

    let (mut rx, child) = app.shell() // Use the ShellExt trait on AppHandle
        .command(cmd)
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    // 将子进程存入状态
    children.insert(script_path_str.clone(), child);

    let app_clone = app.clone();
    let path_clone = script_path_str.clone();

    // 异步监听脚本输出
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    app_clone
                        .emit("script-output", ScriptOutput {
                            path: path_clone.clone(),
                            line: String::from_utf8_lossy(&line).to_string(),
                            stream: "stdout".into(),
                        })
                        .unwrap();
                }
                CommandEvent::Stderr(line) => {
                    app_clone
                        .emit("script-output", ScriptOutput {
                            path: path_clone.clone(),
                            line: String::from_utf8_lossy(&line).to_string(),
                            stream: "stderr".into(),
                        })
                        .unwrap();
                }
                CommandEvent::Terminated(payload) => {
                    app_clone
                        .emit("script-terminated", ScriptTerminated {
                            path: path_clone.clone(),
                            code: payload.code,
                            signal: payload.signal,
                        })
                        .unwrap();
                    break; // 进程结束，退出监听循环
                }
                CommandEvent::Error(e) => {
                     app_clone
                        .emit("script-output", ScriptOutput {
                            path: path_clone.clone(),
                            line: e,
                            stream: "stderr".into(),
                        })
                        .unwrap();
                }
                _ => {}
            }
        }

        let script_state: State<ScriptProcessState> = app_clone.state();


        let mut children = script_state.children.lock().await;
        children.remove(&path_clone);
        println!("[Script Manager] Cleaned up terminated process: {}", path_clone);
    });

    Ok(())
}

#[tauri::command]
pub async fn shutdown_script(
    state: State<'_, ScriptProcessState>,
    path: String,
) -> Result<(), String> {
    let mut children = state.children.lock().await;

    if let Some(child) = children.remove(&path) {
        child.kill().map_err(|e| e.to_string())?;
        println!("Successfully shut down script: {}", path);
        Ok(())
    } else {
        Err("Script not found or not running.".into())
    }
}
