// // src/lib/ImportConverter/CharacterPngConverter.ts
// // sillyTavernpngConverter.ts

// // 从 node_modules 导入必要的库
// import { decode as decodeTextChunk } from "png-chunk-text";
// import extractChunks, { Chunk } from "png-chunks-extract";
// import encodeChunks from "png-chunks-encode";
// import { v4 as uuidv4 } from "uuid";
// import * as fs from "fs/promises"; // 导入 fs/promises 用于测试

// // --- 类型定义 ---
// // 导入源格式类型
// import type { SillyTavernCharacterCardV3, CharacterCardV3Data } from "./types";
// // 从项目现有类型中导入目标格式
// import type { Character } from "@/schema/character/character.types";
// import { RegexRule } from "@/schema/shared.types";

// /**
//  * 定义转换函数的返回类型结构。
//  */
// export interface ConversionResult {
//   /** 转换后的角色数据对象 */
//   character: Character;
//   /** 移除了所有 tEXt 块的纯净图片二进制数据 */
//   imageBuffer: Buffer;
// }

// /**
//  * 从 PNG 文件 Buffer 中提取角色卡数据，并分离出非文本数据块。
//  *
//  * @param pngBuffer 包含 PNG 文件内容的 Buffer。
//  * @returns 一个包含解析后的角色卡和纯净数据块列表的对象。
//  * @throws 如果找不到 'chara' 数据块或数据无法解析，则抛出错误。
//  */
// function extractDataAndCleanChunks(pngBuffer: Buffer): {
//   sillyTavernCard: SillyTavernCharacterCardV3;
//   cleanChunks: Chunk[];
// } {
//   const chunks = extractChunks(pngBuffer);
//   const textChunks = chunks.filter((chunk) => chunk.name === "tEXt");
//   const cleanChunks = chunks.filter((chunk) => chunk.name !== "tEXt");

//   let base64Data: string | null = null;
//   for (const chunk of textChunks) {
//     const decodedChunk = decodeTextChunk(chunk.data);
//     if (decodedChunk.keyword === "chara") {
//       base64Data = decodedChunk.text;
//       break;
//     }
//   }

//   if (!base64Data) {
//     throw new Error(
//       "PNG file does not contain a valid SillyTavern 'chara' data chunk.",
//     );
//   }

//   try {
//     const jsonData = Buffer.from(base64Data, "base64").toString("utf-8");
//     const parsedData = JSON.parse(jsonData);

//     if (!parsedData.spec || !parsedData.data) {
//       throw new Error(
//         "Parsed JSON does not appear to be a valid character card format.",
//       );
//     }

//     return {
//       sillyTavernCard: parsedData as SillyTavernCharacterCardV3,
//       cleanChunks: cleanChunks,
//     };
//   } catch (error) {
//     console.error("Failed to decode or parse character JSON:", error);
//     throw new Error("Failed to process character data from PNG.");
//   }
// }

// /**
//  * 将 SillyTavern 角色卡对象映射到目标 Character 格式。
//  *
//  * @param stCard 从 PNG 中解析出的 SillyTavern 角色卡对象。
//  * @returns 转换后的 Character 对象。
//  */
// function mapSillyTavernToCharacter(
//   stCard: SillyTavernCharacterCardV3,
// ): Character {
//   const data: CharacterCardV3Data = stCard.data;

//   // 转换正则表达式规则
//   const regexRules: RegexRule[] = (data.extensions?.regex_scripts || []).map(
//     (script) => ({
//       id: script.id || uuidv4(),
//       name: script.scriptName,
//       enabled: !script.disabled,
//       find_regex: script.findRegex,
//       replace_string: script.replaceString,
//       applyOnSending: script.promptOnly || false,
//       applyOnRendering: false,
//       minDepth: script.minDepth ?? -1,
//       maxDepth: script.maxDepth ?? -1,
//     }),
//   );

//   // 创建并返回目标格式的对象
//   const character: Character = {
//     id: uuidv4(),
//     name: data.name || "",
//     description: data.description || "",
//     creator: data.creator || "Unknown",
//     character_version: data.character_version || "1.0",
//     creator_notes: data.creator_notes || "",
//     creator_notes_multilingual: data.creator_notes_multilingual || {},
//     source: data.source || [],
//     mes_example: data.mes_example || "",
//     system_prompt: data.system_prompt || "",
//     post_history_instructions: data.post_history_instructions || "",
//     personality: data.personality || "",
//     scenario: data.scenario || "",
//     creation_date: data.creation_date || Math.floor(Date.now() / 1000),
//     extensions: data.extensions || {},
//     REGEX: regexRules,
//     tools: [],
//   };

//   // 清理 extensions 中已转换的字段
//   if (character.extensions.regex_scripts) {
//     delete character.extensions.regex_scripts;
//   }

//   return character;
// }

// /**
//  * 主转换函数：接收一个 SillyTavern PNG 角色卡的 Buffer，
//  * 将其转换为目标 Character 格式，并返回不含tEXt块的纯净图片数据。
//  *
//  * @param pngBuffer 包含 PNG 文件内容的 Buffer。
//  * @returns 返回一个包含转换后角色数据和纯净图片Buffer的 Promise。
//  */
// export async function convertSillyTavernCard(
//   pngBuffer: Buffer,
// ): Promise<ConversionResult> {
//   try {
//     const { sillyTavernCard, cleanChunks } =
//       extractDataAndCleanChunks(pngBuffer);
//     const convertedCharacter = mapSillyTavernToCharacter(sillyTavernCard);

//     // 将不含tEXt块的纯净数据块重新编码为PNG Buffer
//     const cleanImageBuffer = Buffer.from(encodeChunks(cleanChunks));

//     return {
//       character: convertedCharacter,
//       imageBuffer: cleanImageBuffer,
//     };
//   } catch (error) {
//     console.error("Fatal error during SillyTavern card conversion:", error);
//     throw error;
//   }
// }

// // --- 临时测试 ---
// // 使用一个立即执行的异步函数来运行测试
// (async function testConversion() {
//   console.log("Running test conversion...");
//   const targetPath = "./test.png"; // 目标文件路径

//   try {
//     // 1. 读取 PNG 文件
//     const imageBuffer = await fs.readFile(targetPath);
//     console.log(`Successfully read '${targetPath}'`);

//     // 2. 调用转换器
//     const { character, imageBuffer: cleanImageBuffer } =
//       await convertSillyTavernCard(imageBuffer);

//     // 3. 打印转换后的角色数据
//     console.log("--- Conversion Successful! ---");
//     console.log("Character Data:");
//     console.log(JSON.stringify(character, null, 2));
//     console.log("------------------------------");

//     // 4. 保存纯净的图片文件
//     const cleanImagePath = "./test_clean.png";
//     await fs.writeFile(cleanImagePath, cleanImageBuffer);
//     console.log(
//       `Successfully saved clean image (without tEXt chunks) to '${cleanImagePath}'`,
//     );
//   } catch (error) {
//     console.error(`Failed to run test conversion for '${targetPath}':`, error);
//   }
// })();
