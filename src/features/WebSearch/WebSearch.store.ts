// src/features/WebSearch/WebSearch.store.ts

export const SIDECAR_PORT = 4130;
export const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  score?: number;
}

export type SearchProvider = "exa" | "firecrawl";

interface SearchOptions {
  numResults?: number;
  [key: string]: any;
}

/**
 * WebSearchStore 用于与 Sidecar 交互以执行网络搜索和内容抓取。
 * 提供了一个简单的静态方法来调用后端API。
 */
export class WebSearchStore {
  /**
   * 执行网络搜索或爬取。
   * 此方法调用 Sidecar 的 `/api/tools/websearch` 端点。
   * @param provider 'exa' 用于搜索，'firecrawl' 用于抓取特定页面或进行搜索。
   * @param query 搜索关键词 (Exa/Firecrawl) 或 URL (Firecrawl)。
   * @param options 提供给相应服务商的额外配置。
   * @returns 返回一个包含搜索结果的 Promise<SearchResult[]>。
   */
  static async search(
    provider: SearchProvider,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      const response = await fetch(`${SIDECAR_URL}/api/tools/websearch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          query,
          options,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Network request failed");
      }

      const json = await response.json();
      return json.data;
    } catch (error) {
      console.error("WebSearchStore Error:", error);
      throw error;
    }
  }
}

// 将新的 Store 类挂载到 window 对象上，方便在应用各处调用
(window as any).WebSearchStore = WebSearchStore;
