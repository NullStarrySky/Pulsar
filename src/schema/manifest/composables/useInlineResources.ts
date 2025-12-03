// src/schema/manifest/composables/useInlineResources.ts
import { computed, unref, type Ref } from "vue";
import {
  useFileSystemStore,
  VirtualFolder,
  VirtualFile,
} from "@/features/FileSystem/FileSystem.store";
import defaultAvatar from "@/assets/default.jpg";

export function useInlineResources(activeFilePath: Ref<string | null>) {
  const store = useFileSystemStore();

  /** 获取当前文件的父目录路径 */
  const parentDirPath = computed(() => {
    const path = unref(activeFilePath);
    if (!path) return null;
    const parts = path.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  });

  /** 获取父目录节点 */
  const parentNode = computed(() => {
    const dir = parentDirPath.value;
    if (dir === null) return null; // 根目录传空字符串是允许的，但 null 不行
    const node = store.resolvePath(dir);
    return node instanceof VirtualFolder ? node : null;
  });

  /**
   * 1. 扫描同级目录下的资源 (Character, Lorebook, Preset)
   * 排除自身
   */
  const inlineResources = computed(() => {
    const activePath = unref(activeFilePath);
    const folder = parentNode.value;

    const result: Record<"character" | "lorebook" | "preset", string[]> = {
      character: [],
      lorebook: [],
      preset: [],
    };

    if (!folder) return result;

    for (const [_, node] of folder.children) {
      if (node instanceof VirtualFile) {
        if (node.path === activePath) continue;

        // 使用新文件系统中的 getter 获取语义类型
        const type = node.semanticType;
        if (type && ["character", "lorebook", "preset"].includes(type)) {
          // @ts-ignore
          result[type].push(node.path);
        }
      }
    }

    return result;
  });

  /**
   * 2. 头像逻辑封装
   * 获取同级目录下的 Avatar.* 文件
   */
  const avatarSrc = computed(() => {
    const folder = parentNode.value;
    if (!folder) return defaultAvatar;

    // 查找名为 Avatar.xxx 的文件
    for (const [name, node] of folder.children) {
      if (
        node instanceof VirtualFile &&
        name.match(/^Avatar\.(png|jpg|jpeg|webp|gif)$/i)
      ) {
        return node.url; // 利用 VirtualNode 的 url getter (已处理 tauri 协议)
      }
    }

    return defaultAvatar;
  });

  /**
   * 设置头像
   * 上传文件并删除旧头像
   */
  const setAvatar = async (file: File) => {
    const folder = parentNode.value;
    if (!folder) throw new Error("无法在未保存的环境中设置头像");

    // 1. 删除旧头像
    const oldAvatars: VirtualFile[] = [];
    for (const [name, node] of folder.children) {
      if (node instanceof VirtualFile && name.match(/^Avatar\./i)) {
        oldAvatars.push(node);
      }
    }

    // 并行删除旧文件
    await Promise.all(oldAvatars.map((f) => f.delete()));

    // 2. 导入新头像并重命名
    const ext = file.name.split(".").pop() || "png";
    const newFileName = `Avatar.${ext}`;

    // 我们先导入（importFile 会自动处理重名，但我们刚刚删除了旧的），然后重命名确保名字正确
    // 或者构造一个新的 File 对象
    const renamedFile = new File([file], newFileName, { type: file.type });
    await folder.importFile(renamedFile);
  };

  return {
    inlineResources,
    avatar: {
      src: avatarSrc,
      set: setAvatar,
    },
  };
}
