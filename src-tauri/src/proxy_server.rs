// src-tauri/src/proxy_server.rs

use axum::{
    body::Body,
    extract::{State, Request},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{ Response},
    routing::any,
    Router,
};
use regex::Regex;
use reqwest::Client;
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};
use tauri::{AppHandle, Manager};
use lazy_static::lazy_static;
use crate::secrets_manager; // 引用你的 secrets_manager 模块

lazy_static! {
    static ref SECRET_REGEX: Regex = Regex::new(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}").unwrap();
}

// 用于在 State 中共享 AppHandle 和 HTTP Client
#[derive(Clone)]
struct ProxyState {
    app: AppHandle,
    client: Client,
}

// 替换字符串中的 {{KEY}}
fn replace_secrets(input: &str, secrets: &std::collections::HashMap<String, String>) -> String {
    SECRET_REGEX.replace_all(input, |caps: &regex::Captures| {
        let key = &caps[1];
        secrets.get(key).cloned().unwrap_or_else(|| caps[0].to_string())
    }).to_string()
}

// 代理处理函数
async fn proxy_handler(
    State(state): State<ProxyState>,
    mut req: Request,
) -> Result<Response, (StatusCode, String)> {
    // 1. 获取最新的密钥
    let secrets = secrets_manager::read_secrets(&state.app)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to load secrets: {}", e)))?;

    // 2. 从 Header 中提取目标 URL (前端传过来的)
    let target_url_header = req.headers_mut().remove("X-Forward-To")
        .ok_or((StatusCode::BAD_REQUEST, "Missing X-Forward-To header".to_string()))?;

    let target_url_str = target_url_header.to_str()
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid X-Forward-To header".to_string()))?;

    // 3. 替换 URL 中的密钥
    let final_url = replace_secrets(target_url_str, &secrets);

    // 4. 处理 Headers (替换 Authorization 等 Header 中的密钥)
    let mut forward_headers = HeaderMap::new();
    for (name, value) in req.headers() {
        // 跳过 Host 等敏感 Header，防止冲突
        if name == "host" || name == "content-length" {
            continue;
        }

        if let Ok(val_str) = value.to_str() {
            let replaced_val = replace_secrets(val_str, &secrets);
            if let Ok(new_val) = HeaderValue::from_str(&replaced_val) {
                forward_headers.insert(name, new_val);
            }
        } else {
            // 如果不是 UTF-8 字符串，直接转发
            forward_headers.insert(name, value.clone());
        }
    }

    // 5. 构建并发送请求
    // 注意：req.into_body() 是流式的，直接转发给 reqwest
    let reqwest_builder = state.client
        .request(req.method().clone(), &final_url)
        .headers(forward_headers)
        .body(reqwest::Body::wrap_stream(req.into_body().into_data_stream()));

    let remote_res = reqwest_builder.send().await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Request failed: {}", e)))?;

    // 6. 构建响应
    // 将 reqwest 的响应状态码和 Header 转换回 Axum 响应
    let status = remote_res.status();
    let mut res_builder = Response::builder().status(status);

    // 转发响应 Header
    if let Some(headers) = res_builder.headers_mut() {
        for (name, value) in remote_res.headers() {
            headers.insert(name, value.clone());
        }
    }

    // 7. 流式转发响应体 (这对 SSE/AI 对话至关重要)
    let body = Body::from_stream(remote_res.bytes_stream());

    Ok(res_builder.body(body).unwrap())
}

// 启动服务器
pub fn start_proxy_server(app: AppHandle) -> u16 {
    // 自动寻找一个可用端口
    let port = portpicker::pick_unused_port().unwrap_or(14500);

    let state = ProxyState {
        app: app.clone(),
        client: Client::builder().build().unwrap(),
    };

    // 配置最宽松的 CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)      // 允许任何来源 (Include localhost:1420)
        .allow_methods(Any)     // 允许任何方法 (GET, POST, OPTIONS...)
        .allow_headers(Any);    // 允许任何 Header (包括 X-Forward-To)


    let app_router = Router::new()
        .route("/*path", any(proxy_handler)) // 匹配所有路径
        .layer(cors)
        .with_state(state);

    // 在异步线程中启动服务器
    tauri::async_runtime::spawn(async move {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        println!("Local Proxy Server running on http://{}", addr);
        axum::serve(listener, app_router).await.unwrap();
    });

    port
}

// 一个命令，供前端获取端口号
#[tauri::command]
pub fn get_proxy_port(app: AppHandle) -> u16 {
    // 这里我们使用 Store 或者 Global 变量来存端口，
    // 但为简化，我们在 setup 时将其存入 app 的 state 或者直接由前端在初始化时获取
    // 简单的做法：我们在 setup 阶段存入 State，这里读取
    *app.state::<ProxyPort>().0.lock().unwrap()
}

pub struct ProxyPort(pub std::sync::Mutex<u16>);
