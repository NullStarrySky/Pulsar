// src-tauri/src/backup.rs

use crate::error::{AppError, Result};
use chrono::Utc;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use zip::write::{FileOptions, ZipWriter};
use zip::{CompressionMethod, ZipArchive};

// 添加 Deserialize，因为现在它将从前端接收
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupSettings {
    pub max_backups: u32,
    pub excluded_paths: Vec<String>,
}

/// 获取应用数据目录的路径
fn get_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir)
}

// --- 结构体定义 ---

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    #[serde(with = "chrono::serde::ts_milliseconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub message: String,
    pub backup_name: String,
    pub size: u64,
}

// --- 辅助函数 ---

/// 获取备份目录的路径 (e.g., /path/to/appdata/backup)
fn get_backup_dir(app: &AppHandle) -> Result<PathBuf> {
    // 使用 ? 操作符简化错误处理
    let app_data_dir = app.path().app_data_dir()?;
    let backup_dir = app_data_dir.join("backup");
    Ok(backup_dir)
}

/// 检查并确保给定的备份文件名是安全的，防止路径遍历攻击
fn validate_backup_filename(filename: &str) -> Result<()> {
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(AppError::PathTraversal(filename.to_string()));
    }
    Ok(())
}

// --- Tauri 命令 ---

