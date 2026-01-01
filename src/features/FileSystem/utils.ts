// src/features/FileSystem/utils.ts

import {
  BarChart2,
  Book,
  FileJson,
  FileText,
  HelpCircle,
  MessageSquare,
  Sliders,
  User,
} from "lucide-vue-next";
import type { Component } from "vue";
import { type SemanticType, SemanticTypeMap } from "@/schema/SemanticType";

export interface ParsedFileName {
  displayName: string;
  semanticType: SemanticType | null;
  extension: string | null;
}

export const parseFileName = (name: string): ParsedFileName => {
  const lastDotIndex = name.lastIndexOf(".");
  const extension = lastDotIndex !== -1 ? name.substring(lastDotIndex) : null;
  const nameWithoutExt = extension ? name.substring(0, lastDotIndex) : name;
  const semanticMatch = nameWithoutExt.match(/\.\[(.*?)\]$/);
  const semanticType = semanticMatch ? semanticMatch[1] : null;
  const displayName = semanticMatch
    ? nameWithoutExt.substring(0, semanticMatch.index)
    : nameWithoutExt;
  return {
    displayName,
    semanticType: semanticType as SemanticType | null,
    extension: extension ? extension.slice(1) : null,
  };
};

export const getIconForFile = (name: string): Component => {
  const { semanticType, extension } = parseFileName(name);
  if (semanticType && semanticType in SemanticTypeMap) {
    const iconMap: Partial<Record<SemanticType, Component>> = {
      character: User,
      chat: MessageSquare,
      lorebook: Book,
      statistic: BarChart2,
      preset: Sliders,
    };
    return iconMap[semanticType] || HelpCircle;
  }
  return extension === "json" ? FileJson : FileText;
};
