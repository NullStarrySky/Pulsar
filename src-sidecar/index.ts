// src-sidecar/index.ts

import express, { Request, Response, NextFunction } from "express";
import expressWs from "express-ws";
import cors from "cors";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import fetch, {
  type RequestInfo,
  type RequestInit,
  Headers,
  Response as FetchResponse,
} from "node-fetch";
import { AIService } from "./aiService";
import type { ModelConfig } from "./model-hydration";
import pino from "pino";
import pretty from "pino-pretty";
import Exa from "exa-js";
import FirecrawlApp from "@mendable/firecrawl-js";

// =================================================================================
// 日志配置
// =================================================================================
const stream = pretty({
  colorize: true,
  ignore: "pid,hostname",
  translateTime: "SYS:standard",
});

const logger = pino({ level: "info" }, stream);

// =================================================================================
// 全局状态和类型定义
// =================================================================================
let appDataDir: string | null = null;
let secretsPath: string;
let secrets: Record<string, string> = {};
let modelConfig: ModelConfig;
let envProxy: NodeJS.ProcessEnv;
let isInitialized = false;

// 我们的核心服务实例
let aiService: AIService;

// =================================================================================
// 文件和配置管理
// =================================================================================

async function loadSecrets(): Promise<void> {
  try {
    const content = await fs.readFile(secretsPath, "utf-8");
    secrets = JSON.parse(content);
    logger.info({ path: secretsPath, secrets }, "Secrets loaded.");
  } catch (error) {
    logger.error(
      { err: error, path: secretsPath },
      "Failed to read or parse secrets.json."
    );
    // 抛出错误，以便初始化流程可以捕获它并向客户端报告失败
    throw new Error(
      `Failed to load secrets from ${secretsPath}. Ensure the file exists and is valid JSON.`
    );
  }
}

async function replaceSecretsInString(input: string): Promise<string> {
  if (typeof input !== "string" || !input.includes("{{SECRET:")) {
    return input;
  }
  const regex = /{{\s*SECRET:([\w.-]+)\s*}}/g;
  let result = input;

  for (const match of input.matchAll(regex)) {
    const [placeholder, keyName] = match;
    if (secrets.hasOwnProperty(keyName)) {
      result = result.replace(placeholder, secrets[keyName]);
    } else {
      logger.warn(`Secret key "${keyName}" not found in secrets.json.`);
    }
  }
  return result;
}

async function fetchWithSecrets(
  url: URL | RequestInfo,
  init?: RequestInit
): Promise<FetchResponse> {
  if (!init) {
    return fetch(url);
  }
  const processedInit: RequestInit = { ...init };
  if (processedInit.headers) {
    const newHeaders = new Headers(processedInit.headers);
    for (const [key, value] of newHeaders.entries()) {
      newHeaders.set(key, await replaceSecretsInString(value));
    }
    processedInit.headers = newHeaders;
  }
  if (typeof processedInit.body === "string") {
    processedInit.body = await replaceSecretsInString(processedInit.body);
  }
  return fetch(url, processedInit);
}

// =================================================================================
// Express 服务器设置
// =================================================================================

const app = express();
const wsInstance = expressWs(app);
const expressApp = wsInstance.app;

expressApp.use(
  cors({
    origin: "*",
    methods: ["POST", "GET", "OPTIONS", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);
expressApp.use(express.json());

// 检查初始化的中间件
expressApp.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/") && req.path !== "/api/init") {
    if (!isInitialized) {
      return res.status(503).json({ error: "Server is not initialized yet." });
    }
  }
  next();
});

// --- AI 服务 WebSocket 端点 ---
expressApp.ws("/ws", (ws, _) => {
  console.log("websocket In");

  if (!aiService) {
    logger.error(
      "AIService not initialized when trying to establish WebSocket."
    );
    ws.close(1011, "Server not initialized");
    return;
  }

  const handlers = aiService.createWebSocketHandlers();
  console.log("afterCreateWebSocketHandlers");

  logger.info("WebSocket connection established for AI Service.");

  ws.onmessage = (message) => {
    console.log("messageIn");
    // express-ws 的 onmessage 事件参数本身就是 MessageEvent
    // 但其 data 可能是 Buffer, ArrayBuffer 等, aiService 需要 string
    const event = { data: message.data.toString("utf-8") } as MessageEvent;
    handlers.onMessage(event, ws);
  };

  ws.onclose = () => {
    handlers.onClose();
  };

  ws.onerror = (err) => {
    logger.error({ err }, "WebSocket connection error.");
    handlers.onClose(); // 发生错误时也应该清理资源
  };
});

