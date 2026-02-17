/**
 * 统一内容输入解析：PromptInput / TextsInput
 * 供 Tools 复用「直接使用 vs 从文件加载」的分支逻辑
 */
import path from 'path';
import type { PromptInput, TextsInput } from '#backend/domain/inference/value-objects/prompt-input.js';

export type { PromptInput, TextsInput };

export interface WorkspaceFsLike {
  sessionPath(sessionId: string, relativePath: string): string;
}

function toSafeRelativePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (path.isAbsolute(filePath) || normalized.includes('..')) {
    return path.basename(filePath);
  }
  return normalized || path.basename(filePath);
}

/**
 * 解析 PromptInput 为实际字符串
 */
export async function resolvePromptInput(
  input: PromptInput,
  sessionId: string,
  workspaceFs: WorkspaceFsLike
): Promise<string> {
  if (typeof input === 'string') return input;
  const rel = toSafeRelativePath(input.fromFile);
  const fullPath = workspaceFs.sessionPath(sessionId, rel);
  const { promises: fs } = await import('node:fs');
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    throw new Error(
      `Prompt file not found at: ${fullPath}\n` +
        `Please ensure the file exists in workspaces/${sessionId}/${rel}`
    );
  }
}

/**
 * 解析 TextsInput 为 string[]
 */
export async function resolveTextsInput(
  input: TextsInput,
  sessionId: string,
  workspaceFs: WorkspaceFsLike
): Promise<string[]> {
  if (Array.isArray(input)) return input;
  const rel = toSafeRelativePath(input.fromFile);
  const fullPath = workspaceFs.sessionPath(sessionId, rel);
  const { promises: fs } = await import('node:fs');
  try {
    const raw = await fs.readFile(fullPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    throw new Error(
      `Texts file not found at: ${fullPath}\n` +
        `Please ensure the file exists in workspaces/${sessionId}/${rel}`
    );
  }
}

/**
 * 从旧式参数归一化为 PromptInput
 */
export function normalizePromptInput(params: {
  prompt?: string | { fromFile: string };
  promptFile?: string;
}): PromptInput | null {
  if (params.prompt != null && params.prompt !== '') {
    if (typeof params.prompt === 'string') return params.prompt;
    if (typeof params.prompt === 'object' && params.prompt.fromFile) return params.prompt;
  }
  if (params.promptFile) return { fromFile: params.promptFile };
  return null;
}

/**
 * 从旧式参数归一化为 TextsInput
 */
export function normalizeTextsInput(params: {
  content?: TextsInput;
  texts?: string[];
  scriptFile?: string;
}): TextsInput | null {
  if (params.content != null) return params.content;
  if (params.texts && params.texts.length > 0) return params.texts;
  if (params.scriptFile) return { fromFile: params.scriptFile };
  return null;
}
