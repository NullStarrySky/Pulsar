// src-sidecar/aiService.ts

import * as AI from "ai";
import { v4 as uuidv4 } from "uuid";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { experimental_createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "ai";
import { hydrateModel, type ModelConfig } from "./model-hydration";
import { WebSocket } from "ws";

// =================================================================================
// 新的类型定义以支持多种传输方式
// =================================================================================

// Stdio 配置
type StdioServerConfig = {
  type?: "stdio";
  command: string;
  args: string[];
};

// SSE 配置
type SseServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};

// HTTP 配置
type HttpServerConfig = {
  type: "streamableHttp";
  url: string;
  headers?: Record<string, string>;
};

// 所有可能配置的联合类型
type McpServerConfig = StdioServerConfig | SseServerConfig | HttpServerConfig;

// 更新 Manifest 类型
type MCPManifest = {
  mcpServers: Record<string, McpServerConfig>;
};

type MCPClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export class AIService {
  private mcpClients = new Map<
    string,
    { client: MCPClient; tools: Record<string, Tool> }
  >();
  private allMcpTools: Tool[] = [];
  private mcpManifestPath: string = "manifest.json";
  private envProxy: NodeJS.ProcessEnv = {};
  private modelConfig: ModelConfig = {};
  private secrets: Record<string, string> = {};

  // =================================================================================
  // 生命周期管理
  // =================================================================================

  async init(params: {
    appDataDir: string;
    envProxy: NodeJS.ProcessEnv;
    secrets: Record<string, string>;
    modelConfig: ModelConfig;
  }): Promise<void> {
    this.envProxy = params.envProxy;
    this.secrets = params.secrets;
    this.modelConfig = params.modelConfig;
    this.mcpManifestPath = path.join(params.appDataDir, "mcp", "manifest.json");

    await this.initializeAllMcpClients();
    console.log(
      `Loaded ${this.mcpClients.size} MCP servers with a total of ${this.allMcpTools.length} tools.`,
    );
  }

  async destroy(): Promise<void> {
    await this.closeAllMcpClients();
  }

  // =================================================================================
  // WebSocket 核心逻辑
  // =================================================================================

  public createWebSocketHandlers() {
    console.log("createWebSocketHandlers");
    // 为每个连接创建独立的状态
    const functionCallPromises = new Map<
      string,
      { resolve: (value: any) => void; reject: (reason?: any) => void }
    >();
    const abortControllers = new Map<string, AbortController>();

    const hydrate = (obj: any, ws: WebSocket): any => {
      // 步骤 1: 首先处理所有非对象类型的值（以及 null）
      if (obj === null || typeof obj !== "object") {
        if (typeof obj === "string") {
          const funcMatch = obj.match(/^\[REMOTE-FUNCTION-(.+)\]$/);
          if (funcMatch) {
            const functionId = funcMatch[1];
            return async (...args: any[]) => {
              const callId = uuidv4();
              return new Promise((resolve, reject) => {
                functionCallPromises.set(callId, { resolve, reject });
                ws.send(
                  JSON.stringify({
                    type: "remote-function-call",
                    payload: { callId, functionId, args },
                  }),
                );
              });
            };
          }

          const abortMatch = obj.match(/^\[ABORT-SIGNAL-(.+)\]$/);
          if (abortMatch) {
            const signalId = abortMatch[1];
            const controller = new AbortController();
            abortControllers.set(signalId, controller);
            return controller.signal;
          }
        }
        // 如果不是特殊字符串，直接返回原始值
        return obj;
      }

      // 步骤 2: 处理非纯粹对象（如模型类的实例）
      // 这个检查必须在处理 __builder、数组和普通对象之前。
      if (obj.constructor !== Object && !Array.isArray(obj) && !obj.__builder) {
        // 如果它是一个类实例（constructor 不是 Object），就直接返回它，不要分解。
        return obj;
      }

      // 步骤 3: 处理 Vercel AI SDK 的特殊构造对象
      if (obj.__builder) {
        const builderFn = (AI as any)[obj.__builder];
        if (!builderFn) {
          throw new Error(`Builder function "${obj.__builder}" not found.`);
        }
        const hydratedArgs = hydrate(obj.args, ws);
        return builderFn(...hydratedArgs);
      }

      // 步骤 4: 递归处理数组
      if (Array.isArray(obj)) {
        return obj.map((item) => hydrate(item, ws));
      }

      // 步骤 5: 递归处理纯粹的（plain）JS 对象
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = hydrate(obj[key], ws);
        }
      }
      return newObj;
    };

    // 返回 WebSocket 事件处理器
    return {
      onMessage: async (evt: MessageEvent, ws: WebSocket) => {
        // 类型从 any 改为 WebSocket
        const messageData = JSON.parse(evt.data as string);
        const { api, requestId, args, type, callId, result, error, signalId } =
          messageData;

        if (type === "remote-function-result") {
          const promise = functionCallPromises.get(callId);
          if (promise) {
            error ? promise.reject(new Error(error)) : promise.resolve(result);
            functionCallPromises.delete(callId);
          }
          return;
        }

        if (type === "abort") {
          abortControllers.get(signalId)?.abort();
          abortControllers.delete(signalId);
          return;
        }

        try {
          if (args && typeof args.model === "string") {
            const purpose = this.determinePurpose(api);
            if (purpose) {
              args.model = hydrateModel(
                args.model,
                purpose,
                this.modelConfig,
                this.secrets,
              );
            } else {
              console.warn(
                `Model string was passed for an API call ("${api}") with an undetermined purpose. The model was not hydrated.`,
              );
            }
          }

          let hydratedArgs = hydrate(args, ws);

          if (this.allMcpTools.length > 0) {
            const originalTools = Array.isArray(hydratedArgs.tools)
              ? hydratedArgs.tools
              : [];
            hydratedArgs.tools = [...originalTools, ...this.allMcpTools];
          }

          const apiFunction =
            (AI as any)[api] ?? (AI as any)[`experimental_${api}`];
          if (!apiFunction) {
            throw new Error(`API "${api}" not found in Vercel AI SDK.`);
          }

          console.log(hydratedArgs);
          const response = await apiFunction(hydratedArgs);
          console.log("afterGenerate");
          console.log(response);
          console.log(response.text);

          if (api.startsWith("stream")) {
            this.handleStreamResponse(response, requestId, ws);
          } else {
            ws.send(
              // 固化所有getter
              JSON.stringify({
                type: "result",
                requestId,
                payload: this.materializeResult(response),
              }),
            );
          }
        } catch (e) {
          ws.send(
            JSON.stringify({
              type: "error",
              requestId,
              error: (e as Error).message,
            }),
          );
        }
      },
      onClose: () => {
        console.log("Connection closed");
        abortControllers.forEach((controller) => controller.abort());
        abortControllers.clear();
        functionCallPromises.forEach((p) => p.reject("Connection closed"));
        functionCallPromises.clear();
      },
    };
  }

  /**
   * 递归地从一个对象及其整个原型链中收集所有属性名（包括不可枚举的）。
   * @param obj 要检查的对象。
   * @param props 一个 Set，用于存储唯一的属性名，避免重复。
   * @returns 包含所有属性名的 Set。
   */
  getAllPropertyNames(obj: any, props = new Set<string>()): Set<string> {
    if (obj === null || obj === Object.prototype) {
      return props;
    }

    Object.getOwnPropertyNames(obj).forEach((prop) => props.add(prop));

    return this.getAllPropertyNames(Object.getPrototypeOf(obj), props);
  }

  /**
   * 将 Vercel AI SDK 返回结果对象中的 getter (包括不可枚举的) 固化为普通数据属性。
   * 这样在 JSON 序列化后，前端也能接收到这些便利的顶层属性。
   * @param obj AI SDK 返回的原始结果对象。
   * @returns 一个新的、包含了固化后属性的普通对象。
   */
  materializeResult(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    const materialized: { [key: string]: any } = {};
    const allKeys = this.getAllPropertyNames(obj);

    for (const key of allKeys) {
      // 忽略 constructor 属性和原型链上的其他内建方法
      if (key === "constructor") {
        continue;
      }

      try {
        // 在原始对象上访问该属性，这将触发 getter 的执行
        const value = obj[key];

        // 我们只固化非函数类型的值。这可以排除掉类的方法。
        if (typeof value !== "function") {
          materialized[key] = value;
        }
      } catch (e) {
        // 如果某个 getter 执行出错，记录一个警告并继续
        console.warn(`在固化属性 '${key}' 时出错:`, (e as Error).message);
      }
    }

    return materialized;
  }

  private determinePurpose(api: string): string {
    const lowerCaseApi = api.toLowerCase();
    if (lowerCaseApi.includes("text") || lowerCaseApi.includes("object"))
      return "chat";
    if (lowerCaseApi.includes("embed")) return "embedding";
    if (lowerCaseApi.includes("image")) return "image";
    if (lowerCaseApi.includes("speech")) return "speech";
    if (lowerCaseApi.includes("transcription")) return "transcription";
    return "";
  }

  private handleStreamResponse(
    response: any,
    requestId: string,
    ws: WebSocket,
  ) {
    ["text", "finishReason", "usage", "toolCalls", "toolResults"].forEach(
      (prop) => {
        if (response[prop]) {
          response[prop]
            .then((value: any) =>
              ws.send(
                JSON.stringify({
                  requestId,
                  type: "promise-result",
                  propertyKey: prop,
                  payload: value,
                }),
              ),
            )
            .catch((e: Error) =>
              ws.send(
                JSON.stringify({
                  requestId,
                  type: "error",
                  error: e.message,
                }),
              ),
            );
        }
      },
    );

    const streamKeys = ["textStream", "fullStream", "partialObjectStream"];
    for (const streamKey of streamKeys) {
      if (response[streamKey]) {
        (async () => {
          for await (const chunk of response[streamKey]) {
            ws.send(
              JSON.stringify({
                requestId,
                streamKey,
                type: "stream-chunk",
                payload: chunk,
              }),
            );
          }
          ws.send(JSON.stringify({ requestId, streamKey, type: "stream-end" }));
        })();
      }
    }
  }

  // =================================================================================
  // MCP 公共接口
  // =================================================================================

  public getMcpToolStatus(): Record<string, string[]> {
    const status: Record<string, string[]> = {};
    for (const [serverName, { tools }] of this.mcpClients.entries()) {
      status[serverName] = Object.keys(tools);
    }
    return status;
  }

  // 更新函数签名以使用新的联合类型
  public async addMcpServer(
    serverName: string,
    config: McpServerConfig,
  ): Promise<void> {
    const manifest = await this.loadMcpManifest();
    manifest.mcpServers[serverName] = config;
    await this.writeMcpManifest(manifest);
    await this.addOrUpdateMcpServer(serverName, config);
  }

  public async deleteMcpServer(serverName: string): Promise<void> {
    const manifest = await this.loadMcpManifest();
    delete manifest.mcpServers[serverName];
    await this.writeMcpManifest(manifest);
    await this.removeMcpServer(serverName);
  }

  // =================================================================================
  // MCP 内部实现 (核心修改区域)
  // =================================================================================

  private recalculateAllMcpTools(): void {
    this.allMcpTools = Array.from(this.mcpClients.values()).flatMap((server) =>
      Object.values(server.tools),
    );
  }

  private async addOrUpdateMcpServer(
    serverName: string,
    config: McpServerConfig,
  ): Promise<void> {
    if (this.mcpClients.has(serverName)) {
      await this.removeMcpServer(serverName);
    }

    let transport: any;
    // 检查 config.type 属性来区分不同的配置。
    // 为了向后兼容，如果 type 未定义，则默认为 'stdio'。
    const serverType = config.type ?? "stdio";

    switch (serverType) {
      case "sse":
        transport = {
          type: "sse",
          url: (config as SseServerConfig).url,
          headers: (config as SseServerConfig).headers,
        };
        break;

      case "streamableHttp":
        // 注意：manifest 中的 'streamableHttp' 对应 AI SDK 中的 'http' 类型
        transport = {
          type: "http",
          url: (config as HttpServerConfig).url,
          headers: (config as HttpServerConfig).headers,
        };
        break;

      case "stdio":
        transport = new StdioClientTransport({
          command: (config as StdioServerConfig).command,
          args: (config as StdioServerConfig).args,
          env: this.envProxy as Record<string, string>,
        });
        break;
    }

    const client = await experimental_createMCPClient({ transport });

    const tools = await client.tools();
    this.mcpClients.set(serverName, { client, tools: tools });
    this.recalculateAllMcpTools();
    console.log(
      `MCP server "${serverName}" (type: ${serverType}) started with ${Object.keys(tools).length} tools.`,
    );
  }

  private async removeMcpServer(serverName: string): Promise<void> {
    const entry = this.mcpClients.get(serverName);
    if (entry) {
      await entry.client.close();
      this.mcpClients.delete(serverName);
      this.recalculateAllMcpTools();
      console.log(`MCP server "${serverName}" closed.`);
    }
  }

  private async initializeAllMcpClients(): Promise<void> {
    const manifest = await this.loadMcpManifest();
    for (const [serverName, config] of Object.entries(
      manifest.mcpServers || {},
    )) {
      try {
        await this.addOrUpdateMcpServer(serverName, config);
      } catch (e) {
        console.error(`Failed to initialize MCP server "${serverName}":`, e);
      }
    }
  }

  private async closeAllMcpClients(): Promise<void> {
    for (const serverName of this.mcpClients.keys()) {
      await this.removeMcpServer(serverName);
    }
  }

  // =================================================================================
  // 文件 I/O 辅助函数
  // =================================================================================

  private async loadMcpManifest(): Promise<MCPManifest> {
    try {
      const content = await fs.readFile(this.mcpManifestPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      // 如果文件不存在或为空，返回一个默认的空结构
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { mcpServers: {} };
      }
      throw error;
    }
  }

  private async writeMcpManifest(manifest: MCPManifest): Promise<void> {
    await fs.writeFile(
      this.mcpManifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  }
}
