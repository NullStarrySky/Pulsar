// src/components/SchemaRenderer/SchemaRenderer.types.ts
import { Component } from "vue";

export type SeparatorType = "Separator";
export type ComponentName = string;

export type Group = {
  svg: string | Component;
  title: string;
  content: {
    title: string;
    content: RowGroup[];
  };
};

export type RowGroup = {
  title?: string;
  content: Row[];
};

export type Row = {
  title: string;
  description?: string;
  component: ComponentName;
  props?: Record<string, any>;
  accessChain: string;
  useTopBottom?: boolean;
};

export type Schema = {
  groupMeta: { title: string; description?: string } | Component;
  content: (Group | SeparatorType)[];
  components?: Record<ComponentName, Component>;
};
