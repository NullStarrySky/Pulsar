// src/components/EnvironmentSidebar/composables/useEnvironment.ts

import { debounce } from "lodash-es";
import { computed, type MaybeRef, ref, unref, watch } from "vue";
import defaultAvatar from "@/assets/default.jpg";
import { useFileContent } from "@/features/FileSystem/composables/useFileContent";
import {
	type FileSignal,
	useFileSystemStore,
	VirtualFile,
	VirtualFolder,
	type VirtualNode,
} from "@/features/FileSystem/FileSystem.store";
import type { SemanticType } from "@/schema/SemanticType";
import type { ManifestContent, ResourceSelection } from "../manifest.types";
import { createExecuteContext } from "./useExecuteContext";

// ==========================================
// 类型扩展
// ==========================================

// 本地使用的资源类型，包含 SemanticType 和其他辅助类型
export type LocalResourceType =
	| SemanticType
	| "image"
	| "component"
	| "unknown";

export interface ResourceItem {
	node: VirtualNode;
	name: string;
	path: string;
	type: LocalResourceType;

	// 标志位
	isShared: boolean; // S 或 M
	isMixin: boolean; // M
	isTemplate: boolean; // T

	// 状态
	tags: string[];
	isSelected: boolean; // 对于 char/lore/preset 是 selection，对于 image 是 backgroundPath，对于 component 是 registered

	// 组件特有状态
	componentMeta?: {
		usage: "none" | "inline" | "override";
		key: string; // 注册的标签名(inline) 或 覆盖的类型(override)
	};
}

// ==========================================
// 主逻辑
// ==========================================

