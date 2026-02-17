/**
 * 推理上下文类型（领域层定义，与 ai/types 对齐）
 */
import type { PromptInput, TextsInput } from './value-objects/prompt-input.js';

export interface ScriptLine {
  text: string;
  x: number;
  y: number;
}

/** 产物文件系统路径 */
export type ArtifactFilePath = string;
/** 产物 file:// URI */
export type ArtifactFileUri = string;
/** 远程 URL（如 provider 返回的图片地址） */
export type RemoteUrl = string;

export interface GenerateImageParams {
  /** 提示词：统一为 PromptInput，直接内容或从文件加载 */
  prompt: PromptInput;
  size?: string;
  style?: string;
  count?: number;
  model?: string;
  sessionId?: string;
}

export interface GenerateImageResult {
  imagePath: ArtifactFilePath;
  imageUri: ArtifactFileUri;
  imageUrl?: RemoteUrl;
  sessionId: string;
}

export interface SynthesizeSpeechParams {
  /** 内容：统一为 TextsInput，直接数组或从文件加载 */
  content: TextsInput;
  voice?: string;
  format?: string;
  sessionId?: string;
}

export interface SynthesizeSpeechResult {
  audioPaths: ArtifactFilePath[];
  audioUris: ArtifactFileUri[];
  numbers: number[];
  sessionId: string;
}

export interface GenerateScriptFromImageParams {
  imagePath: ArtifactFilePath;
  sessionId?: string;
  userPrompt?: string;
}

export interface GenerateScriptFromImageResult {
  lines: ScriptLine[];
  scriptPath?: ArtifactFilePath;
  sessionId: string;
}
