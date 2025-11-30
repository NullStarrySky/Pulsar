// scripts/rename-sidecar.mjs
import { exec } from "node:child_process";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

// --- 配置 ---
const BINARY_NAME = "app";
const BINARY_DIR = "src-tauri/binaries";
// ---

const execAsync = promisify(exec);

/**
 * 获取当前平台的 Rust target triple
 * @returns {Promise<string>}
 */
async function getTargetTriple() {
  try {
    const { stdout } = await execAsync("rustc -vV");
    const match = stdout.match(/^host:\s*(.*)$/m);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error("Could not find 'host:' in rustc output.");
  } catch (error) {
    console.error("Error getting rustc target triple:", error);
    console.error(
      "Please ensure Rust is installed and accessible in your PATH.",
    );
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log("Starting sidecar rename process...");

  const targetTriple = await getTargetTriple();
  console.log(`Detected target triple: ${targetTriple}`);

  const extension = process.platform === "win32" ? ".exe" : "";

  const sourceName = `${BINARY_NAME}${extension}`;
  const destName = `${BINARY_NAME}-${targetTriple}${extension}`;

  const sourcePath = join(BINARY_DIR, sourceName);
  const destPath = join(BINARY_DIR, destName);

  try {
    await rename(sourcePath, destPath);
    console.log(`Successfully renamed sidecar binary:`);
    console.log(`  From: ${sourcePath}`);
    console.log(`  To:   ${destPath}`);
  } catch (error) {
    console.error(
      `Error renaming binary from ${sourcePath} to ${destPath}:`,
      error,
    );
    console.error(
      "Please check if the binary was correctly built by 'bun build' in the first place.",
    );
    process.exit(1);
  }
}

main();
