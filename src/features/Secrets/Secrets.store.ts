// src/features/Secrets/Secrets.store.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export const useSecretsStore = defineStore("secrets", () => {
  const keyList = ref<string[]>([]);
  const isLoading = ref(false);

  /**
   * 调用 Sidecar 的 API 以触发密钥重载。
   * 这是一个内部函数，不直接暴露给组件。
   */
  async function triggerSidecarReload() {
    try {
      // Sidecar 在本地 4130 端口上运行
      const response = await fetch("http://localhost:4130/api/secrets/reload", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        // 抛出错误以确保上层调用知道发生了问题
        throw new Error(
          errorData.error || `Sidecar responded with status ${response.status}`
        );
      }

      console.log("Successfully triggered sidecar secrets reload.");
    } catch (error) {
      console.error("Failed to trigger sidecar secrets reload:", error);
      // 将错误继续向上抛出，以便 writeSecretKey 可以捕获它
      throw error;
    }
  }

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
      // 步骤 1: 通过 Tauri (Rust) 将密钥写入磁盘上的 secrets.json 文件
      await invoke("write_secret_key", { key, value });

      // [修改] 步骤 2: 文件写入成功后，命令 Sidecar 进程重新从磁盘读取该文件
      await triggerSidecarReload();

      // 步骤 3: 刷新 UI 中显示的密钥列表
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
