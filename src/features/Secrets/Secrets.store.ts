// src/features/Secrets/Secrets.store.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export const useSecretsStore = defineStore("secrets", () => {
  const keyList = ref<string[]>([]);
  const isLoading = ref(false);

  /**
   * 从后端加载所有可用密钥
   */
  async function loadKeys() {
    isLoading.value = true;
    try {
      const keys = await invoke<string[]>("get_all_available_keys");
      keyList.value = keys || [];
    } catch (error) {
      console.error("Failed to get all available keys:", error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 写入密钥
   */
  async function writeSecretKey(key: string, value: string) {
    try {
      await invoke("write_secret_key", { key, value });
      // 写入成功后刷新列表
      await loadKeys();
    } catch (error) {
      console.error("Failed to write secret key:", error);
      throw error;
    }
  }

  /**
   * 检查密钥是否存在
   */
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
    isLoading,
    loadKeys,
    writeSecretKey,
    isKeyAvailable,
  };
});
