// src/lib/ExpressionEngine/ExpressionEngine.ts

import { BasicEnv } from "./BasicEnv";

export type Context = { [key: string]: any };

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/**
 * 从字符串中移除可选的 {{...}} 包裹并去除首尾空格。
 * @param expression - 可能被 {{...}} 包裹的表达式字符串。
 * @returns 解包并修剪后的表达式核心内容。
 */
function unwrapExpression(expression: string): string {
  const content = expression.trim();
  if (content.startsWith("{{") && content.endsWith("}}")) {
    return content.slice(2, -2).trim();
  }
  return content;
}

/**
 * 预处理表达式，将 #('resource_id') 语法转换为待执行的 JS 代码。
 * @param expression 原始表达式字符串
 * @param remoteLoadFn 用于加载资源的异步函数
 * @returns {Promise<{ finalBody: string, context: Context }>}
 *          一个包含最终函数体和附加上下文的对象。
 */
async function preprocessRemoteResources(
  expression: string,
  remoteLoadFn: (id: string) => Promise<any>
): Promise<{ finalBody: string; context: Context }> {
  const resourceRegex = /#\((['"])(.*?)\1\)/g;
  const matches = Array.from(expression.matchAll(resourceRegex));

  if (matches.length === 0) {
    return { finalBody: expression, context: {} };
  }

  // 1. 提取唯一的 resource_id
  const uniqueIds = [...new Set(matches.map((match) => match[2]))];

  // 2. 并发加载所有资源
  const loadPromises = uniqueIds.map((id) => remoteLoadFn(id));
  const loadedResources = await Promise.all(loadPromises);

  const idToResourceMap = new Map<string, any>();
  uniqueIds.forEach((id, index) => {
    idToResourceMap.set(id, loadedResources[index]);
  });

  // 3. & 4. 为每个资源创建变量，并重写表达式
  const newContext: Context = {};
  let rewrittenExpression = expression;

  // 使用 Map 确保相同的 #('alice') 被替换为同一个变量
  const idToVarName = new Map<string, string>();

  for (const match of matches) {
    const fullMatch = match[0]; // e.g., #('alice')
    const id = match[2];

    let varName = idToVarName.get(id);
    if (!varName) {
      // 创建一个安全且唯一的变量名
      varName = `__loaded_${id.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
      idToVarName.set(id, varName);
      newContext[varName] = idToResourceMap.get(id);
    }

    // 5. 替换
    // 注意：这里用简单的 replace 可能有风险，如果表达式是 #('a') + #('a')
    // 更好的方式是一次性替换。我们可以构建一个替换规则的数组。
    // 为了简单起见，这里先用 string.replace。在生产中可能需要更稳健的替换策略。
    rewrittenExpression = rewrittenExpression.replace(fullMatch, varName);
  }

  // 返回重写后的表达式主体和需要注入的新上下文
  return { finalBody: rewrittenExpression, context: newContext };
}
/**
 * 通用、可扩展的表达式执行引擎。
 * 它在一个隔离的沙箱环境中执行 JavaScript 字符串。
 */
export class ExpressionEngine {
  /**
   * 在提供的上下文中执行一个表达式或函数体字符串。
   *
   * @param content - 要执行的 JavaScript 字符串。
   *                  如果它不包含 'return' 关键字，它将被视为一个表达式，并自动添加 'return'。
   *                  如果它包含 'return'，它将被视为一个完整的函数体。
   * @param context - 一个键值对对象，其所有键都将成为执行环境中的可用变量。
   *                  (不再支持对象数组，由调用者提供一个统一的上下文对象，如代理)。
   * @param envFuncName - (可选) 上下文中一个函数的名字，用于包裹或后处理表达式结果。
   * @returns {Promise<any>} 一个 Promise，它会解析为表达式的执行结果。
   */
  public async execute(
    content: string,
    context: { [key: string]: any },
    envFuncName?: string
  ): Promise<any> {
    console.log("context:", context);
    // remoteLoad 函数现在应该直接在 context 代理上可用
    const remoteLoadFn = context.remoteLoad;
    if (typeof remoteLoadFn !== "function") {
      if (content.includes("#(")) {
        throw new Error(
          "Expression contains remote resource syntax #() but no 'remoteLoad' function was provided in the context."
        );
      }
    }

    const { finalBody: processedContent, context: injectedContext } =
      typeof remoteLoadFn === "function"
        ? await preprocessRemoteResources(content, remoteLoadFn)
        : { finalBody: content, context: {} };

    // 将预处理产生的上下文与主上下文合并。
    const finalContext = Object.assign(context, injectedContext);
    console.log("finalContext:", finalContext);

    const paramNames = Object.keys(finalContext);
    const paramValues = Object.values(finalContext);

    let functionBody = processedContent.trim();
    let postProcessor: Function | null = null;

    const isSimpleIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionBody);
    if (
      isSimpleIdentifier &&
      typeof finalContext[functionBody] === "function"
    ) {
      if (finalContext[functionBody].length === 0) {
        functionBody = `${functionBody}()`;
      }
    }
    const hasControlFlow = /return|;|if|for|while|switch|await/.test(
      functionBody
    );
    if (envFuncName && typeof finalContext[envFuncName] === "function") {
      if (hasControlFlow) {
        postProcessor = finalContext[envFuncName];
      } else {
        functionBody = `${envFuncName}(${functionBody})`;
      }
    }
    if (!/return|;|if|for|while|switch/.test(functionBody)) {
      functionBody = `return ${functionBody};`;
    }

    try {
      const dynamicFunction = new AsyncFunction(...paramNames, functionBody);
      const result = await dynamicFunction.apply(finalContext, paramValues);

      if (postProcessor) {
        return await Promise.resolve(postProcessor.call(finalContext, result));
      }
      return result;
    } catch (error: any) {
      console.error("Expression execution failed:", {
        originalprocessedContent: processedContent,
        finalFunctionBody: functionBody,
        finalContextKeys: paramNames,
        error,
      });
      throw new Error(
        `Execution Error in "${processedContent}": ${error.message}`
      );
    }
  }
}

// 辅助函数：确保输出是字符串
function _valueToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
/**
 * 展开给定文本中的所有 {{表达式}}。
 * @param text - 包含 {{...}} 表达式的输入字符串。
 * @param presetContext - 包含所有可用数据的原始上下文对象。
 * @returns {Promise<string>} 一个解析为最终字符串的 Promise。
 */
export async function applyExpressions(
  text: string,
  context: any
): Promise<string> {
  // 1. 改为 async 并返回 Promise<string>
  if (!text || !text.includes("{{")) return text;

  const engine = new ExpressionEngine();
  const expressionRegex = /{{\s*(.*?)\s*}}/gs;

  const matches = Array.from(text.matchAll(expressionRegex));
  if (matches.length === 0) return text;

  // 2. 创建所有表达式执行的 Promise
  const promises = matches.map(async (match) => {
    const content = match[1];
    try {
      const result = await engine.execute(content, context);
      return {
        placeholder: match[0], // a.k.a. "{{...}}"
        value: _valueToString(result),
      };
    } catch (e) {
      console.error(e);
      return {
        placeholder: match[0],
        value: `[Execution Error in "${content.trim()}": ${
          e instanceof Error
            ? e.message.split(": ").slice(1).join(": ")
            : String(e)
        }]`,
      };
    }
  });

  // 3. 并发执行所有 Promise
  const results = await Promise.all(promises);

  // 4. 一次性替换所有结果
  let resultText = text;
  for (const result of results) {
    // 使用 replace 一次只替换一个，避免 A 替换成 B，B 又被替换的问题
    resultText = resultText.replace(result.placeholder, result.value);
  }

  return resultText;
}

/**
 * 扩展的表达式应用函数，支持两种语法：
 * 1. {{...}}: 将表达式结果转换为字符串并替换占位符。
 * 2. [[...]]: 如果表达式结果是数组，则用其元素“分裂”字符串；否则，直接插入结果。
 *
 * @param text - 包含 {{...}} 和/或 [[...]] 表达式的输入字符串。
 * @param context - 包含所有可用数据的上下文对象。
 * @returns {Promise<any[]>} 一个 Promise，解析为一个混合类型的数组。
 *                          如果文本中不包含 [[...]]，将返回一个只包含一个字符串元素的数组。
 *
 * @example
 * const text = "用户列表：[[ users.map(u => u.name) ]]，报告生成于{{ new Date().toLocaleDateString() }}";
 * const context = { users: [{name: 'Alice'}, {name: 'Bob'}] };
 * const result = await applyExpressionsWithSplitting(text, context);
 * // 假设今天日期是 '2023/10/27'
 * // result 将是: ['用户列表：', 'Alice', 'Bob', '，报告生成于2023/10/27']
 */
export async function applyExpressionsWithSplitting(
  text: string,
  context: any
): Promise<any[]> {
  // -----------------------------------------------------------------
  // 阶段一: 解析并替换所有常规的 {{...}} 表达式
  // 我们复用现有的 applyExpressions 函数来完成这个任务。
  // -----------------------------------------------------------------
  const intermediateText = await applyExpressions(text, context);

  // 如果处理完 {{...}} 后，字符串中没有 [[...]]，说明不需要分裂。
  // 我们直接返回一个包含最终字符串的数组，以保证返回类型一致。
  if (!intermediateText.includes("[[")) {
    return [intermediateText];
  }

  // -----------------------------------------------------------------
  // 阶段二: 处理 [[...]] 表达式并进行分裂
  // -----------------------------------------------------------------
  const engine = new ExpressionEngine();
  const splitRegex = /\[\[\s*(.*?)\s*\]\]/gs;

  // 1. 获取所有 [[...]] 之间的静态文本部分。
  // e.g., "abc[[...]]def[[...]]ij" -> ['abc', 'def', 'ij']
  const staticParts = intermediateText.split(/\[\[\s*.*?\s*\]\]/g);

  // 2. 提取所有 [[...]] 中的表达式内容。
  const matches = Array.from(intermediateText.matchAll(splitRegex));
  if (matches.length === 0) {
    return [intermediateText];
  }

  // 3. 并发执行所有 [[...]] 中的表达式。
  const expressionPromises = matches.map((match) => {
    const content = match[1]; // 括号里的表达式
    return engine.execute(content, context).catch((e) => {
      console.error(e);
      // 如果执行失败，返回一个清晰的错误信息，而不是让整个过程崩溃。
      return `[Execution Error in "[[${content.trim()}]]"]`;
    });
  });

  const expressionResults = await Promise.all(expressionPromises);

  // 4. 组装最终的混合数组。
  const finalResult: any[] = [];

  // 使用一个循环，交替地插入静态文本和表达式结果。
  for (let i = 0; i < expressionResults.length; i++) {
    // 插入当前表达式之前的静态文本部分（如果非空）。
    if (staticParts[i] !== "") {
      finalResult.push(staticParts[i]);
    }

    const value = expressionResults[i];

    // 这是核心逻辑：如果结果是数组，则将其元素展开并推入。
    if (Array.isArray(value)) {
      finalResult.push(...value);
    } else {
      // 如果结果不是数组，则直接推入该值，保持其原始类型。
      finalResult.push(value);
    }
  }

  // 别忘了处理最后一个静态文本部分（在所有占位符之后）。
  const lastStaticPart = staticParts[staticParts.length - 1];
  if (lastStaticPart !== "") {
    finalResult.push(lastStaticPart);
  }

  return finalResult;
}

// 在 executeCode 函数之前添加这个常量
const BUILT_IN_ENVS: Record<string, Context> = {
  basic: BasicEnv,
};

/**
 * 易用的表达式执行函数。
 *
 * 此函数作为 ExpressionEngine 的一个便捷封装，提供了一个简单直接的接口来执行单行 JavaScript 表达式或多行函数体代码。
 * 它会自动处理代码的解包（例如，移除 "{{...}}" 包装器）和执行过程，并返回一个 Promise，该 Promise 将解析为代码的最终执行结果。
 *
 * @async
 * @param {string} code - 需要被执行的 JavaScript 代码字符串。
 *   - 如果代码是简单的表达式 (e.g., "1 + 1", "user.name")，它将被直接求值。
 *   - 如果代码被 `{{...}}` 包裹，它将被自动解开并执行其中的内容。
 *   - 如果代码包含 `return` 关键字或控制流语句 (if, for, etc.)，它将被视为一个完整的异步函数体来执行。
 * @param {Context} [env={}] - (可选) 一个环境变量对象，其键值对将在执行环境中作为可用变量。
 *   - 键（key）将成为代码中可直接访问的变量名。
 *   - 值（value）是这些变量的实际值。
 *   - 此对象中的变量会覆盖内置环境中的同名变量。
 * @param {object} [options] - (可选) 执行选项。
 * @param {string[]} [options.builtInEnv=["basic"]] - 要加载的内置环境名称数组。
 *   - 默认为 `["basic"]`，它提供了如 `now`, `formatDate`, `pick`, `roll` 等通用函数。
 *   - 设置为空数组 `[]` 可以禁用所有内置环境。
 * @returns {Promise<any>} 一个解析为代码执行结果的 Promise。
 *   - 如果执行成功，Promise 将解析为表达式的返回值。
 *   - 如果执行过程中发生任何错误（例如，语法错误或运行时异常），Promise 将被拒绝（reject），并带有一个描述性错误。
 *
 * @example
 * // 示例 1: 执行一个简单的数学表达式 (使用默认的 'basic' 环境)
 * executeCode("1 + 1").then(result => console.log(result));
 * // 输出: 2
 *
 * @example
 * // 示例 2: 使用 'basic' 环境中的 formatDate 函数
 * executeCode("formatDate('YYYY-MM-DD', now)").then(result => console.log(result));
 * // 输出: (当前日期，例如 "2025-10-21")
 *
 * @example
 * // 示例 3: 提供自定义环境，并覆盖内置变量
 * const context = { user: { name: "Alice" }, roll: () => "Not rolling!" };
 * executeCode("roll('1d6')", context).then(result => console.log(result));
 * // 输出: "Not rolling!" (自定义的 roll 函数覆盖了 'basic' 环境中的 roll)
 *
 * @example
 * // 示例 4: 禁用内置环境
 * executeCode("formatDate('YYYY')", {}, { builtInEnv: [] })
 *   .catch(error => console.error(error.message));
 * // 输出: "Execution Error in "formatDate('YYYY')": formatDate is not defined"
 */
export async function executeCode(
  code: string,
  env: Context = {},
  options: { builtInEnv?: string[] } = { builtInEnv: ["basic"] }
): Promise<any> {
  const engine = new ExpressionEngine();
  const unwrappedCode = unwrapExpression(code);

  // 1. 根据 options.builtInEnv 创建基础上下文
  const builtInContext: Context = {};
  // 如果 options.builtInEnv 未定义或为 null，则默认为 ["basic"]
  const envNames = options.builtInEnv ?? ["basic"];

  for (const name of envNames) {
    if (BUILT_IN_ENVS[name]) {
      Object.assign(builtInContext, BUILT_IN_ENVS[name]);
    }
  }

  // 2. 将用户提供的 env 合并到基础上下文中，env 中的变量优先级更高
  const finalEnv = Object.assign({}, builtInContext, env);

  // 3. 使用最终合并的环境来执行代码
  return engine.execute(unwrappedCode, finalEnv);
}
