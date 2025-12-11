// src/utils/platform.ts
import { type as getOsType } from "@tauri-apps/plugin-os";

const osType = getOsType();

export function isMobile(): boolean {
  // TEST
  // return true;
  return osType === "ios" || osType === "android";
}
