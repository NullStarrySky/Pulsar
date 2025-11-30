// src/features/FileSystem/useFileSystemProxy.ts
import {
  copyFile,
  mkdir,
  readFile,
  readTextFile,
  remove,
  rename,
  stat as tauriStat,
  writeFile,
  writeTextFile,
  appDataDir,
  extname,
  convertFileSrc,
} from "@/features/FileSystem/fs.api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import {
  useFileSystemStore,
  type FolderContent,
  TRASH_DIR_PATH,
  isFolderNode,
  FileNode,
  FileSystemProxy,
} from "./FileSystem.store";
import { EMPTY_FOLDER, NEW_NAME, DEFAULT, FOLDER, MOVE } from "./commands";

import urljoin from "url-join";
import { SemanticType, SemanticTypeMap } from "@/schema/SemanticType";
import { fsEmitter, FSEventType } from "./FileSystem.events";

// --- 辅助函数 ---

const _isBinaryData = (value: any): value is Uint8Array =>
  value instanceof Uint8Array;

const _splitComplexName = (
  filename: string
): { base: string; semantic: string; extension: string } => {
  const lastDotIndex = filename.lastIndexOf(".");
  const extension = lastDotIndex !== -1 ? filename.substring(lastDotIndex) : "";
  const nameWithoutExt = extension
    ? filename.substring(0, lastDotIndex)
    : filename;

  const semanticMatch = nameWithoutExt.match(/\.\[.*?\]$/);
  const semantic = semanticMatch ? semanticMatch[0] : "";
  const base = semantic
    ? nameWithoutExt.substring(0, semanticMatch?.index)
    : nameWithoutExt;

  return { base, semantic, extension };
};

export const _getUniqueNameForCopy = (
  filename: string,
  targetFolderContent: FolderContent
): string => {
  const existingNames = new Set(Object.keys(targetFolderContent));
  if (!existingNames.has(filename)) {
    return filename;
  }
  const { base, semantic, extension } = _splitComplexName(filename);
  let counter = 2;
  let trialName: string;
  do {
    trialName = `${base} (${counter})${semantic}${extension}`;
    counter++;
  } while (existingNames.has(trialName));
  return trialName;
};

// --- 核心组合式函数 ---