export function useEnvironment(activeFilePath: MaybeRef<string | null>) {
	const store = useFileSystemStore();
	const pathRef = computed(() => unref(activeFilePath));

	// ... (PackageRoot 解析逻辑保持不变) ...
	const packageRoot = computed(() => {
		const current = pathRef.value;
		if (!current || !store.isInitialized) return null;
		try {
			return store.resolvePackageFolder(current);
		} catch (e) {
			return null;
		}
	});

	const manifestPath = computed(() => {
		if (!packageRoot.value) return null;
		return `${packageRoot.value.path}/manifest.json`;
	});

	// 默认 Manifest 结构
	const defaultManifest: ManifestContent = {
		selection: {},
		customComponents: {},
		overrides: {},
		backgroundPath: "",
	};

	const manifestContent = useFileContent<ManifestContent>(
		manifestPath,
		defaultManifest,
	);

	// =========================================================================
	// 资源扫描核心逻辑
	// =========================================================================

	const scanResources = async (
		targetType:
			| "character"
			| "lorebook"
			| "preset"
			| "background"
			| "component",
		extensions?: string[],
	): Promise<ResourceItem[]> => {
		const root = packageRoot.value;
		const manifest = manifestContent.value || defaultManifest;
		if (!root) return [];

		const results = new Map<string, ResourceItem>();

		// Helper: 检查文件
		const isValidFile = (file: VirtualFile): boolean => {
			// 1. 扩展名检查
			if (extensions && extensions.length > 0) {
				const ext = file.name.split(".").pop()?.toLowerCase();
				if (!ext || !extensions.includes(ext)) return false;
			}

			// 2. 类型逻辑
			if (targetType === "background" || targetType === "component") {
				// 这两种类型不依赖 SemanticType 标记，只依赖文件夹或扩展名
				return true;
			} else {
				// SemanticType 检查
				return (
					file.name.includes(`[${targetType}`) ||
					file.semanticType === targetType
				);
			}
		};

		// Helper: 创建 ResourceItem
		const createItem = async (node: VirtualNode): Promise<ResourceItem> => {
			let signal: FileSignal | null = null;
			let type: LocalResourceType = "unknown";

			if (node instanceof VirtualFile) {
				signal = node.signal;
				if (targetType === "background") type = "image";
				else if (targetType === "component") type = "component";
				else type = node.semanticType || "unknown";
			}

			const isMixin = signal === "M";
			const isShared = signal === "S" || signal === "M";
			const isTemplate = signal === "T";
			const tags = await node.getTags();

			let isSelected = false;
			let componentMeta: ResourceItem["componentMeta"];

			// 状态判断逻辑
			if (targetType === "background") {
				isSelected = manifest.backgroundPath === node.path;
			} else if (targetType === "component") {
				// 检查是否在 customComponents 或 overrides 中
				const inlineKey = Object.entries(manifest.customComponents || {}).find(
					([k, v]) => v === node.path,
				)?.[0];
				const overrideKey = Object.entries(manifest.overrides || {}).find(
					([k, v]) => v === node.path,
				)?.[0];

				if (inlineKey) {
					isSelected = true;
					componentMeta = { usage: "inline", key: inlineKey };
				} else if (overrideKey) {
					isSelected = true;
					componentMeta = { usage: "override", key: overrideKey };
				} else {
					componentMeta = { usage: "none", key: "" };
				}
			} else {
				// 标准 SemanticType
				const list =
					manifest.selection?.[targetType as keyof ResourceSelection] || [];
				isSelected = isMixin ? true : list.includes(node.path);
			}

			return {
				node,
				name: node.name,
				path: node.path,
				type,
				isShared,
				isMixin,
				isTemplate,
				tags,
				isSelected,
				componentMeta,
			};
		};

		// --- 扫描策略 ---
		let searchFolder: VirtualFolder | undefined;

		if (targetType === "background") {
			// 策略：扫描 root/background 文件夹
			const bgNode = root.resolve("background");
			if (bgNode instanceof VirtualFolder) searchFolder = bgNode;
		} else {
			// 策略：character/lorebook/preset/component 扫描根目录
			// (通常组件和配置文件都在包根目录，或用户自己组织的子目录，这里简化为扫描根目录，
			// 如果 component 需要独立文件夹，可在此修改)
			searchFolder = root;
		}

		if (searchFolder) {
			for (const child of searchFolder.children.values()) {
				if (child instanceof VirtualFile && isValidFile(child)) {
					results.set(child.path, await createItem(child));
				}
			}
		}

		// Global Mixin 扫描 (仅 SemanticType)
		if (targetType !== "background" && targetType !== "component") {
			const scanGlobal = async (folder: VirtualFolder) => {
				for (const child of folder.children.values()) {
					if (child instanceof VirtualFolder) {
						await scanGlobal(child);
					} else if (child instanceof VirtualFile) {
						if (child.signal !== "S" && child.signal !== "M") continue;
						if (child.path.startsWith(`${root.path}/`)) continue;
						if (isValidFile(child)) {
							results.set(child.path, await createItem(child));
						}
					}
				}
			};
			await scanGlobal(store.root);
		}

		return Array.from(results.values()).sort((a, b) => {
			// 排序：选中 > Mixin > Template > Name
			if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
			if (a.isMixin !== b.isMixin) return a.isMixin ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	};

	// =========================================================================
	// 响应式资源列表
	// =========================================================================

	const resources = ref<{
		character: ResourceItem[];
		lorebook: ResourceItem[];
		preset: ResourceItem[];
		background: ResourceItem[];
		component: ResourceItem[];
	}>({
		character: [],
		lorebook: [],
		preset: [],
		background: [],
		component: [],
	});

	const isScanning = ref(false);

	const refreshResources = async () => {
		if (!packageRoot.value) return;
		isScanning.value = true;
		try {
			const [char, lore, pre, bg, comp] = await Promise.all([
				scanResources("character"),
				scanResources("lorebook"),
				scanResources("preset"),
				scanResources("background", [
					"png",
					"jpg",
					"jpeg",
					"webp",
					"gif",
					"mp4",
				]),
				scanResources("component", ["vue"]), // 扫描组件
			]);

			resources.value = {
				character: char,
				lorebook: lore,
				preset: pre,
				background: bg,
				component: comp,
			};
		} finally {
			isScanning.value = false;
		}
	};

	watch(
		[packageRoot, () => manifestContent.value],
		debounce(refreshResources, 300),
		{ immediate: true, deep: true },
	);
	// 监听文件系统变动 (可选，如果 FS Store 有全局事件总线更好)
	// 这里假设外部触发或通过 CRUD 操作自动触发

	// =========================================================================
	// 4. 头像逻辑 (Inline Resources Merge)
	// =========================================================================

	const avatarSrc = computed(() => {
		if (!packageRoot.value) return defaultAvatar;
		// 查找 Avatar.*
		for (const [name, node] of packageRoot.value.children) {
			if (
				node instanceof VirtualFile &&
				name.match(/^Avatar\.(png|jpg|jpeg|webp|gif)$/i)
			) {
				return node.url;
			}
		}
		return defaultAvatar;
	});

	const uploadAvatar = async (file: File) => {
		const root = packageRoot.value;
		if (!root) throw new Error("未选定角色环境");

		// 1. 删除旧头像
		const oldAvatars: VirtualFile[] = [];
		for (const [name, node] of root.children) {
			if (node instanceof VirtualFile && name.match(/^Avatar\./i)) {
				oldAvatars.push(node);
			}
		}
		await Promise.all(oldAvatars.map((f) => f.delete()));

		// 2. 导入新头像
		const ext = file.name.split(".").pop() || "png";
		const newFileName = `Avatar.${ext}`;

		// 创建一个重命名后的 File 对象，或导入后重命名
		const renamedFile = new File([file], newFileName, { type: file.type });
		await root.importFile(renamedFile);

		await refreshResources(); // 刷新以可能触发 UI 更新
	};

	// =========================================================================
	// 5. 文件操作 (CRUD & Signal)
	// =========================================================================
	/**
	 * 切换普通资源选中 (Char, Lore, Preset, Background)
	 */
	const toggleSelection = (item: ResourceItem, selected: boolean) => {
		if (item.isMixin || item.isTemplate) return;

		const manifest = { ...manifestContent.value } || defaultManifest;

		// 1. Background (单选，存放在 manifest.backgroundPath)
		if (item.type === "image") {
			manifest.backgroundPath = selected ? item.path : "";
			manifestContent.value = manifest;
			return;
		}

		// 2. SemanticType (多选，存放在 manifest.selection)
		// 确保 type 是 ResourceSelection 的有效 Key
		const validKeys: (keyof ResourceSelection)[] = [
			"character",
			"lorebook",
			"preset",
		];
		if (!(validKeys as string[]).includes(item.type)) return;

		const typeKey = item.type as keyof ResourceSelection;
		const currentList = [...(manifest.selection[typeKey] || [])];

		if (selected) {
			if (!currentList.includes(item.path)) currentList.push(item.path);
		} else {
			const idx = currentList.indexOf(item.path);
			if (idx > -1) currentList.splice(idx, 1);
		}

		manifest.selection = { ...manifest.selection, [typeKey]: currentList };
		manifestContent.value = manifest;
	};

	/**
	 * 专门用于组件的设置
	 * @param item 组件资源项
	 * @param usage 'inline' | 'override' | 'none'
	 * @param key 当 usage='inline' 时为标签名(如 'status-bar')，当 usage='override' 时为 SemanticType(如 'chat')
	 */
	const setComponentAs = (
		item: ResourceItem,
		usage: "inline" | "override" | "none",
		key?: string,
	) => {
		if (item.type !== "component") return;

		const manifest = { ...manifestContent.value } || defaultManifest;
		const customComponents = { ...manifest.customComponents };
		const overrides = { ...manifest.overrides };

		// 1. 先清除该文件在两个列表中的旧记录 (避免同一个文件既是 A 又是 B)
		for (const [k, v] of Object.entries(customComponents)) {
			if (v === item.path) delete customComponents[k];
		}
		for (const [k, v] of Object.entries(overrides)) {
			if (v === item.path) delete overrides[k as SemanticType];
		}

		// 2. 根据新模式写入
		if (usage === "inline" && key) {
			customComponents[key] = item.path;
		} else if (usage === "override" && key) {
			// 这里的 key 应该是 SemanticType
			overrides[key as SemanticType] = item.path;
		}

		// 3. 更新 Manifest
		manifest.customComponents = customComponents;
		manifest.overrides = overrides;
		manifestContent.value = manifest;
	};

	/**
	 * 合并的 setSignal 和 setTemplate
	 * @param signal 'S' | 'M' | 'T' | null. 传入 'T' 等同于 setTemplate(true)
	 */
	const setFileStatus = async (
		item: ResourceItem,
		signal: FileSignal | null,
	) => {
		if (!(item.node instanceof VirtualFile)) return;

		if (signal) {
			await item.node.setSignal(signal);
		} else {
			await item.node.removeSignal();
		}
		await refreshResources();
	};

	/**
	 * 新建资源
	 * @param type 语义类型
	 * @param templateFileName 可选，模板文件名
	 */
	const createNew = async (type: SemanticType, templateName?: string) => {
		const root = packageRoot.value;
		if (!root) return;

		// 如果指定了 templateName (从 Template 资源创建)
		// 需要先找到那个 Template 文件内容
		if (templateName) {
			// 这里的逻辑可以优化为从 resources.value 中查找 type === type && isTemplate
			// 暂时简化：使用 createTypedFile 内部逻辑，或手动读取
			// 假设 VirtualFolder.createTypedFile 支持处理模板逻辑，或者我们在这里手动处理
		}

		// 使用 FS Store 的 createTypedFile
		try {
			await root.createTypedFile(`New ${type}`, type, true);
			await refreshResources();
		} catch (e) {
			console.error("Create failed", e);
		}
	};

	/**
	 * 通用上传 (支持拖拽上传到当前环境)
	 */
	const uploadFile = async (file: File) => {
		const root = packageRoot.value;
		if (!root) return;

		// 如果是背景图，建议上传到 background 文件夹
		if (file.type.startsWith("image/")) {
			let bgFolder = root.resolve("background");
			if (!bgFolder) {
				bgFolder = await root.createDir("background");
			}
			if (bgFolder instanceof VirtualFolder) {
				await bgFolder.importFile(file);
			}
		} else {
			await root.importFile(file);
		}
		await refreshResources();
	};

	const deleteResource = async (item: ResourceItem) => {
		await item.node.delete();
		await refreshResources();
	};

	const renameResource = async (item: ResourceItem, newName: string) => {
		// 处理扩展名和 Signal 保持
		// 简单的重命名直接调用 node.rename，但 VirtualFile.rename 比较底层
		// 如果用户只改了主文件名，需要保留 .[type-S].json 后缀
		// 这里假设 UI 传递的是完整文件名或者 VirtualFile 内部处理智能重命名
		// 建议：UI 层让用户修改 BaseName，然后重新组合
		await item.node.rename(newName);
		await refreshResources();
	};

	// =========================================================================
	// 6. 执行上下文快照 (Run-time Data)
	// =========================================================================

	const getExecuteContextSnapshot = async (
		customContext: Record<string, any> = {},
	) => {
		if (!store.isInitialized) return null;
		const manifest = manifestContent.value || defaultManifest;

		// Helper: 读取内容
		const resolveContent = async (list: ResourceItem[]) => {
			const selected = list.filter((i) => i.isSelected);
			const results = [];
			for (const item of selected) {
				if (item.node instanceof VirtualFile) {
					try {
						const content = await item.node.read();
						results.push({
							path: item.path,
							content:
								typeof content === "string" ? JSON.parse(content) : content,
						});
					} catch (e) {
						console.warn(`Read failed: ${item.path}`);
					}
				}
			}
			return results;
		};

		const [chars, lores, presets] = await Promise.all([
			resolveContent(resources.value.character),
			resolveContent(resources.value.lorebook),
			resolveContent(resources.value.preset),
		]);

		// 注意：这里我们需要把 Manifest 中的 Component 配置也传递出去
		// createExecuteContext 需要更新签名以接收 manifest 配置
		return createExecuteContext(
			customContext,
			{ character: chars, lorebook: lores, preset: presets },
			store.setting!,
			store.modelConfig!,
			manifest, // <--- 传入 Manifest 以读取组件配置
		);
	};

	// =========================================================================
	// Return
	// =========================================================================

	return {
		// 状态
		manifestPath,
		manifestContent,
		packageRoot,

		// 资源列表 (Character, Lorebook, etc.)
		resources,
		isScanning,
		refreshResources,

		// 具体的背景图配置 (from manifest)
		backgroundConfig: computed(() => manifestContent.value?.backgroundPath),

		// 头像管理
		avatar: {
			src: avatarSrc,
			upload: uploadAvatar,
		},

		// 操作
		actions: {
			createNew,
			uploadFile,
			delete: deleteResource,
			rename: renameResource,
			setSignal: setFileStatus, // 包含了 setTemplate (signal='T')
			toggleSelection,
			setComponentAs, // 导出新函数
		},

		// 运行时
		getExecuteContextSnapshot,
	};
}
