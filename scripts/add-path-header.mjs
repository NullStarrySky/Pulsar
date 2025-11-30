const fs = require("fs");
const path = require("path");

// 配置
const CONFIG = {
  targetDir: path.resolve(__dirname, "../src"), // 目标目录
  projectRoot: path.resolve(__dirname, "../"), // 项目根目录（用于计算相对路径）
  excludeDirs: ["src/components/ui", "src/components/ai-elements"],
  excludeExtensions: [".d.ts", ".css"],
  targetExtensions: [".ts", ".vue"],
};

/**
 * 递归遍历目录
 */
function walk(dir) {
  // 获取相对于项目根目录的路径，用于检查忽略列表
  // 例如: src/components/ui
  const relativeDir = path
    .relative(CONFIG.projectRoot, dir)
    .split(path.sep)
    .join("/");

  // 检查文件夹是否在忽略列表中
  if (
    CONFIG.excludeDirs.some(
      (exclude) =>
        relativeDir === exclude || relativeDir.startsWith(exclude + "/")
    )
  ) {
    console.log(`[Skip Dir] ${relativeDir}`);
    return;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else {
      processFile(fullPath);
    }
  }
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  // 1. 检查排除的后缀 (如 .d.ts, .css)
  if (CONFIG.excludeExtensions.some((ext) => filePath.endsWith(ext))) {
    return;
  }

  // 2. 检查是否为目标后缀 (.ts, .vue)
  const ext = path.extname(filePath);
  if (!CONFIG.targetExtensions.includes(ext)) {
    return;
  }

  // 3. 计算预期的头部注释内容
  // 统一将 windows 的反斜杠 \ 转换为 /
  const relativePath = path
    .relative(CONFIG.projectRoot, filePath)
    .split(path.sep)
    .join("/");

  let expectedComment = "";
  let pattern = null;

  if (ext === ".ts") {
    expectedComment = `// ${relativePath}`;
    // 正则匹配：以 // src/ 开头的内容
    pattern = /^\/\/ src\/.*$/;
  } else if (ext === ".vue") {
    expectedComment = `<!-- ${relativePath} -->`;
    // 正则匹配：以 <!-- src/ 开头的内容
    pattern = /^<!-- src\/.* -->$/;
  }

  if (!expectedComment) return;

  // 4. 读取文件并修改
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // 获取第一行（去除首尾空白，用于比对，但写入时保留格式）
    const firstLine = lines[0] ? lines[0].trim() : "";

    let modified = false;

    // 检查第一行是否已经是路径注释（不管路径对不对，只要格式像）
    if (pattern.test(firstLine)) {
      // 如果存在类似结构
      if (firstLine !== expectedComment) {
        // 路径不对，替换掉
        lines[0] = expectedComment;
        modified = true;
        console.log(`[Update] ${relativePath}`);
      } else {
        // 路径完全一致，跳过
        // console.log(`[Ok] ${relativePath}`);
      }
    } else {
      // 不存在路径注释，新增一行
      lines.unshift(expectedComment);
      modified = true;
      console.log(`[Add] ${relativePath}`);
    }

    if (modified) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err);
  }
}

// 开始执行
console.log("Starting to add path headers...");
if (fs.existsSync(CONFIG.targetDir)) {
  walk(CONFIG.targetDir);
  console.log("Done.");
} else {
  console.error(`Directory not found: ${CONFIG.targetDir}`);
}
