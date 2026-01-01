// src/features/Secrets/Secrets.store.ts

import { invoke } from "@tauri-apps/api/core";
import { push } from "notivue";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useSecretsStore = defineStore("secrets", () => {
  const keyList = ref<string[]>([]);

  // 预编译正则，匹配 Rust 后端的逻辑：仅允许字母、数字、下划线、点、减号
  const VALID_KEY_REGEX = /^[a-zA-Z0-9_.-]+$/;

  async function loadKeys() {
    try {
      const keys = await invoke<string[]>("get_all_available_keys");
      keyList.value = keys || [];
    } catch (error) {
      console.error("Failed to get all available keys:", error);
      throw error;
    } finally {
    }
  }

  async function writeSecretKey(key: string, value: string) {
    // 写入前校验
    if (!key || !VALID_KEY_REGEX.test(key)) {
      const errorMsg = `密钥名称 "${key}" 格式无效。仅允许使用：英文、数字、下划线(_)、点(.) 和 连字符(-)。请勿使用中文或空格。`;
      throw new Error(errorMsg);
    }

    try {
      await invoke("write_secret_key", { key, value });
      await loadKeys();
    } catch (error) {
      console.error("Failed to write secret key:", error);
      throw error;
    }
  }

  // 删除密钥
  async function deleteSecretKey(key: string) {
    try {
      // 步骤 1: 调用 Rust 删除文件中的键
      await invoke("delete_secret_key", { key });

      // 步骤 2: 刷新 UI
      await loadKeys();
    } catch (error) {
      console.error("Failed to delete secret key:", error);
      throw error;
    }
  }

  async function isKeyAvailable(key: string): Promise<boolean> {
    // 这里也可以加一道校验，避免向后端查询明显非法的 key，不过不是必须的
    if (!key || !VALID_KEY_REGEX.test(key)) {
      return false;
    }

    try {
      return await invoke<boolean>("is_key_available", { key });
    } catch (error) {
      console.error("Failed to check key availability:", error);
      return false;
    }
  }

  return {
    keyList,
    loadKeys,
    writeSecretKey,
    deleteSecretKey,
    isKeyAvailable,
  };
});
