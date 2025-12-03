// src/features/FileSystem/FileSystem.events.ts
import mitt from "mitt";

export enum FSEventType {
  FILE_CREATED = "file:created",
  FILE_DELETED = "file:deleted",
  FILE_MODIFIED = "file:modified",
  FILE_RENAMED = "file:renamed",
  FILE_MOVED = "file:moved",
  FILE_COPIED = "file:copied",

  DIR_CREATED = "dir:created",
  DIR_DELETED = "dir:deleted",
  DIR_RENAMED = "dir:renamed",
  DIR_MOVED = "dir:moved",
  DIR_COPIED = "dir:copied",
}

export type FSEventPayload = {
  [FSEventType.FILE_CREATED]: { path: string; content?: any };
  [FSEventType.FILE_DELETED]: { path: string };
  [FSEventType.FILE_MODIFIED]: { path: string };
  [FSEventType.FILE_RENAMED]: { oldPath: string; newPath: string };
  [FSEventType.FILE_MOVED]: { oldPath: string; newPath: string };
  [FSEventType.FILE_COPIED]: { from: string; to: string };

  [FSEventType.DIR_CREATED]: { path: string };
  [FSEventType.DIR_DELETED]: { path: string };
  [FSEventType.DIR_RENAMED]: { oldPath: string; newPath: string };
  [FSEventType.DIR_MOVED]: { oldPath: string; newPath: string };
  [FSEventType.DIR_COPIED]: { from: string; to: string };
};

export const fsEmitter = mitt<FSEventPayload>();

export function useFileSystemEvents() {
  return {
    on: fsEmitter.on,
    off: fsEmitter.off,
    emit: fsEmitter.emit,
  };
}
