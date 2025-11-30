// src/schema/manifest/composables/useInlineResources.ts

import { computed, Ref, unref } from "vue";
import {
  useFileSystemStore,
  isFolderNode,
  type FolderContent,
} from "@/features/FileSystem/FileSystem.store";
import { useFileSystemProxy } from "@/features/FileSystem/useFileSystemProxy";
import urlJoin from "url-join";
import defaultAvatar from "@/assets/default.jpg";

export function useInlineResources(activeFilePath: Ref<string | null>) {
  const store = useFileSystemStore();

  /** 获取当前文件的父目录路径 */
  const parentDirPath = computed(() => {
    const path = unref(activeFilePath);
    if (!path) return null;
    return path.split("/").slice(0, -1).join("/");
  });

  /** 获取父目录的节点 */
  const parentNode = computed(() => {
    const dir = parentDirPath.value;
    if (!dir) return null;
    const node = store.getNodeByPath(store.fileStructure, dir);
    return isFolderNode(node) ? (node as FolderContent) : null;
  });

  /**
   * 1. 扫描同级目录下的资源 (Character, Lorebook, Preset)
   * 排除自身
   */
  const inlineResources = computed(() => {
    const activePath = unref(activeFilePath);
    const node = parentNode.value;
    const dir = parentDirPath.value;

    const result: Record<"character" | "lorebook" | "preset", string[]> = {
      character: [],
      lorebook: [],
      preset: [],
    };

    if (!node || !dir) return result;

    Object.keys(node).forEach((fileName) => {
      const filePath = urlJoin(dir, fileName);
      if (filePath === activePath) return; // 排除自己

      const semanticType = store.fs.getSemanticType(fileName);
      if (["character", "lorebook", "preset"].includes(semanticType)) {
        result[semanticType as keyof typeof result].push(filePath);
      }
    });

    return result;
  });

  /**
   * 2. 头像逻辑封装
   * 获取同级目录下的 Avatar.* 文件
   */
  const avatarSrc = computed(() => {
    const node = parentNode.value;
    const dir = parentDirPath.value;

    if (node && dir) {
      const avatarName = Object.keys(node).find((name) =>
        name.startsWith("Avatar.")
      );
      if (avatarName) {
        return store.convertFileSrc(urlJoin(dir, avatarName));
      }
    }

    // 不存在则返回默认
    return defaultAvatar;
  });

  /**
   * 设置头像
   * 上传文件并删除旧头像
   */
  const setAvatar = async (file: File) => {
    const dir = parentDirPath.value;
    if (!dir) throw new Error("无法在未保存的环境中设置头像");

    const node = parentNode.value;
    const fsProxy = useFileSystemProxy(dir);

    // 1. 删除旧头像
    if (node) {
      const oldAvatars = Object.keys(node).filter((name) =>
        name.startsWith("Avatar.")
      );
      for (const oldName of oldAvatars) {
        // 使用 Proxy 或 Store 的 delete 方法
        delete (fsProxy as any)[oldName];
      }
    }

    // 确保删除操作完成 (等待 store 任务队列)
    await Promise.all(store.tasks);

    // 2. 上传新头像
    // 注意：Store.uploadFile 通常会自动处理文件名冲突或保留扩展名，建议重命名为 Avatar.ext
    const ext = file.name.split(".").pop() || "png";
    const newFileName = `Avatar.${ext}`;
    const renamedFile = new File([file], newFileName, { type: file.type });

    await store.uploadFile(dir, renamedFile);
  };

  return {
    inlineResources,
    avatar: {
      src: avatarSrc,
      set: setAvatar,
    },
  };
}
