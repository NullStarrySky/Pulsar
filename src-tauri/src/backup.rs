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

// --- 结构体定义 ---

// 添加 Deserialize，因为现在它将从前端接收
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupSettings {
    pub max_backups: u32,
    pub excluded_paths: Vec<String>,
}

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

/// 获取应用数据目录的路径
fn get_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir)
}

/// 获取备份目录的路径 (e.g., /path/to/appdata/backup)
fn get_backup_dir(app: &AppHandle) -> Result<PathBuf> {
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

// --- 通用压缩/解压逻辑 ---

/// 将指定目录压缩成一个 ZIP 文件
/// src_dir: 源目录
/// dst_file: 目标 zip 文件路径
/// base_prefix: zip 内部的根路径前缀 (例如 "data")，传 "" 则不添加前缀
/// excluded_paths: 需要排除的绝对路径列表

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

        // 排除根目录本身，避免添加空名字条目
        if path == src_dir {
            continue;
        }

        // 计算 zip 内的相对路径
        let name = path
            .strip_prefix(src_dir)
            .expect("Path is not a prefix of the base path");

        // --- 关键修改开始 ---
        // 1. 获取字符串形式
        let name_str = name.to_string_lossy();

        // 2. 强制转换 Windows 反斜杠为标准 ZIP 斜杠
        // ZIP 规范要求必须是 forward slashes
        let normalized_name = name_str.replace('\\', "/");

        // 3. 手动拼接前缀，不使用 Path::join (避免再次引入系统分隔符)
        let zip_path_str = if base_prefix.is_empty() {
            normalized_name
        } else {
            format!("{}/{}", base_prefix, normalized_name)
        };
        // --- 关键修改结束 ---

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
/// src_file: zip 文件路径
/// dst_dir: 目标目录
/// strip_prefix: 解压时需要移除的内部前缀 (例如 "data")，传 "" 则保持原样
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

        // 路径处理：剥离前缀
        let outpath_rel = match file
            .enclosed_name()
            .and_then(|p| {
                p.strip_prefix(strip_prefix)
                 .ok()
                 .map(|s| s.to_path_buf())
            })
        {
            Some(path) => path,
            None => continue,
        };

        let outpath_abs = dst_dir.join(outpath_rel);

        // 安全检查
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

// --- Tauri 命令: 通用压缩/解压 ---

/// [Tauri Command] 压缩文件或文件夹
/// from_path: 源路径
/// to_path: (可选) 目标文件夹路径。默认为 from_path 的父级
/// exclude: (可选) 需要排除的文件/文件夹模式字符串数组
#[tauri::command(rename_all = "camelCase")]
pub async fn compress(
    from_path: String,
    to_path: Option<String>,
    exclude: Option<Vec<String>>,
) -> Result<()> {
    let src_path = PathBuf::from(&from_path);
    if !src_path.exists() {
        return Err(AppError::NotFound(from_path));
    }

    // 1. 确定目标文件夹
    let parent_dir = src_path
        .parent()
        .ok_or_else(|| AppError::OperationFailed("无法获取父级目录".into()))?;

    let target_dir = match to_path {
        Some(ref p) => PathBuf::from(p),
        None => parent_dir.to_path_buf(),
    };

    // 确保目标文件夹存在
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)?;
    }

    // 2. 确定 ZIP 文件名 (源文件名.zip)
    let file_name = src_path
        .file_name()
        .ok_or_else(|| AppError::OperationFailed("无效的源路径名称".into()))?
        .to_string_lossy();
    let zip_name = format!("{}.zip", file_name);
    let dest_zip_path = target_dir.join(zip_name);

    info!("正在压缩 {} 到 {}", src_path.display(), dest_zip_path.display());

    // 3. 处理排除项 (转为绝对路径)
    let excluded_paths_abs: Vec<PathBuf> = exclude
        .unwrap_or_default()
        .iter()
        .map(|p| src_path.join(p))
        .collect();

    // 4. 执行压缩
    if src_path.is_file() {
        // 单文件压缩特殊处理：直接将文件放入 zip 根目录
        let file = File::create(&dest_zip_path)?;
        let mut zip = ZipWriter::new(file);
        let options: FileOptions<()> =
            FileOptions::default().compression_method(CompressionMethod::Deflated);

        zip.start_file(file_name.into_owned(), options)?;
        let mut f = File::open(&src_path)?;
        io::copy(&mut f, &mut zip)?;
        zip.finish()?;
        info!("单文件压缩成功。");
    } else {
        // 文件夹压缩：使用现有逻辑，前缀为空
        compress_dir(&src_path, &dest_zip_path, "", &excluded_paths_abs)?;
    }

    Ok(())
}

/// [Tauri Command] 解压文件
/// from_path: zip 文件路径
/// to_path: (可选) 解压到的目标文件夹。默认为 from_path 的父级
#[tauri::command(rename_all = "camelCase")]
pub async fn decompress(from_path: String, to_path: Option<String>) -> Result<()> {
    let src_path = PathBuf::from(&from_path);
    if !src_path.exists() {
        return Err(AppError::NotFound(from_path));
    }

    // 1. 确定目标文件夹
    let parent_dir = src_path
        .parent()
        .ok_or_else(|| AppError::OperationFailed("无法获取父级目录".into()))?;

    let target_dir = match to_path {
        Some(ref p) => PathBuf::from(p),
        None => parent_dir.to_path_buf(),
    };

    // 2. 执行解压 (前缀为空)
    decompress_zip(&src_path, &target_dir, "")
}

// --- Tauri 命令: 备份相关 (保留原有业务逻辑) ---

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
        "data", // 业务逻辑：在 zip 内部创建一个 'data' 根目录
        &excluded_paths_abs,
    )?;

    let final_size = fs::metadata(&backup_filepath)?.len();
    info!("备份成功创建: {}", backup_filename);

    // 删除旧备份
    let mut backups = list(app.clone()).await?;
    if backups.len() > settings.max_backups as usize {
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
        "data", // 业务逻辑：从 zip 内的路径中剥离 'data' 前缀
    )?;

    info!("从备份 {} 恢复完成。", backup_name);

    Ok(format!(
        "数据已成功从 {} 恢复。应用配置需要重新加载。",
        backup_name
    ))
}
