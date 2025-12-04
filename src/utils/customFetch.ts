// src/utils/customFetch.ts
import { invoke } from "@tauri-apps/api/core";

let PROXY_PORT: number | null = null;

/**
 * 初始化并获取代理端口。建议在应用启动（如 main.ts）时调用一次。
 */
export async function initProxy() {
  try {
    PROXY_PORT = await invoke<number>("get_proxy_port");
    console.log(`Proxy server linked on port: ${PROXY_PORT}`);
  } catch (e) {
    console.error("Failed to get proxy port", e);
  }
}

/**
 * 自定义 Fetch 函数。
 * 1. 自动将请求转发到本地 Rust 代理服务器。
 * 2. 自动处理流式响应。
 * 3. 通过 Rust 后端安全替换 {{SECRET_KEY}}。
 */
export async function customFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // 确保端口已加载
  if (!PROXY_PORT) {
    await initProxy();
  }

  // 计算原始的目标 URL
  let targetUrl: string;
  if (typeof input === "string") {
    targetUrl = input;
  } else if (input instanceof URL) {
    targetUrl = input.toString();
  } else if (input instanceof Request) {
    targetUrl = input.url;
  } else {
    throw new Error("Invalid URL input");
  }

  // 构建指向本地代理的 URL
  // 路径保持不变，方便调试，虽然代理通过 Header 路由，但保留 path 有助于日志
  // 例如： target: https://api.openai.com/v1/chat -> http://localhost:14500/v1/chat
  const urlObj = new URL(targetUrl);
  const proxyUrl = `http://127.0.0.1:${PROXY_PORT}${urlObj.pathname}${urlObj.search}`;

  // 准备 Headers
  const headers = new Headers(init?.headers);

  // 核心：设置真实目标 URL，供后端拦截并替换密钥
  headers.set("X-Forward-To", targetUrl);

  // 构造新的 RequestInit
  const newInit: RequestInit = {
    ...init,
    headers: headers,
    // 确保 method, body, signal 等都被正确透传
  };

  // 发送请求到本地代理
  return fetch(proxyUrl, newInit);
}

(window as any).customFetch = customFetch;
