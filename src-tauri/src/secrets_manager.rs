// src-tauri/src/secrets_manager.rs

use serde::{Serialize};
use serde_json;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// 定义错误类型，方便在命令中返回
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Failed to get app data directory")]
    AppDataDir,
}

// 为了让错误能被 Tauri 正确序列化并发送到前端
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

// 辅助函数：获取 secrets.json 的完整路径
// 如果文件或目录不存在，则创建它们
fn get_secrets_path(app: &AppHandle) -> Result<PathBuf, Error> {
    let app_data_dir = app.path()
        .app_data_dir()
        .map_err(|_| Error::AppDataDir)?;

    // 确保 app_data_dir 存在
    fs::create_dir_all(&app_data_dir)?;

    let secrets_file_path = app_data_dir.join("secrets.json");

    // 如果 secrets.json 文件不存在，则创建一个空的 JSON 对象文件
    if !secrets_file_path.exists() {
        let mut file = File::create(&secrets_file_path)?;
        file.write_all(b"{}")?; // 写入一个空的 JSON 对象
    }

    Ok(secrets_file_path)
}

// 辅助函数：从文件读取密钥
pub fn read_secrets(app: &AppHandle) -> Result<HashMap<String, String>, Error> {
    let path = get_secrets_path(app)?;
    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    let secrets: HashMap<String, String> = serde_json::from_str(&contents)?;
    Ok(secrets)
}

// 辅助函数：将密钥写入文件
fn write_secrets(app: &AppHandle, secrets: &HashMap<String, String>) -> Result<(), Error> {
    let path = get_secrets_path(app)?;
    let contents = serde_json::to_string_pretty(secrets)?;
    let mut file = File::create(path)?;
    file.write_all(contents.as_bytes())?;
    Ok(())
}


// --- Tauri Commands ---

#[tauri::command]
pub fn write_secret_key(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let mut secrets = read_secrets(&app).map_err(|e| e.to_string())?;
    secrets.insert(key, value);
    write_secrets(&app, &secrets).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_key_available(app: AppHandle, key: String) -> Result<bool, String> {
    let secrets = read_secrets(&app).map_err(|e| e.to_string())?;
    Ok(secrets.contains_key(&key))
}

#[tauri::command]
pub fn get_all_available_keys(app: AppHandle) -> Result<Vec<String>, String> {
    let secrets = read_secrets(&app).map_err(|e| e.to_string())?;
    Ok(secrets.keys().cloned().collect())
}
