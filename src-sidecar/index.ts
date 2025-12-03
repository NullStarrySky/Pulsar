// src-sidecar/index.ts

import express, { Request, Response, NextFunction } from "express";
import expressWs from "express-ws";
import cors from "cors";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";
import fetch, {
  type RequestInfo,
  type RequestInit,
  Headers,
  Response as FetchResponse,
} from "node-fetch";
import { AIService } from "./aiService";
import type { ModelConfig } from "../src/schema/modelConfig/modelconfig.types";
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
    const newSecrets = JSON.parse(content);

    // 不要重新赋值全局的 secrets 对象。
    // 而是清空当前对象，然后将新密钥的属性复制过来，免得引用问题。

    // 1. 删除旧对象中的所有键
    for (const key in secrets) {
      if (Object.prototype.hasOwnProperty.call(secrets, key)) {
        delete secrets[key];
      }
    }

    // 2. 将新密钥的属性复制到现有对象中
    Object.assign(secrets, newSecrets);

    logger.info(
      { path: secretsPath },
      "Secrets reloaded successfully into the existing object."
    );
  } catch (error) {
    logger.error(
      { err: error, path: secretsPath },
      "Failed to read or parse secrets.json."
    );
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

// [新增] 手动重载密钥的 API 端点
expressApp.post("/api/secrets/reload", async (_: Request, res: Response) => {
  if (!isInitialized) {
    return res.status(503).json({ error: "Server is not initialized yet." });
  }
  try {
    await loadSecrets();
    logger.info("Secrets reloaded successfully via API call.");
    res.json({ success: true, message: "Secrets reloaded successfully." });
  } catch (e) {
    logger.error({ err: e }, "Failed to reload secrets via API call.");
    res.status(500).json({ success: false, error: (e as Error).message });
  }
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
    const event = { data: message.data.toString("utf-8") } as MessageEvent;
    handlers.onMessage(event, ws);
  };

  ws.onclose = () => {
    handlers.onClose();
  };

  ws.onerror = (err) => {
    logger.error({ err }, "WebSocket connection error.");
    handlers.onClose();
  };
});
// =================================================================================
// Web Search 工具集处理逻辑
// =================================================================================

expressApp.post("/api/tools/websearch", async (req: Request, res: Response) => {
  try {
    const { provider, query, options } = req.body as {
      provider: "exa" | "firecrawl";
      query: string;
      options?: any;
    };

    if (!provider || !query) {
      return res
        .status(400)
        .json({ error: "Provider and query/url are required." });
    }

    let result;

    if (provider === "exa") {
      // ... (exa 的逻辑是正确的，保持不变) ...
      const apiKey = secrets["EXA_API_KEY"] || process.env.EXA_API_KEY;
      if (!apiKey) {
        return res
          .status(401)
          .json({ error: "EXA_API_KEY not found in secrets." });
      }

      const exa = new Exa(apiKey);
      const searchOptions = {
        numResults: 3,
        useAutoprompt: true,
        text: true,
        ...options,
      };

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

      // [修正] 实例化 FirecrawlApp，与 import 语句保持一致
      const app = new FirecrawlApp({ apiKey });

      const isUrl = /^(http|https):\/\/[^ "]+$/.test(query);

      if (isUrl) {
        // [保持不变] scrape 逻辑正确
        const scrapeResponse = await app.scrape(query, {
          formats: ["markdown"],
          ...options,
        });

        if (!scrapeResponse.success) {
          throw new Error(`Firecrawl scrape failed: ${scrapeResponse.error}`);
        }

        result = [
          {
            title: scrapeResponse.data.metadata?.title || "No Title",
            url: scrapeResponse.data.metadata?.sourceURL || query,
            content: scrapeResponse.data.markdown || "",
            publishedDate: scrapeResponse.data.metadata?.date,
          },
        ];
      } else {
        // [保持不变] search 逻辑正确
        const searchResponse = await app.search(query, {
          limit: 3,
          scrapeOptions: {
            formats: ["markdown"],
          },
          ...options,
        });

        if (!searchResponse.success) {
          throw new Error(`Firecrawl search failed: ${searchResponse.error}`);
        }

        const dataList = searchResponse.data as any[];

        result = dataList.map((item) => ({
          title: item.title || "No Title",
          url: item.url,
          content: item.markdown || item.description || "",
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
    if (response.body) {
      response.body.pipe(res);
    } else {
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
  // 首次加载密钥
  await loadSecrets();

  const modelConfigPath = path.join(
    appDataDir,
    "modelConfig.[modelConfig].json"
  );
  try {
    const configContent = await fsPromises.readFile(modelConfigPath, "utf-8");
    modelConfig = JSON.parse(configContent);
    logger.info(`Loaded ${Object.keys(modelConfig).length} model providers.`);
  } catch (e) {
    logger.error(
      { err: e },
      "Failed to load or parse modelConfig file. Using empty configuration."
    );
    modelConfig = {};
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
