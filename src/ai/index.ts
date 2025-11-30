// src/ai/index.ts

import type {
  GenerateTextResult,
  StreamTextResult,
  GenerateObjectResult,
  StreamObjectResult,
  EmbedResult,
  EmbedManyResult,
  Experimental_GenerateImageResult as GenerateImageResult,
  Experimental_SpeechResult as SpeechResult,
  Tool,
  JSONSchema7,
} from "ai";
import { v4 as uuidv4 } from "uuid";

// =================================================================================
// 配置
// =================================================================================
const SIDECAR_WEBSOCKET_URL = "ws://127.0.0.1:4130/ws";
const SIDECAR_BASE_URL = "http://127.0.0.1:4130";

// =================================================================================
// WebSocket 通信管理器
// =================================================================================

let ws: WebSocket | null = null;
let connectionPromise: Promise<WebSocket> | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    streamController?: AbortController;
  }
>();
const functionRegistry = new Map<string, Function>();
const abortSignalRegistry = new Map<string, AbortController>();

const getWebSocket = (): Promise<WebSocket> => {
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      // 检查是否已有连接或正在连接
      if (
        ws &&
        ws.readyState !== WebSocket.CLOSED &&
        ws.readyState !== WebSocket.CLOSING
      ) {
        if (ws.readyState === WebSocket.OPEN) {
          return resolve(ws);
        }
        // 如果正在连接，等待 onopen
        ws.addEventListener("open", () => resolve(ws as WebSocket), {
          once: true,
        });
        ws.addEventListener("error", (err) => reject(err), { once: true });
        return;
      }

      console.log("Creating new WebSocket connection...");
      ws = new WebSocket(SIDECAR_WEBSOCKET_URL);

      ws.onopen = () => {
        console.log("WebSocket connection established.");
        resolve(ws!);
      };

      ws.onmessage = (event) => {
        const { requestId, type, payload, error } = JSON.parse(event.data);
        const request = pendingRequests.get(requestId);
        if (!request) return;

        switch (type) {
          case "result":
            request.resolve(payload);
            pendingRequests.delete(requestId);
            break;
          case "error":
            request.reject(new Error(error));
            pendingRequests.delete(requestId);
            break;
          case "stream-chunk":
            break;
          case "stream-end":
            request.resolve(payload);
            pendingRequests.delete(requestId);
            break;
          case "remote-function-call":
            handleRemoteFunctionCall(payload);
            break;
          default:
            console.warn("Unknown message type:", type);
        }
      };
      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        pendingRequests.forEach((request, id) => {
          request.reject(new Error("WebSocket connection error."));
          pendingRequests.delete(id);
        });
        connectionPromise = null; // 重置 promise 以便下次重连
        reject(new Error("WebSocket connection error."));
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        connectionPromise = null; // 重置 promise
        ws = null;
      };
    });
  }
  return connectionPromise;
};

// 相应地更新 sendRequest
const sendRequest = async (api: string, args: any): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    const requestId = uuidv4();
    const serializedArgs = serialize(args);

    pendingRequests.set(requestId, { resolve, reject });

    try {
      const socket = await getWebSocket(); // 等待连接成功
      const payload = JSON.stringify({ api, requestId, args: serializedArgs });
      socket.send(payload);
    } catch (error) {
      reject(error);
      pendingRequests.delete(requestId);
    }
  });
};

const handleRemoteFunctionCall = async ({
  callId,
  functionId,
  args,
}: {
  callId: string;
  functionId: string;
  args: any[];
}) => {
  const func = functionRegistry.get(functionId);
  const webSocket = await getWebSocket();
  if (!func) {
    webSocket.send(
      JSON.stringify({
        type: "remote-function-result",
        callId,
        error: "Function not found",
      })
    );
    return;
  }
  try {
    const result = await func(...args);
    webSocket.send(
      JSON.stringify({ type: "remote-function-result", callId, result })
    );
  } catch (e) {
    webSocket.send(
      JSON.stringify({
        type: "remote-function-result",
        callId,
        error: (e as Error).message,
      })
    );
  }
};

// =================================================================================
// 序列化器
// =================================================================================

const serialize = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (typeof obj === "function") {
    const functionId = uuidv4();
    functionRegistry.set(functionId, obj);
    return `[REMOTE-FUNCTION-${functionId}]`;
  }
  if (obj instanceof AbortSignal) {
    const signalId = uuidv4();
    const handler = async () => {
      (await getWebSocket()).send(JSON.stringify({ type: "abort", signalId }));
      obj.removeEventListener("abort", handler);
      abortSignalRegistry.delete(signalId);
    };
    obj.addEventListener("abort", handler);
    abortSignalRegistry.set(signalId, new AbortController());
    return `[ABORT-SIGNAL-${signalId}]`;
  }
  if (Array.isArray(obj)) {
    return obj.map(serialize);
  }
  const newObj: { [key: string]: any } = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[key] = serialize(obj[key]);
    }
  }
  return newObj;
};

