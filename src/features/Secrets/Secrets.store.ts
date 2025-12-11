// src/features/Secrets/Secrets.store.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export const useSecretsStore = defineStore("secrets", () => {
  const keyList = ref<string[]>([]);

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
    try {
      await invoke("write_secret_key", { key, value });
      await loadKeys();
    } catch (error) {
      console.error("Failed to write secret key:", error);
      throw error;
    }
  }

  //  删除密钥
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
    deleteSecretKey, // 导出新方法
    isKeyAvailable,
  };
});
