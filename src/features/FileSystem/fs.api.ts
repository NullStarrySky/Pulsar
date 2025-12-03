// src/features/FileSystem/fs.api.ts
/**
 * @module vfs.api
 * @description
 * 这是一个围绕 `@tauri-apps/plugin-fs`、`@tauri-apps/api/path` 和
 * `@tauri-apps/api/core` 的包装模块。
 *
 * 其核心目标是实现以下路径处理规则：
 * 1. 在 VFS 内部，所有路径一律使用正斜杠 (`/`) 作为分隔符。
 * 2. 在与外部 Tauri API 交互时，路径格式会根据当前操作系统进行适配。
 *
 * 具体实现：
 * - **输出规范化 (反向)**：所有从 Tauri API 返回的路径字符串，都会被转换为使用正斜杠 (`/`) 的格式。
 * - **输入规范化**：所有传递给 Tauri API 的路径参数，都会在调用前被转换为特定平台的路径格式（例如，在 Windows 上转换为反斜杠 `\`）。
 *
 * 这样可以确保应用层代码的跨平台一致性，同时正确调用底层系统 API。
 */

// 1. 导入原始 Tauri 模块和平台检测工具
import * as tauriFs from "@tauri-apps/plugin-fs";
import * as tauriPath from "@tauri-apps/api/path";
import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { type as getOsType } from "@tauri-apps/plugin-os";

// 2. 平台检测与路径处理辅助函数

// type OsType = 'linux' | 'windows' | 'macos' | 'ios' | 'android';
// 获取当前操作系统类型，这是一个同步操作
const osType = getOsType();

/**
 * @description (输出) 将平台特定的路径（可能含 `\`) 转换为使用 `/` 的内部标准路径。
 * @param p - 从 Tauri API 接收的原始路径字符串。
 * @returns 标准化的路径字符串。
 */
const normalizeOutput = (p: string): string => p.replace(/\\/g, "/");

/**
 * @description (输入) 将内部标准路径或路径数组，转换为适应当前操作系统的格式。
 *              在 Windows 上，将 `/` 转换为 `\`。在其他系统上保持不变。
 * @param arg - 要传递给 Tauri API 的路径参数。
 * @returns 适应平台的路径参数。
 */