// =================================================================================
// Web Search 工具集处理逻辑
// =================================================================================

expressApp.post("/api/tools/websearch", async (req: Request, res: Response) => {
  try {
    const { provider, query, options } = req.body as {
      provider: "exa" | "firecrawl";
      query: string; // 对于 exa 是查询词，对于 firecrawl 是 url
      options?: any;
    };

    if (!provider || !query) {
      return res
        .status(400)
        .json({ error: "Provider and query/url are required." });
    }

    let result;

    if (provider === "exa") {
      const apiKey = secrets["EXA_API_KEY"] || process.env.EXA_API_KEY;
      if (!apiKey) {
        return res
          .status(401)
          .json({ error: "EXA_API_KEY not found in secrets." });
      }

      const exa = new Exa(apiKey);
      // 默认配置，可根据 options 覆盖
      const searchOptions = {
        numResults: 3,
        useAutoprompt: true,
        text: true,
        ...options,
      };

      // 这里使用 searchAndContents 获取内容
      const exaRes = await exa.searchAndContents(query, searchOptions);
      result = exaRes.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.text,
        publishedDate: r.publishedDate,
        score: r.score,
      }));
    } else if (provider === "firecrawl") {
      const apiKey =
        secrets["FIRECRAWL_API_KEY"] || process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        return res
          .status(401)
          .json({ error: "FIRECRAWL_API_KEY not found in secrets." });
      }

      // 2. 使用新的初始化方式
      const app = new Firecrawl({ apiKey });

      // 3. 判断 query 是 URL 还是搜索关键词
      const isUrl = /^(http|https):\/\/[^ "]+$/.test(query);

      if (isUrl) {
        // CASE A: 如果是 URL，执行 Scrape (抓取单页)
        const scrapeResponse = await app.scrape(query, {
          formats: ["markdown"],
          ...options, // 允许前端覆盖 formats, actions 等
        });

        if (!scrapeResponse.success) {
          throw new Error(`Firecrawl scrape failed: ${scrapeResponse.error}`);
        }

        // 构造统一返回格式
        result = [
          {
            title: scrapeResponse.data.metadata?.title || "No Title",
            url: scrapeResponse.data.metadata?.sourceURL || query,
            content: scrapeResponse.data.markdown || "",
            publishedDate: scrapeResponse.data.metadata?.date,
            // Firecrawl metadata 可能包含 description, language 等
          },
        ];
      } else {
        // CASE B: 如果是关键词，执行 Search (搜索并抓取)
        // 文档中提到 search 可以配合 scrapeOptions 使用
        const searchResponse = await app.search(query, {
          limit: 3, // 默认搜索3条
          scrapeOptions: {
            formats: ["markdown"], // 搜索结果直接转 Markdown
          },
          ...options,
        });

        if (!searchResponse.success) {
          throw new Error(`Firecrawl search failed: ${searchResponse.error}`);
        }

        // 注意：当使用了 scrapeOptions，data 是一个对象数组
        // 文档示例: { success: true, data: [ { title, url, markdown, ... } ] }
        const dataList = searchResponse.data as any[];

        result = dataList.map((item) => ({
          title: item.title || "No Title",
          url: item.url,
          content: item.markdown || item.description || "", // 优先用全文，否则用简介
          publishedDate: item.metadata?.date,
        }));
      }
    } else {
      return res.status(400).json({ error: "Unsupported provider." });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    logger.error({ err: e }, "Web search/crawl failed");
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- 初始化服务器的端点 ---
expressApp.post("/api/init", async (req: Request, res: Response) => {
  try {
    const { appDataDir: dir } = req.body as { appDataDir: string };
    if (!dir || typeof dir !== "string") {
      return res.status(400).json({
        error: `appDataDir is required and must be a string, but got ${dir}`,
      });
    }

    if (isInitialized) {
      if (appDataDir === dir) {
        logger.info(
          "Initialization request received for the same path. Silently succeeding."
        );
        return res.json({
          success: true,
          message: "Server is already initialized with the same path.",
        });
      } else {
        logger.error(
          `Attempt to re-initialize with a different path. Current: ${appDataDir}, New: ${dir}`
        );
        return res.status(409).json({
          error: `Server is already initialized with a different path: ${appDataDir}. Please restart the sidecar to use a new path.`,
        });
      }
    }

    appDataDir = dir;
    logger.info(`appDataDir received: ${appDataDir}`);

    await initializeServices();
    isInitialized = true;

    res.json({
      success: true,
      message: "Server initialized successfully.",
    });
  } catch (e) {
    logger.error({ err: e }, "Initialization failed");
    isInitialized = false;
    appDataDir = null;
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- MCP 管理 API ---
expressApp.get("/api/mcp/tools", async (_: Request, res: Response) => {
  res.json(aiService.getMcpToolStatus());
});

expressApp.post("/api/mcp/servers", async (req: Request, res: Response) => {
  try {
    const { serverName, config } = req.body as any;
    if (
      !serverName ||
      !config ||
      !config.command ||
      !Array.isArray(config.args)
    ) {
      return res.status(400).json({ error: "Invalid server configuration" });
    }
    await aiService.addMcpServer(serverName, config);
    res.json({
      success: true,
      serverName,
      tools: aiService.getMcpToolStatus(),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

expressApp.delete(
  "/api/mcp/servers/:name",
  async (req: Request, res: Response) => {
    try {
      const { name } = req.params as { name: string };
      await aiService.deleteMcpServer(name);
      res.json({
        success: true,
        serverName: name,
        tools: aiService.getMcpToolStatus(),
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

// --- 代理 API ---
expressApp.post("/api/fetch", async (req: Request, res: Response) => {
  try {
    const { url, init } = req.body as { url: string; init: RequestInit };
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    const response = await fetchWithSecrets(url, init);

    const headers: Record<string, string | string[] | undefined> = {};
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    res.status(response.status).set(headers);
    // 添加一个检查来确保 response.body 不是 null
    if (response.body) {
      response.body.pipe(res);
    } else {
      // 如果没有响应体，只需结束响应即可
      res.end();
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// =================================================================================
// 主启动与初始化逻辑
// =================================================================================

async function initializeServices() {
  if (!appDataDir) {
    throw new Error("appDataDir is not set. Cannot initialize services.");
  }

  secretsPath = path.join(appDataDir, "secrets.json");
  await loadSecrets();

  const modelConfigPath = path.join(
    appDataDir,
    "modelConfig.[modelConfig].json"
  );

  // 移除 ensureFile 调用，直接尝试读取

  try {
    const configContent = await fs.readFile(modelConfigPath, "utf-8");
    modelConfig = JSON.parse(configContent);
    logger.info(
      `Loaded ${
        modelConfig.customProviders?.length ?? 0
      } custom model providers.`
    );
  } catch (e) {
    logger.error(
      { err: e },
      "Failed to load or parse modelConfig file. Using empty configuration."
    );
    // 如果读取失败，优雅地降级为默认配置
    modelConfig = { customProviders: [] };
  }

  envProxy = new Proxy(process.env, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (secrets.hasOwnProperty(key) && secrets[key]) {
        return secrets[key];
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  aiService = new AIService();
  process.env = envProxy;
  await aiService.init({ appDataDir, envProxy, secrets, modelConfig });

  logger.info("Sidecar services have been successfully initialized.");
  logger.info(
    `Loaded ${Object.keys(secrets).length} secrets from secrets.json.`
  );
}

async function main() {
  const port = 4130;
  try {
    expressApp.listen(port, "0.0.0.0", () => {
      logger.info(`Sidecar server listening on http://0.0.0.0:${port}`);
      logger.info("Waiting for appDataDir from the main application...");
    });

    // =========================================================================
    // vvvvvvvvvvvvvvvvvvvvvvv DEBUGGING LOGIC vvvvvvvvvvvvvvvvvvvvvvv
    // =========================================================================
    try {
      logger.info("\n--- [DEBUG] SENDING INITIALIZATION REQUEST ---");
      // Give server a moment to start before fetching
      await new Promise((resolve) => setTimeout(resolve, 500));
      const response = await fetch(`http://127.0.0.1:4130/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appDataDir:
            "C:\\Users\\28360\\AppData\\Roaming\\com.tauri-app.pulsar",
        }),
      });
      const responseBody = await response.json();
      logger.info(
        {
          status: response.status,
          body: responseBody,
        },
        "--- [DEBUG] RESPONSE ---"
      );
    } catch (error) {
      logger.error(
        { err: error },
        "--- [DEBUG] FAILED TO SEND INIT REQUEST ---"
      );
    }
    // =========================================================================
    // ^^^^^^^^^^^^^^^^^^^^^^^ END OF DEBUGGING LOGIC ^^^^^^^^^^^^^^^^^^^^^^^^^^
    // =========================================================================
  } catch (err) {
    logger.fatal({ err }, "Server startup failed");
    process.exit(1);
  }
}

// 进程退出时的清理
const cleanup = () => {
  aiService?.destroy().then(() => {
    logger.info("AIService destroyed. Exiting.");
    process.exit(0);
  });
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

main();
