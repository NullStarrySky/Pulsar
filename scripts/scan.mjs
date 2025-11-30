const fs = require("fs");
const path = require("path");

// --- 配置区域 ---
const CONFIG = {
  // 要扫描的根目录
  rootDir: process.cwd(),
  // 忽略的文件夹
  excludeDirs: [
    "node_modules",
    "src-tauri",
    ".git",
    ".vscode",
    "dist",
    "build",
    "coverage",
  ],
  // 忽略的文件后缀 (例如图片、锁文件等)
  excludeExtensions: [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".lock",
    ".json",
    ".map",
    ".md",
  ],
  // 警告阈值：如果单文件超过这个行数，标记为"潜在屎山"
  warningThreshold: 600,
};

// --- 统计存储 ---
let stats = {
  totalFiles: 0,
  totalLines: 0,
  byExtension: {},
  largeFiles: [], // 用于存储大文件以供检阅
};

/**
 * 递归扫描目录
 */
function scanDirectory(directory) {
  const items = fs.readdirSync(directory);

  items.forEach((item) => {
    const fullPath = path.join(directory, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 检查是否在排除列表中
      if (!CONFIG.excludeDirs.includes(item)) {
        scanDirectory(fullPath);
      }
    } else {
      // 处理文件
      processFile(fullPath, item);
    }
  });
}

/**
 * 处理单个文件
 */
function processFile(filePath, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  // 排除不需要统计的文件类型
  if (CONFIG.excludeExtensions.includes(ext) || !ext) return;

  try {
    // 读取文件内容
    const content = fs.readFileSync(filePath, "utf-8");
    // 简单的按行分割统计
    const lines = content.split(/\r\n|\r|\n/).length;

    // 更新总数
    stats.totalFiles++;
    stats.totalLines += lines;

    // 按扩展名统计
    if (!stats.byExtension[ext]) {
      stats.byExtension[ext] = { files: 0, lines: 0 };
    }
    stats.byExtension[ext].files++;
    stats.byExtension[ext].lines += lines;

    // 记录所有文件用于排序，找出最大的文件
    stats.largeFiles.push({
      path: path.relative(CONFIG.rootDir, filePath),
      lines: lines,
    });
  } catch (error) {
    // 可能是二进制文件或其他读取错误，跳过
    // console.warn(`Skipped: ${filePath}`);
  }
}

// --- 主执行流程 ---
console.log("🔍 正在扫描代码库...\n");
const startTime = Date.now();

scanDirectory(CONFIG.rootDir);

// 对文件按行数倒序排序，取前10
const topLargeFiles = stats.largeFiles
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 10);

const endTime = Date.now();

// --- 输出结果 ---

console.log("========================================");
console.log(`📊 扫描完成 (耗时 ${endTime - startTime}ms)`);
console.log("========================================\n");

console.log(`📁 总文件数: ${stats.totalFiles}`);
console.log(`📝 总代码行: ${stats.totalLines}`);
console.log("----------------------------------------");

console.log("\n📂 按语言(后缀)分布:");
console.table(
  Object.entries(stats.byExtension)
    .sort(([, a], [, b]) => b.lines - a.lines) // 按行数排序
    .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {})
);

console.log('\n⚠️  潜在的"屎山" (行数最多的前10个文件):');
console.log("   (建议拆分超过 500 行的文件)");
console.log("---------------------------------------------------------------");
console.log("| 行数   | 文件路径");
console.log("|--------|------------------------------------------------------");

topLargeFiles.forEach((file) => {
  const isWarning = file.lines > CONFIG.warningThreshold;
  const mark = isWarning ? "🔴" : "🟢";
  console.log(`| ${file.lines.toString().padEnd(6)} | ${mark} ${file.path}`);
});
console.log("---------------------------------------------------------------");
