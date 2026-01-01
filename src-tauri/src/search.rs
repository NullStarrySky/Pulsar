use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use walkdir::WalkDir;
use regex::RegexBuilder;

#[derive(Debug, Deserialize)]
pub struct SearchConfig {
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
    target_dir: String, // 搜索的目标目录，通常是当前打开的工作区
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    path: String,
    result: Vec<String>,
}

fn is_binary_file(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return true, // 无法打开视为“不可读/二进制”以跳过
    };
    let mut buffer = [0; 1024];
    let n = match file.read(&mut buffer) {
        Ok(n) => n,
        Err(_) => return true,
    };
    // 简单启发式：如果前1024字节包含NULL字节，视为二进制
    buffer[..n].contains(&0)
}

#[tauri::command]
pub async fn search_in_files(keyword: String, config: SearchConfig) -> Result<Vec<SearchResult>, String> {
    if keyword.is_empty() {
        return Ok(vec![]);
    }

    let mut results: Vec<SearchResult> = Vec::new();

    // 构建正则表达式
    let pattern = if config.is_regex {
        keyword.clone()
    } else {
        regex::escape(&keyword)
    };

    let final_pattern = if config.whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    let re = RegexBuilder::new(&final_pattern)
        .case_insensitive(!config.case_sensitive)
        .build()
        .map_err(|e| format!("Invalid regex: {}", e))?;

    // 遍历文件
    for entry in WalkDir::new(&config.target_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            // 简单的忽略逻辑：跳过 .git, node_modules 等
            let path_str = path.to_string_lossy();
            if path_str.contains("node_modules") || path_str.contains(".git") || path_str.contains("target") {
                continue;
            }

            if is_binary_file(path) {
                continue;
            }

            let file = match File::open(path) {
                Ok(f) => f,
                Err(_) => continue,
            };
            let reader = BufReader::new(file);
            let mut matches: Vec<String> = Vec::new();

            // 逐行读取匹配
            for (index, line) in reader.lines().enumerate() {
                if let Ok(content) = line {
                    if re.is_match(&content) {
                        // 返回格式： "行号: 内容" (去除了首尾空格)
                        matches.push(format!("{}: {}", index + 1, content.trim()));
                    }
                }
            }

            if !matches.is_empty() {
                results.push(SearchResult {
                    path: path_str.to_string(),
                    result: matches,
                });
            }
        }
    }

    Ok(results)
}
