// src/features/FileSystem/commands.ts
/** 表示创建一个空文件夹 */
export const EMPTY_FOLDER = Symbol("EMPTY_FOLDER");
/**
表示重命名操作
@example target['old-name.txt'] = new NEW_NAME('new-name.txt');
*/
export class NEW_NAME {
  constructor(public newName: string) {}
}
/**
表示仅当目标不存在时才执行创建操作
@example target['config.json'] = new DEFAULT({ settings: true });
*/
export class DEFAULT {
  constructor(public value: any) {}
}
/**
表示复制操作
@example target['new-folder-copy'] = new FOLDER('path/to/source-folder');
*/
export class FOLDER {
  constructor(public sourcePath: string) {}
}
/**
表示移动操作
将源节点移动到指定的文件夹路径下
@example fileSystemProxy['path/to/source/file.txt'] = new MOVE('path/to/destination');
*/
export class MOVE {
  constructor(public destinationFolderPath: string) {}
}
