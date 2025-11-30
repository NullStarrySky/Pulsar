use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

// --- 状态定义 ---
pub struct RemoteServiceState {
    // 存储 窗口Label -> 发送通道 的映射
    pub peers: Arc<DashMap<String, mpsc::UnboundedSender<String>>>,
    // 动态分配的端口号
    pub port: Arc<tokio::sync::Mutex<u16>>,
}

impl RemoteServiceState {
    pub fn new() -> Self {
        Self {
            peers: Arc::new(DashMap::new()),
            port: Arc::new(tokio::sync::Mutex::new(0)),
        }
    }
}

// --- WebSocket 服务启动函数 ---
pub fn init_remote_service(app_handle: AppHandle, state: Arc<RemoteServiceState>) {
    tauri::async_runtime::spawn(async move {
        // 绑定到随机端口 (port 0)
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("Failed to bind WS server");
        let port = listener.local_addr().unwrap().port();

        // 更新状态中的端口
        {
            let mut p = state.port.lock().await;
            *p = port;
        }
        println!("[RemoteService] WebSocket server listening on port: {}", port);

        while let Ok((stream, _)) = listener.accept().await {
            let peers = state.peers.clone();
            let app = app_handle.clone();

            tokio::spawn(async move {
                let  ws_stream = tokio_tungstenite::accept_async(stream)
                    .await
                    .expect("Error during the websocket handshake");

                let (mut write, mut read) = ws_stream.split();
                let (tx, mut rx) = mpsc::unbounded_channel::<String>();

                let mut connected_label: Option<String> = None;

                loop {
                    tokio::select! {
                        // 1. 接收来自远程网页的消息
                        Some(msg) = read.next() => {
                            match msg {
                                Ok(msg) if msg.is_text() => {
                                    let text = msg.to_text().unwrap();
                                    // 尝试解析基础结构
                                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                                        // A. 处理注册消息
                                        if connected_label.is_none() {
                                            if let Some(type_) = json.get("type").and_then(|t| t.as_str()) {
                                                if type_ == "register" {
                                                    if let Some(label) = json.get("label").and_then(|l| l.as_str()) {
                                                        println!("[RemoteService] Registered: {}", label);
                                                        connected_label = Some(label.to_string());
                                                        peers.insert(label.to_string(), tx.clone());
                                                        continue;
                                                    }
                                                }
                                            }
                                        }

                                        // B. 处理普通消息转发 (Web -> Main)
                                        if let Some(label) = &connected_label {
                                            // 触发 Tauri 事件，发送给前端 Store
                                            // 事件名: remote-message
                                            let _ = app.emit("remote-message", serde_json::json!({
                                                "label": label,
                                                "payload": json
                                            }));
                                        }
                                    }
                                }
                                Ok(_) => {},
                                Err(_) => break, // 连接断开
                            }
                        }

                        // 2. 接收来自 Rust (Main) 的消息并发送给远程网页
                        Some(msg) = rx.recv() => {
                            if write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await.is_err() {
                                break;
                            }
                        }
                    }
                }

                // 清理连接
                if let Some(label) = connected_label {
                    peers.remove(&label);
                    println!("[RemoteService] Disconnected: {}", label);
                }
            });
        }
    });
}

// --- Command: 打开远程窗口 ---
#[tauri::command]
pub async fn open_remote_window(
    app: AppHandle,
    state: tauri::State<'_, Arc<RemoteServiceState>>,
    label: String,
    url: String,
    init_script_content: Option<String>,
    init_script_path: Option<String>,
) -> Result<(), String> {
    // 1. 获取端口
    let port = *state.port.lock().await;
    if port == 0 {
        return Err("Remote service not initialized yet".into());
    }

    // 2. 准备用户脚本
    let mut user_script = init_script_content.unwrap_or_default();
    if let Some(path) = init_script_path {
        match std::fs::read_to_string(&path) {
            Ok(content) => user_script.push_str(&format!("\n{}", content)),
            Err(e) => return Err(format!("Failed to read script file: {}", e)),
        }
    }

    // 3. 构造核心注入脚本 (负责建立 WS 连接)
    // 注意：这里我们注入了一个全局对象 window.RemoteAPI
    let bootstrap_script = format!(r#"
    (function() {{
        const PORT = {port};
        const LABEL = "{label}";
        let ws = null;
        let queue = [];

        function connect() {{
            console.log('[RemoteBridge] Connecting to port ' + PORT);
            ws = new WebSocket('ws://127.0.0.1:' + PORT);

            ws.onopen = () => {{
                console.log('[RemoteBridge] Connected');
                // 注册身份
                ws.send(JSON.stringify({{ type: 'register', label: LABEL }}));
                // 发送队列消息
                while(queue.length > 0) {{
                    ws.send(queue.shift());
                }}
            }};

            ws.onmessage = (e) => {{
                try {{
                    const data = JSON.parse(e.data);
                    // 触发网页内的自定义事件，供用户脚本监听
                    const event = new CustomEvent('remote-message', {{ detail: data }});
                    window.dispatchEvent(event);
                }} catch(e) {{}}
            }};

            ws.onclose = () => {{
                console.log('[RemoteBridge] Disconnected, retrying in 3s...');
                setTimeout(connect, 3000);
            }};
        }}

        // 暴露 API
        window.RemoteAPI = {{
            send: (data) => {{
                const payload = JSON.stringify(data);
                if (ws && ws.readyState === 1) {{
                    ws.send(payload);
                }} else {{
                    queue.push(payload);
                }}
            }},
            label: LABEL
        }};

        connect();
    }})();

    // --- 用户脚本开始 ---
    {user_script}
    "#, port = port, label = label, user_script = user_script);

    // 4. 创建窗口
    let win_builder = tauri::WebviewWindowBuilder::new(&app, label.clone(), tauri::WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?))
        .title("Remote Service")
        .initialization_script(&bootstrap_script);

    match win_builder.build() {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// --- Command: 发送消息到远程窗口 ---
#[tauri::command]
pub async fn send_to_remote_window(
    state: tauri::State<'_, Arc<RemoteServiceState>>,
    label: String,
    message: serde_json::Value
) -> Result<(), String> {
    if let Some(sender) = state.peers.get(&label) {
        let msg_str = serde_json::to_string(&message).map_err(|e| e.to_string())?;
        sender.send(msg_str).map_err(|_| "Failed to send message".to_string())?;
        Ok(())
    } else {
        Err(format!("Remote window '{}' not connected", label))
    }
}