/// 获取所有备份文件的列表
#[tauri::command(rename_all = "snake_case")]
pub async fn list(app: AppHandle) -> Result<Vec<BackupInfo>> {
    let backup_dir = get_backup_dir(&app)?;
    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups = vec![];
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("zip") {
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };

            let metadata = entry.metadata()?;
            let created_at = metadata.created().or(metadata.modified()).ok();

            backups.push(BackupInfo {
                name: file_name,
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
                created_at: created_at.map(chrono::DateTime::<Utc>::from),
            });
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

/// 执行一次全量备份
#[tauri::command(rename_all = "snake_case")]
pub async fn perform(app: AppHandle, settings: BackupSettings) -> Result<BackupResult> {
    // 设置现在由前端传入，不再从文件加载
    let data_dir = get_data_dir(&app)?;
    let backup_dir = get_backup_dir(&app)?;

    fs::create_dir_all(&backup_dir)?;

    let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let backup_filename = format!("backup-{}.zip", timestamp);
    let backup_filepath = backup_dir.join(&backup_filename);

    info!("开始全量备份到: {}", backup_filepath.display());

    let excluded_paths_abs: Vec<PathBuf> = settings
        .excluded_paths
        .iter()
        .map(|p| data_dir.join(p))
        .collect();

    compress_dir(
        &data_dir,
        &backup_filepath,
        "data", // 在 zip 内部创建一个 'data' 根目录
        &excluded_paths_abs,
    )?;

    let final_size = fs::metadata(&backup_filepath)?.len();
    info!("备份成功创建: {}", backup_filename);

    // 删除旧备份
    let mut backups = list(app.clone()).await?;
    if backups.len() > settings.max_backups as usize {
        // list返回的已经是按时间倒序排列的，所以直接取末尾的即可
        backups.reverse(); // 反转为时间升序
        let to_delete_count = backups.len() - settings.max_backups as usize;
        for backup_to_delete in backups.iter().take(to_delete_count) {
            info!("删除旧备份: {}", &backup_to_delete.name);
            fs::remove_file(backup_dir.join(&backup_to_delete.name))?;
        }
    }

    Ok(BackupResult {
        message: format!("备份 {} 创建成功。", backup_filename),
        backup_name: backup_filename.clone(),
        size: final_size,
    })
}

/// 从指定的备份文件恢复数据
#[tauri::command(rename_all = "snake_case")]
pub async fn restore(app: AppHandle, backup_name: String) -> Result<String> {
    validate_backup_filename(&backup_name)?;
    warn!("收到从 {} 恢复的请求。这是一个危险操作。", backup_name);

    let data_dir = get_data_dir(&app)?;
    let backup_dir = get_backup_dir(&app)?;
    let backup_filepath = backup_dir.join(&backup_name);

    if !backup_filepath.exists() {
        return Err(AppError::NotFound(
            backup_filepath.to_string_lossy().to_string(),
        ));
    }

    info!("正在创建恢复前的紧急备份...");
    // 注意：紧急备份需要一个临时的设置，这里我们使用一个合理的默认值。
    // 或者，您可以要求前端也为紧急备份传递设置。
    let emergency_settings = BackupSettings {
        max_backups: 999, // 紧急备份不应触发旧备份删除
        excluded_paths: vec![".DS_Store".to_string(), "logs".to_string()],
    };
    perform(app.clone(), emergency_settings)
        .await
        .map_err(|e| {
            error!("创建恢复前备份失败: {:?}. 恢复操作已中止。", e);
            AppError::OperationFailed(format!("创建恢复前备份失败: {}. 恢复操作已中止。", e))
        })?;
    info!("紧急备份创建成功。");

    info!(
        "正在从 {} 解压到 {}...",
        backup_filepath.display(),
        data_dir.display()
    );

    decompress_zip(
        &backup_filepath,
        &data_dir,
        "data", // 从 zip 内的路径中剥离 'data' 前缀
    )?;

    info!("从备份 {} 恢复完成。", backup_name);

    Ok(format!(
        "数据已成功从 {} 恢复。应用配置需要重新加载。",
        backup_name
    ))
}

/// 将指定目录压缩成一个 ZIP 文件
pub fn compress_dir(
    src_dir: &Path,
    dst_file: &Path,
    base_prefix: &str,
    excluded_paths: &[PathBuf],
) -> Result<()> {
    info!(
        "开始压缩目录 '{}' 到 '{}'",
        src_dir.display(),
        dst_file.display()
    );

    let file = File::create(dst_file)?;
    let mut zip = ZipWriter::new(file);
    let options: FileOptions<()> =
        FileOptions::default().compression_method(CompressionMethod::Deflated);

    let walker = WalkDir::new(src_dir).into_iter();
    for entry in walker.filter_entry(|e| !excluded_paths.iter().any(|p| e.path().starts_with(p))) {
        let entry = entry.map_err(|e| AppError::Io(e.into()))?;
        let path = entry.path();
        let name = path
            .strip_prefix(src_dir)
            .expect("Path is not a prefix of the base path");

        let zip_path_str = Path::new(base_prefix)
            .join(name)
            .to_string_lossy()
            .into_owned();

        if path.is_file() {
            zip.start_file(zip_path_str, options)?;
            let mut f = File::open(path)?;
            io::copy(&mut f, &mut zip)?;
        } else if !name.as_os_str().is_empty() {
            zip.add_directory(zip_path_str, options)?;
        }
    }

    zip.finish()?;
    info!("目录压缩成功。");
    Ok(())
}
/// 将一个 ZIP 文件解压缩到指定目录
pub fn decompress_zip(src_file: &Path, dst_dir: &Path, strip_prefix: &str) -> Result<()> {
    info!(
        "开始从 '{}' 解压到 '{}'",
        src_file.display(),
        dst_dir.display()
    );

    let file = File::open(src_file)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;

        // --- 修复开始 ---
        // 关键修改：在 and_then 闭包 *内部* 就完成到 PathBuf 的转换。
        // 这样闭包返回的是 Option<PathBuf>，不再包含任何临时的借用。
        let outpath_rel = match file
            .enclosed_name()
            .and_then(|p| {
                p.strip_prefix(strip_prefix)
                 .ok()
                 .map(|s| s.to_path_buf()) // <--- 移动到这里
            })
        {
            Some(path) => path,
            None => continue,
        };
        // --- 修复结束 ---

        let outpath_abs = dst_dir.join(outpath_rel);

        if !outpath_abs.starts_with(dst_dir) {
            error!("检测到 Zip Slip 攻击尝试: {}", file.name());
            return Err(AppError::PathTraversal(file.name().to_string()));
        }

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath_abs)?;
        } else {
            if let Some(p) = outpath_abs.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath_abs)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }

    info!("文件解压成功。");
    Ok(())
}

/// [Tauri Command] 压缩一个文件夹
#[tauri::command(rename_all = "snake_case")]
pub async fn compress(source_dir: String, destination_zip: String) -> Result<()> {
    let src_path = PathBuf::from(source_dir);
    let dst_path = PathBuf::from(destination_zip);
    let excluded: [PathBuf; 0] = [];

    compress_dir(&src_path, &dst_path, "", &excluded)
}

/// [Tauri Command] 解压一个文件
#[tauri::command(rename_all = "snake_case")]
pub async fn decompress(source_zip: String, destination_dir: String) -> Result<()> {
    let src_path = PathBuf::from(source_zip);
    let dst_path = PathBuf::from(destination_dir);

    decompress_zip(&src_path, &dst_path, "")
}
