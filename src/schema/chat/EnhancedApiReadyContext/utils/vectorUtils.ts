// src/schema/chat/EnhancedApiReadyContext/utils/vectorUtils.ts
import type { ApiReadyMessage } from "@/schema/chat/chat.types";
import type { VectorEntry, VectorSearchResult } from "../api.types";

function cosineSimilaritySync(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  return magA && magB ? dotProduct / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export class VectorSearcher {
  constructor(
    private messages: ApiReadyMessage[],
    private targetModelId: string
  ) {}

  public getAllEntries(): VectorEntry[] {
    const entries: VectorEntry[] = [];
    const len = this.messages.length;

    for (let i = 0; i < len; i++) {
      const msg = this.messages[i];
      const embedding = msg.metaGenerateInfo?.embedding?.[this.targetModelId];
      if (embedding) {
        entries.push({
          depth: len - 1 - i,
          index: i,
          vector: embedding,
          content: msg.content,
          role: msg.role,
          modelId: this.targetModelId,
        });
      }
    }
    // 按深度排序（最新在前）
    return entries.sort((a, b) => a.depth - b.depth);
  }

  public find(
    threshold: number,
    queryCount: number = 1,
    maxResults: number = 5
  ): VectorSearchResult[] {
    const allEntries = this.getAllEntries(); // 已按深度排序 (0是最新)

    const queries = allEntries.slice(0, queryCount);
    const candidates = allEntries.slice(queryCount);

    if (queries.length === 0) return [];

    const results: VectorSearchResult[] = [];

    for (const candidate of candidates) {
      let maxScore = -1;
      let bestMatchDepth = -1;

      for (const query of queries) {
        const score = cosineSimilaritySync(candidate.vector, query.vector);
        if (score > maxScore) {
          maxScore = score;
          bestMatchDepth = query.depth;
        }
      }

      if (maxScore >= threshold) {
        results.push({
          ...candidate,
          score: maxScore,
          matchedWithDepth: bestMatchDepth,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }
}