export function useFileSystemProxy(folderPath: string): FileSystemProxy {
  const store = useFileSystemStore();

  const _getOrCreateNode = (path: string): FolderContent => {
    const parts = path.split("/").filter((p) => p);
    let currentNode = store.fileStructure;

    for (const part of parts) {
      if (!isFolderNode(currentNode[part])) {
        currentNode[part] = {};
      }
      currentNode = currentNode[part] as FolderContent;
    }
    return currentNode;
  };

  const rootNode = _getOrCreateNode(folderPath);

  const createProxyHandler = (
    currentPath: string
  ): ProxyHandler<FolderContent> => {
    return {
      // --- GET TRAP ---
      get(target, prop: string, receiver) {
        if (typeof prop !== "string") {
          return Reflect.get(target, prop, receiver);
        }
        switch (prop) {
          case "getSemanticType":
            return (fileName: string) => {
              const match = fileName.match(/\.\[(.*?)]\./);
              return (match ? match[1] : "unknown") as SemanticType;
            };
          case "getType":
            return async (fileName: string) => await extname(fileName);
          case "toTrash":
            return async (nodeName: string) => {
              const nodePath = urljoin(currentPath, nodeName);
              if (store.lockedPaths.has(nodePath)) {
                throw new Error(
                  `Path "${nodePath}" is locked and cannot be moved to trash.`
                );
              }
              if (store.watchedFiles.has(nodePath)) {
                store.unwatchFile(nodePath);
              }

              const nodeToDelete = target[nodeName];
              const isDir = isFolderNode(nodeToDelete);
              const nodeType = isDir ? "directory" : "file";
              delete target[nodeName];

              const promise = (async () => {
                const trashedName = nodeName;
                const destinationPath = urljoin(TRASH_DIR_PATH, trashedName);
                await rename(nodePath, destinationPath, {
                  oldPathBaseDir: BaseDirectory.AppData,
                  newPathBaseDir: BaseDirectory.AppData,
                });

                const eventType = isDir
                  ? FSEventType.DIR_MOVED
                  : FSEventType.FILE_MOVED;
                fsEmitter.emit(eventType, {
                  oldPath: nodePath,
                  newPath: destinationPath,
                });

                const manifest = await store._readManifest();
                manifest.push({
                  key: trashedName,
                  originalPath: nodePath,
                  name: nodeName,
                  type: nodeType,
                  trashedAt: new Date().toISOString(),
                });
                await store._writeManifest(manifest);
              })();
              store.tasks.push(promise);
              await promise;
            };
          case "createTypedFile":
            return async (
              baseName: string,
              semanticType: SemanticType,
              withTemplate = true
            ) => {
              if (store.lockedPaths.has(currentPath)) {
                throw new Error(
                  `Cannot create file: Directory "${currentPath}" is locked.`
                );
              }
              let initialContent: any = {};

              if (withTemplate) {
                // 注意：这里不再通过 getEnvironmentPath 获取路径，而是假设模板在全局或特定位置
                // 或者需要重新设计 createTypedFile 以接受模板路径
                // 简单起见，这里先简化处理，或者假设调用者知道路径。
                // 但为了兼容性，可以尝试从 global 寻找模板
                const templatePath = urljoin(
                  "global/template",
                  `TEMPLATE.[${semanticType}].json`
                );
                try {
                  const templateContentStr = await readTextFile(templatePath, {
                    baseDir: BaseDirectory.AppData,
                  });
                  initialContent = JSON.parse(templateContentStr);
                } catch (e) {
                  // Fallback to definition
                  const definition = SemanticTypeMap[semanticType];
                  if (!definition || typeof definition.new !== "function") {
                    throw new Error(
                      `'new' function is not defined for semantic type: ${semanticType}`
                    );
                  }
                  initialContent = definition.new();
                }
              } else {
                const definition = SemanticTypeMap[semanticType];
                if (!definition || typeof definition.new !== "function") {
                  throw new Error(
                    `'new' function is not defined for semantic type: ${semanticType}`
                  );
                }
                initialContent = definition.new();
              }
              const finalFilename = `${baseName}.[${semanticType}].json`;
              (receiver as any)[finalFilename] = initialContent;
            };
          case "toPath":
            return currentPath;
          case "stat":
            return (async () => {
              const promise = tauriStat(currentPath, {
                baseDir: BaseDirectory.AppData,
              });
              store.tasks.push(promise);
              return await promise;
            })();
          case "toSrc":
            return (async () => {
              const fullPath = urljoin(await appDataDir(), currentPath);
              return convertFileSrc(fullPath);
            })();
          case "load":
            return async (config?: { loadBinary?: boolean }) => {
              const promise = store.load(currentPath, config?.loadBinary);
              store.tasks.push(promise);
              await promise;
            };
          case "unload":
            return () => {
              const unloadNode = (node: FolderContent | any) => {
                if (isFolderNode(node)) {
                  for (const key in node) {
                    if (isFolderNode(node[key])) {
                      unloadNode(node[key]);
                    } else if (node[key] instanceof FileNode) {
                      node[key].content = null;
                    }
                  }
                }
              };
              unloadNode(target);
            };
          case "recursiveFolder":
            return (callback: (path: string) => void) => {
              const recurse = async (path: string, node: FolderContent) => {
                callback(path);
                for (const key in node) {
                  const childNode = node[key];
                  if (isFolderNode(childNode)) {
                    await recurse(
                      urljoin(path, key),
                      childNode as FolderContent
                    );
                  }
                }
              };
              recurse(currentPath, target);
            };
          case "recursiveFile":
            return (callback: (path: string) => void) => {
              const recurse = async (
                path: string,
                node: FolderContent | any
              ) => {
                if (isFolderNode(node)) {
                  for (const key in node) {
                    await recurse(urljoin(path, key), node[key]);
                  }
                } else {
                  callback(path);
                }
              };
              recurse(currentPath, target);
            };
          case "download":
            return async (fileName: string) => {
              const filePath = urljoin(currentPath, fileName);
              const content = await readFile(filePath, {
                baseDir: BaseDirectory.AppData,
              });
              const blob = new Blob([content]);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            };
          case "empty":
            return async () => {
              for (const key in target) {
                const childPath = urljoin(currentPath, key);
                const isDir = isFolderNode(target[key]);
                if (store.watchedFiles.has(childPath)) {
                  store.unwatchFile(childPath);
                }
                await remove(childPath, {
                  baseDir: BaseDirectory.AppData,
                  recursive: true,
                });

                const eventType = isDir
                  ? FSEventType.DIR_DELETED
                  : FSEventType.FILE_DELETED;
                fsEmitter.emit(eventType, { path: childPath });

                delete target[key];
              }
            };
          // 移除了 getAvatarUrl, setAvatar, getEnvironmentPath
        }

        const value = target[prop];
        if (value instanceof FileNode) return value.content;
        if (isFolderNode(value)) {
          const childPath = urljoin(currentPath, prop);
          return new Proxy(
            value as FolderContent,
            createProxyHandler(childPath)
          );
        }
        return Reflect.get(target, prop, receiver);
      },
      // --- SET TRAP ---
      set(target, prop: string, value, receiver) {
        if (typeof prop !== "string") {
          return Reflect.set(target, prop, value, receiver);
        }
        const childPath = urljoin(currentPath, prop);
        if (store.lockedPaths.has(childPath)) {
          throw new Error(`Cannot modify locked path: ${childPath}`);
        }
        const keyExists = prop in target;

        if (value instanceof MOVE) {
          if (!keyExists) return false;

          const nodeToMove = target[prop];
          const isDir = isFolderNode(nodeToMove);
          const sourceName = prop;
          const destNode = store.getNodeByPath(
            store.fileStructure,
            value.destinationFolderPath
          );
          if (!isFolderNode(destNode)) return false;
          if (sourceName in destNode) return false;

          if (store.watchedFiles.has(childPath)) {
            store.unwatchFile(childPath);
          }

          delete target[prop];
          destNode[sourceName] = nodeToMove;

          const promise = (async () => {
            try {
              const finalDestPath = urljoin(
                value.destinationFolderPath,
                sourceName
              );
              await rename(childPath, finalDestPath, {
                oldPathBaseDir: BaseDirectory.AppData,
                newPathBaseDir: BaseDirectory.AppData,
              });

              const eventType = isDir
                ? FSEventType.DIR_MOVED
                : FSEventType.FILE_MOVED;
              fsEmitter.emit(eventType, {
                oldPath: childPath,
                newPath: finalDestPath,
              });
            } catch (error) {
              const sourceNode = store.getNodeByPath(
                store.fileStructure,
                currentPath
              );
              if (isFolderNode(sourceNode)) {
                delete destNode[sourceName];
                sourceNode[sourceName] = nodeToMove;
              }
            }
          })();
          store.tasks.push(promise);
          return true;
        }

        const handleCreation = async () => {
          let finalValue = value;
          if (value instanceof DEFAULT) finalValue = value.value;
          if (finalValue === EMPTY_FOLDER) {
            target[prop] = {};
            await mkdir(childPath, {
              baseDir: BaseDirectory.AppData,
              recursive: true,
            });
            fsEmitter.emit(FSEventType.DIR_CREATED, { path: childPath });
          } else if (finalValue instanceof FOLDER) {
            const sourceNode = _getOrCreateNode(finalValue.sourcePath);
            target[prop] = JSON.parse(JSON.stringify(sourceNode));

            await _copyRecursively(finalValue.sourcePath, childPath);
            fsEmitter.emit(FSEventType.DIR_COPIED, {
              from: finalValue.sourcePath,
              to: childPath,
            });
          } else if (_isBinaryData(finalValue)) {
            target[prop] = new FileNode(finalValue);
            await writeFile(childPath, finalValue, {
              baseDir: BaseDirectory.AppData,
            });
            fsEmitter.emit(FSEventType.FILE_CREATED, { path: childPath });
          } else {
            const content =
              typeof finalValue === "object"
                ? JSON.stringify(finalValue, null, 2)
                : String(finalValue);
            target[prop] = new FileNode(content);
            await writeTextFile(childPath, content, {
              baseDir: BaseDirectory.AppData,
            });
            fsEmitter.emit(FSEventType.FILE_CREATED, {
              path: childPath,
              content,
            });
          }
        };

        const handleUpdate = async () => {
          if (value instanceof NEW_NAME) {
            if (store.watchedFiles.has(childPath)) {
              store.unwatchFile(childPath);
            }
            const oldNode = target[prop];
            const isDir = isFolderNode(oldNode);
            const newPath = urljoin(currentPath, value.newName);

            delete target[prop];
            target[value.newName] = oldNode;
            await rename(childPath, newPath, {
              oldPathBaseDir: BaseDirectory.AppData,
              newPathBaseDir: BaseDirectory.AppData,
            });

            const eventType = isDir
              ? FSEventType.DIR_RENAMED
              : FSEventType.FILE_RENAMED;
            fsEmitter.emit(eventType, { oldPath: childPath, newPath });
          } else if (value instanceof FOLDER) {
            const uniqueName = _getUniqueNameForCopy(prop, target);
            const newPath = urljoin(currentPath, uniqueName);
            const sourceNode = _getOrCreateNode(value.sourcePath);
            target[uniqueName] = JSON.parse(JSON.stringify(sourceNode));

            await _copyRecursively(value.sourcePath, newPath);
            fsEmitter.emit(FSEventType.DIR_COPIED, {
              from: value.sourcePath,
              to: newPath,
            });
          } else if (_isBinaryData(value)) {
            target[prop] = new FileNode(value);
            await writeFile(childPath, value, {
              baseDir: BaseDirectory.AppData,
            });
            fsEmitter.emit(FSEventType.FILE_MODIFIED, { path: childPath });
          } else {
            const content =
              typeof value === "object"
                ? JSON.stringify(value, null, 2)
                : String(value);
            target[prop] = new FileNode(content);
            await writeTextFile(childPath, content, {
              baseDir: BaseDirectory.AppData,
            });
            fsEmitter.emit(FSEventType.FILE_MODIFIED, { path: childPath });
          }
        };

        let promise;
        if (keyExists) {
          if (value === EMPTY_FOLDER)
            throw new Error(
              `Cannot replace an existing node '${prop}' with a folder. Use delete first.`
            );
          if (value instanceof DEFAULT) return true;
          promise = handleUpdate();
        } else {
          if (value instanceof NEW_NAME)
            throw new Error(
              `Cannot rename non-existent file or folder '${prop}'.`
            );
          promise = handleCreation();
        }
        store.tasks.push(promise);
        return true;
      },
      // --- DELETE TRAP ---
      deleteProperty(target, prop: string) {
        if (typeof prop !== "string" || !(prop in target)) {
          throw new Error(`Cannot delete non-existent property '${prop}'`);
        }
        const childPath = urljoin(currentPath, prop);
        if (store.lockedPaths.has(childPath)) {
          throw new Error(`Cannot delete locked path: ${childPath}`);
        }
        if (store.watchedFiles.has(childPath)) {
          store.unwatchFile(childPath);
        }

        const isFolder = isFolderNode(target[prop]);
        delete target[prop];

        const promise = (async () => {
          await remove(childPath, {
            baseDir: BaseDirectory.AppData,
            recursive: isFolder,
          });

          const eventType = isFolder
            ? FSEventType.DIR_DELETED
            : FSEventType.FILE_DELETED;
          fsEmitter.emit(eventType, { path: childPath });
        })();
        store.tasks.push(promise);
        return true;
      },
      // --- IN TRAP ---
      has(target, prop) {
        if (typeof prop !== "string") return Reflect.has(target, prop);
        const specialProps = new Set([
          "toPath",
          "stat",
          "toSrc",
          "load",
          "unload",
          "recursiveFolder",
          "recursiveFile",
        ]);
        if (specialProps.has(prop)) return true;
        return prop in target;
      },
    };
  };

  const _copyRecursively = async (source: string, destination: string) => {
    const sourceNode = _getOrCreateNode(source);
    await mkdir(destination, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });
    for (const key in sourceNode) {
      const newSource = urljoin(source, key);
      const newDest = urljoin(destination, key);
      const childNode = sourceNode[key];
      if (isFolderNode(childNode)) {
        await _copyRecursively(newSource, newDest);
      } else {
        await copyFile(newSource, newDest, {
          fromPathBaseDir: BaseDirectory.AppData,
          toPathBaseDir: BaseDirectory.AppData,
        });
      }
    }
  };
  return new Proxy(rootNode, createProxyHandler(folderPath)) as FileSystemProxy;
}