// =================================================================================
// 顶级异步 API 实现
// =================================================================================

export const generateText = (async (
  options: any
): Promise<GenerateTextResult<any, any>> => {
  return sendRequest("generateText", options);
}) as unknown as typeof import("ai").generateText;

// 更新了 generateObject 的签名，移除了 Zod 相关的泛型约束
export const generateObject = (async <SCHEMA>(
  options: any
): Promise<GenerateObjectResult<SCHEMA>> => {
  return sendRequest("generateObject", options);
}) as unknown as typeof import("ai").generateObject;

export const embed = (async <VALUE>(
  options: any
): Promise<EmbedResult<VALUE>> => {
  return sendRequest("embed", options);
}) as unknown as typeof import("ai").embed;

export const embedMany = (async <VALUE>(
  options: any
): Promise<EmbedManyResult<VALUE>> => {
  return sendRequest("embedMany", options);
}) as unknown as typeof import("ai").embedMany;

export const experimental_generateImage = (async (
  options: any
): Promise<GenerateImageResult> => {
  return sendRequest("generateImage", options);
}) as unknown as typeof import("ai").experimental_generateImage;

export const experimental_generateSpeech = (async (
  options: any
): Promise<SpeechResult> => {
  return sendRequest("generateSpeech", options);
}) as unknown as typeof import("ai").experimental_generateSpeech;

// =================================================================================
// 流式 API 实现
// =================================================================================

const createStreamProxy = async <
  T extends StreamTextResult<any, any> | StreamObjectResult<any, any, any>
>(
  api: string,
  options: any
): Promise<T> => {
  const requestId = uuidv4();
  const serializedArgs = serialize(options);
  const ws = await getWebSocket();
  const streamController = new AbortController();
  const createReadableStream = (streamKey: string): ReadableStream<any> => {
    return new ReadableStream({
      start(controller) {
        const messageHandler = (event: MessageEvent) => {
          const msg = JSON.parse(event.data);
          if (msg.requestId !== requestId || msg.streamKey !== streamKey)
            return;
          if (msg.type === "stream-chunk") {
            controller.enqueue(msg.payload);
          } else if (msg.type === "stream-end") {
            controller.close();
            ws.removeEventListener("message", messageHandler);
            pendingRequests.delete(requestId);
          } else if (msg.type === "error") {
            controller.error(new Error(msg.error));
            ws.removeEventListener("message", messageHandler);
            pendingRequests.delete(requestId);
          }
        };
        ws.addEventListener("message", messageHandler);
        streamController.signal.addEventListener("abort", () => {
          ws.removeEventListener("message", messageHandler);
          controller.close();
        });
      },
      cancel() {
        streamController.abort();
      },
    });
  };
  const createPropertyPromise = (propertyKey: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        const msg = JSON.parse(event.data);
        if (msg.requestId !== requestId) return;
        if (msg.type === `promise-result` && msg.propertyKey === propertyKey) {
          resolve(msg.payload);
          ws.removeEventListener("message", messageHandler);
        } else if (msg.type === "error") {
          reject(new Error(msg.error));
          ws.removeEventListener("message", messageHandler);
        }
      };
      ws.addEventListener("message", messageHandler);
    });
  };
  const payload = JSON.stringify({ api, requestId, args: serializedArgs });
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else {
    ws.onopen = () => ws.send(payload);
  }
  const proxy = {
    get textStream() {
      return createReadableStream("textStream");
    },
    get fullStream() {
      return createReadableStream("fullStream");
    },
    get partialObjectStream() {
      return createReadableStream("partialObjectStream");
    },
    get text() {
      return createPropertyPromise("text");
    },
    get finishReason() {
      return createPropertyPromise("finishReason");
    },
    get usage() {
      return createPropertyPromise("usage");
    },
    get toolCalls() {
      return createPropertyPromise("toolCalls");
    },
    get toolResults() {
      return createPropertyPromise("toolResults");
    },
  };
  return proxy as unknown as T;
};

export const streamText = (async (options: any) => {
  return await createStreamProxy("streamText", options);
}) as unknown as typeof import("ai").streamText;

export const streamObject = (async (options: any) => {
  return await createStreamProxy("streamObject", options);
}) as unknown as typeof import("ai").streamObject;

// =================================================================================
// 同步 API (参与构建)
// =================================================================================
export const tool = ((tool: Tool<any, any>) => {
  return { __builder: "tool", args: [tool] };
}) as unknown as typeof import("ai").tool;

