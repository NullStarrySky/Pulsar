// src-tauri/src/error.rs

use serde::{Serialize, Serializer};
use thiserror::Error;

// 定义一个 Result 类型别名，简化函数签名
// 所有返回 Result 的函数都将使用我们自定义的 AppError 作为错误类型
pub type Result<T> = std::result::Result<T, AppError>;

// 使用 thiserror 宏来派生常见的 trait
#[derive(Debug, Error)]
pub enum AppError {
    // 包装标准的 I/O 错误
    // `#[from]` 会自动为 `std::io::Error` 实现 `From<std::io::Error> for AppError`
    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),

    // 包装 Tauri 自身的错误
    #[error("Tauri Error: {0}")]
    Tauri(#[from] tauri::Error),

    // 包装 zip 库的错误
    #[error("Zip Error: {0}")]
    Zip(#[from] zip::result::ZipError),

    // 包装 walkdir 库的错误
    #[error("Directory walking error: {0}")]
    WalkDir(#[from] walkdir::Error),

    // 自定义错误：文件或资源未找到
    #[error("Not Found: {0}")]
    NotFound(String),

    // 自定义错误：检测到路径遍历攻击
    #[error("Path Traversal Attempt: Invalid path '{0}'")]
    PathTraversal(String),

    // 自定义错误：通用操作失败，附带描述信息
    #[error("Operation Failed: {0}")]
    OperationFailed(String),

    // 可以在这里添加更多自定义错误类型...
}

// 为了让 AppError 可以在 Tauri 命令的 Result<T, E> 中被序列化并传递给前端，
// 我们需要为它实现 `serde::Serialize`。
// 一个简单的方法是把错误转换成字符串。
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
