// src/lib/WebSearchService.ts
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

export class WebSearchService {
  /**
   * 执行网络搜索或爬取
   * @param provider 'exa' 用于搜索, 'firecrawl' 用于抓取特定页面
   * @param query 搜索关键词 (Exa) 或 URL (Firecrawl)
   * @param options 额外配置
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
      console.error("WebSearchService Error:", error);
      throw error;
    }
  }
}

(window as any).WebSearchService = WebSearchService;