function normalizeInput<T extends string | URL | (string | URL)[]>(arg: T): T {
  if (osType !== "windows") {
    return arg;
  }

  const convertToWinPath = (p: string | URL): string | URL => {
    if (typeof p === "string") {
      // 仅当路径不是以 \\ 开头的 UNC 路径时才进行转换，避免破坏网络路径
      if (p.startsWith("\\\\")) {
        return p;
      }
      return p.replace(/\//g, "\\");
    }
    // 不修改 URL 对象
    return p;
  };

  if (Array.isArray(arg)) {
    return arg.map(convertToWinPath) as T;
  }
  return convertToWinPath(arg as string | URL) as T;
}

// =========================================================================
//  Wrapper for @tauri-apps/plugin-fs
// =========================================================================

// 直接导出非路径处理的核心对象和枚举
export const { FileHandle, SeekMode } = tauriFs;

// --- 包装接收路径作为输入的函数 ---

export function copyFile(
  fromPath: string | URL,
  toPath: string | URL,
  options?: tauriFs.CopyFileOptions
): Promise<void> {
  return tauriFs.copyFile(
    normalizeInput(fromPath),
    normalizeInput(toPath),
    options
  );
}

export function create(
  path: string | URL,
  options?: tauriFs.CreateOptions
): Promise<tauriFs.FileHandle> {
  return tauriFs.create(normalizeInput(path), options);
}

export function exists(
  path: string | URL,
  options?: tauriFs.ExistsOptions
): Promise<boolean> {
  return tauriFs.exists(normalizeInput(path), options);
}

export function lstat(
  path: string | URL,
  options?: tauriFs.StatOptions
): Promise<tauriFs.FileInfo> {
  return tauriFs.lstat(normalizeInput(path), options);
}

export function mkdir(
  path: string | URL,
  options?: tauriFs.MkdirOptions
): Promise<void> {
  return tauriFs.mkdir(normalizeInput(path), options);
}

export function open(
  path: string | URL,
  options?: tauriFs.OpenOptions
): Promise<tauriFs.FileHandle> {
  return tauriFs.open(normalizeInput(path), options);
}

export async function readDir(
  path: string | URL,
  options?: tauriFs.ReadDirOptions
): Promise<tauriFs.DirEntry[]> {
  // readDir 返回的 DirEntry 中的 name 只是文件名，不是完整路径，所以不需要输出规范化
  return tauriFs.readDir(normalizeInput(path), options);
}

export function readFile(
  path: string | URL,
  options?: tauriFs.ReadFileOptions
): Promise<Uint8Array> {
  return tauriFs.readFile(normalizeInput(path), options);
}

export function readTextFile(
  path: string | URL,
  options?: tauriFs.ReadFileOptions
): Promise<string> {
  return tauriFs.readTextFile(normalizeInput(path), options);
}

export function readTextFileLines(
  path: string | URL,
  options?: tauriFs.ReadFileOptions
): Promise<AsyncIterableIterator<string>> {
  return tauriFs.readTextFileLines(normalizeInput(path), options);
}

export function remove(
  path: string | URL,
  options?: tauriFs.RemoveOptions
): Promise<void> {
  return tauriFs.remove(normalizeInput(path), options);
}

export function rename(
  oldPath: string | URL,
  newPath: string | URL,
  options?: tauriFs.RenameOptions
): Promise<void> {
  return tauriFs.rename(
    normalizeInput(oldPath),
    normalizeInput(newPath),
    options
  );
}

export function size(path: string | URL): Promise<number> {
  return tauriFs.size(normalizeInput(path));
}

export function stat(
  path: string | URL,
  options?: tauriFs.StatOptions
): Promise<tauriFs.FileInfo> {
  return tauriFs.stat(normalizeInput(path), options);
}

export function truncate(
  path: string | URL,
  len?: number,
  options?: tauriFs.TruncateOptions
): Promise<void> {
  return tauriFs.truncate(normalizeInput(path), len, options);
}

export function writeFile(
  path: string | URL,
  data: Uint8Array | ReadableStream<Uint8Array>,
  options?: tauriFs.WriteFileOptions
): Promise<void> {
  return tauriFs.writeFile(normalizeInput(path), data, options);
}

export function writeTextFile(
  path: string | URL,
  data: string,
  options?: tauriFs.WriteFileOptions
): Promise<void> {
  return tauriFs.writeTextFile(normalizeInput(path), data, options);
}

/**
 * @description 监视文件或目录的延迟更改。
 * 对输入路径和事件中的输出路径进行规范化。
 */
export function watch(
  paths: string | string[] | URL | URL[],
  cb: (event: tauriFs.WatchEvent) => void,
  options?: tauriFs.DebouncedWatchOptions
): Promise<tauriFs.UnwatchFn> {
  const wrappedCb = (event: tauriFs.WatchEvent) => {
    event.paths = event.paths.map(normalizeOutput);
    cb(event);
  };
  return tauriFs.watch(normalizeInput(paths), wrappedCb, options);
}

/**
 * @description 立即监视文件或目录的更改。
 * 对输入路径和事件中的输出路径进行规范化。
 */
export function watchImmediate(
  paths: string | string[] | URL | URL[],
  cb: (event: tauriFs.WatchEvent) => void,
  options?: tauriFs.WatchOptions
): Promise<tauriFs.UnwatchFn> {
  const wrappedCb = (event: tauriFs.WatchEvent) => {
    event.paths = event.paths.map(normalizeOutput);
    cb(event);
  };
  return tauriFs.watchImmediate(normalizeInput(paths), wrappedCb, options);
}

// =========================================================================
//  Wrapper for @tauri-apps/api/path
// =========================================================================

// 直接导出不返回完整路径或不接收路径的函数和枚举
export const {
  isAbsolute, // isAbsolute 本身就处理平台差异，无需包装
  sep,
  delimiter,
  BaseDirectory,
} = tauriPath;

// --- 包装返回路径片段的函数 (输入规范化) ---
export async function basename(path: string, ext?: string): Promise<string> {
  return tauriPath.basename(normalizeInput(path), ext);
}

export async function extname(path: string): Promise<string> {
  return tauriPath.extname(normalizeInput(path));
}

// --- 包装返回完整路径的函数 (输入和输出规范化) ---

export async function appConfigDir(): Promise<string> {
  return normalizeOutput(await tauriPath.appConfigDir());
}

export async function appDataDir(): Promise<string> {
  return normalizeOutput(await tauriPath.appDataDir());
}

export async function appLocalDataDir(): Promise<string> {
  return normalizeOutput(await tauriPath.appLocalDataDir());
}

export async function appCacheDir(): Promise<string> {
  return normalizeOutput(await tauriPath.appCacheDir());
}

export async function appLogDir(): Promise<string> {
  return normalizeOutput(await tauriPath.appLogDir());
}

export async function audioDir(): Promise<string> {
  return normalizeOutput(await tauriPath.audioDir());
}

export async function cacheDir(): Promise<string> {
  return normalizeOutput(await tauriPath.cacheDir());
}

export async function configDir(): Promise<string> {
  return normalizeOutput(await tauriPath.configDir());
}

export async function dataDir(): Promise<string> {
  return normalizeOutput(await tauriPath.dataDir());
}

export async function desktopDir(): Promise<string> {
  return normalizeOutput(await tauriPath.desktopDir());
}

export async function documentDir(): Promise<string> {
  return normalizeOutput(await tauriPath.documentDir());
}

export async function downloadDir(): Promise<string> {
  return normalizeOutput(await tauriPath.downloadDir());
}

export async function executableDir(): Promise<string> {
  return normalizeOutput(await tauriPath.executableDir());
}

export async function fontDir(): Promise<string> {
  return normalizeOutput(await tauriPath.fontDir());
}

export async function homeDir(): Promise<string> {
  return normalizeOutput(await tauriPath.homeDir());
}

export async function localDataDir(): Promise<string> {
  return normalizeOutput(await tauriPath.localDataDir());
}

export async function pictureDir(): Promise<string> {
  return normalizeOutput(await tauriPath.pictureDir());
}

export async function publicDir(): Promise<string> {
  return normalizeOutput(await tauriPath.publicDir());
}

export async function resourceDir(): Promise<string> {
  return normalizeOutput(await tauriPath.resourceDir());
}

export async function runtimeDir(): Promise<string> {
  return normalizeOutput(await tauriPath.runtimeDir());
}

export async function templateDir(): Promise<string> {
  return normalizeOutput(await tauriPath.templateDir());
}

export async function videoDir(): Promise<string> {
  return normalizeOutput(await tauriPath.videoDir());
}

export async function tempDir(): Promise<string> {
  return normalizeOutput(await tauriPath.tempDir());
}

export async function resolve(...paths: string[]): Promise<string> {
  return normalizeOutput(await tauriPath.resolve(...normalizeInput(paths)));
}

export async function resolveResource(resourcePath: string): Promise<string> {
  return normalizeOutput(
    await tauriPath.resolveResource(normalizeInput(resourcePath))
  );
}

export async function normalize(path: string): Promise<string> {
  return normalizeOutput(await tauriPath.normalize(normalizeInput(path)));
}

export async function join(...paths: string[]): Promise<string> {
  return normalizeOutput(await tauriPath.join(...normalizeInput(paths)));
}

export async function dirname(path: string): Promise<string> {
  return normalizeOutput(await tauriPath.dirname(normalizeInput(path)));
}

// =========================================================================
//  Wrapper for @tauri-apps/api/core
// =========================================================================

/**
 * @description 将文件路径转换为 webview 可以使用的 URL。
 * 包装函数以规范化输入的 `filePath`。
 */
export function convertFileSrc(filePath: string, protocol?: string): string {
  return tauriConvertFileSrc(normalizeInput(filePath), protocol);
}

// =========================================================================
//  Re-export all types to be used by the application
// =========================================================================

export type {
  CreateOptions,
  OpenOptions,
  CopyFileOptions,
  MkdirOptions,
  DirEntry,
  ReadDirOptions,
  ReadFileOptions,
  RemoveOptions,
  RenameOptions,
  StatOptions,
  TruncateOptions,
  WriteFileOptions,
  ExistsOptions,
  FileInfo,
  WatchOptions,
  DebouncedWatchOptions,
  WatchEvent,
  WatchEventKind,
  WatchEventKindAccess,
  WatchEventKindCreate,
  WatchEventKindModify,
  WatchEventKindRemove,
  UnwatchFn,
} from "@tauri-apps/plugin-fs";