export const stepCountIs = ((count: number) => {
  return { __builder: "stepCountIs", args: [count] };
}) as unknown as typeof import("ai").stepCountIs;

export const dynamicTool = ((tool: Tool<any, any>) => {
  return { __builder: "dynamicTool", args: [tool] };
}) as unknown as typeof import("ai").dynamicTool;

export const hasToolCall = ((toolName: string) => {
  return { __builder: "hasToolCall", args: [toolName] };
}) as unknown as typeof import("ai").hasToolCall;

export const smoothStream = ((options: any) => {
  return { __builder: "smoothStream", args: [options || {}] };
}) as unknown as typeof import("ai").smoothStream;

export const jsonSchema = ((schema: JSONSchema7) => {
  return { __builder: "jsonSchema", args: [schema] };
}) as unknown as typeof import("ai").jsonSchema;

// =================================================================================
// 特殊同步 API (不参与构建)
// =================================================================================

export const cosineSimilarity = (async (
  v1: number[],
  v2: number[]
): Promise<number> => {
  return sendRequest("cosineSimilarity", { v1, v2 });
}) as unknown as (v1: number[], v2: number[]) => Promise<number>;

// =================================================================================
// 边车管理 API <<
// =================================================================================

/**
 * 边车 MCP 服务器配置的类型定义
 */
export type McpServerConfig = {
  command: string;
  args: string[];
};

/**
 * 通用的 Fetch 辅助函数，用于与边车 REST API 通信
 */
const sidecarFetch = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`${SIDECAR_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMessage = errorBody?.error || response.statusText;
    throw new Error(`Sidecar API Error (${response.status}): ${errorMessage}`);
  }

  // Hono 在 DELETE 成功时可能返回空响应体
  if (
    response.status === 200 &&
    response.headers.get("content-length") !== "0"
  ) {
    return response.json();
  }
  return { success: true };
};

// --- MCP 管理 ---

/**
 * 获取当前所有活动的 MCP 服务器及其提供的工具
 * @returns {Promise<Record<string, string[]>>} 一个对象，键是服务器名，值是工具名数组
 */
export const getMcpToolStatus = async (): Promise<Record<string, string[]>> => {
  return sidecarFetch("/api/mcp/tools");
};

/**
 * 添加一个新的 MCP 服务器
 * @param serverName 服务器的唯一名称
 * @param config 服务器的配置，包括命令和参数
 * @returns {Promise<any>} API 的响应
 */
export const addMcpServer = async (
  serverName: string,
  config: McpServerConfig
): Promise<any> => {
  return sidecarFetch("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify({ serverName, config }),
  });
};

/**
 * 移除一个正在运行的 MCP 服务器
 * @param serverName 要移除的服务器的名称
 * @returns {Promise<any>} API 的响应
 */
export const removeMcpServer = async (serverName: string): Promise<any> => {
  return sidecarFetch(`/api/mcp/servers/${serverName}`, {
    method: "DELETE",
  });
};

/**
 * 通过 sidecar 代理执行一个 fetch 请求。
 * sidecar 会在请求的 headers 和 body 中自动替换 {{KEY-FileName-KeyName}} 占位符。
 * 这个函数的接口与标准的 `fetch` 函数完全相同。
 *
 * @param url 要请求的 URL (可以是 URL 对象或字符串)。
 * @param init 一个包含请求自定义设置的选项对象，与标准 fetch 的 RequestInit 相同。
 * @returns 一个解析为 Response 对象的 Promise，代表对请求的响应。
 */
export function fetchWithSecrets(
  url: URL | RequestInfo,
  init?: RequestInit
): Promise<Response> {
  // 我们将原始的 url 和 init 对象包装在发往 sidecar 的 POST 请求体中。
  // sidecar 的 /api/fetch 接口会解包这些信息，执行带有密钥替换的 fetch，
  // 然后将完整的响应（状态码、头、响应体）流式传输回客户端。
  // 这里的 fetch 调用直接返回 sidecar 的响应，浏览器会自动处理它。
  return fetch("/api/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: url.toString(),
      init,
    }),
  });
}

// 方便调试
if (typeof window !== "undefined") {
  (window as any).ai = {
    generateText,
    generateObject,
    embed,
    embedMany,
    experimental_generateImage,
    experimental_generateSpeech,
    streamText,
    streamObject,
    tool,
    stepCountIs,
    dynamicTool,
    hasToolCall,
    smoothStream,
    jsonSchema,
    cosineSimilarity,
    getMcpToolStatus,
    addMcpServer,
    removeMcpServer,
    fetchWithSecrets,
  };
}
