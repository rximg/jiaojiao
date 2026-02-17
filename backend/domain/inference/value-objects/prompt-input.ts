/**
 * 可解析为字符串的输入：直接使用 或 从 session 内文件加载
 */
export type PromptInput = string | { fromFile: string };

/**
 * 可解析为 string[] 的输入：直接数组 或 从 session 内文件加载
 */
export type TextsInput = string[] | { fromFile: string };
