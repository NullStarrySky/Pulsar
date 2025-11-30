// src/schema/chat/EnhancedApiReadyContext/utils/formatter.ts
import { ApiReadyMessage } from "@/schema/chat/chat.types";
import {
  FinalApiMessage,
  FinalAssistantMessagePart,
  FinalUserMessagePart,
} from "../api.types";
import { TextPart, FilePart } from "ai";

export function finalizeMessages(
  messages: ApiReadyMessage[]
): FinalApiMessage[] {
  return messages.map((message): FinalApiMessage => {
    const { role, content, metaGenerateInfo } = message;
    const additionalParts = metaGenerateInfo?.additionalParts;

    if (!additionalParts?.length) {
      // 显式类型断言，确保符合 FinalApiMessage 结构
      return { role, content } as FinalApiMessage;
    }

    if (role === "system") {
      console.warn("System message additionalParts ignored.");
      return { role, content };
    }

    const textPart: TextPart = { type: "text", text: content };

    if (role === "user") {
      return {
        role,
        content: [textPart, ...(additionalParts as FinalUserMessagePart[])],
      };
    }

    if (role === "assistant") {
      // 转换逻辑：Assistant 不能直接发 ImagePart，需转为 FilePart
      const processedParts: FinalAssistantMessagePart[] = additionalParts.map(
        (part) => {
          if (part.type === "image") {
            return {
              type: "file",
              data: part.image,
              mediaType: part.mediaType ?? "application/octet-stream",
              providerOptions: (part as any).providerOptions,
            } as FilePart;
          }
          return part as TextPart | FilePart;
        }
      );

      return { role, content: [textPart, ...processedParts] };
    }

    return { role, content } as FinalApiMessage;
  });
}
