/**
 * 推理上下文类型（领域层定义，与 ai/types 对齐）
 */
import type { PromptInput } from './value-objects/prompt-input.js';

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
  /** 负面提示词（由 tools 从 config/tools/t2i.yaml 传入） */
  negativePrompt?: string;
}

export interface GenerateImageResult {
  imagePath: ArtifactFilePath;
  imageUri: ArtifactFileUri;
  imageUrl?: RemoteUrl;
  sessionId: string;
}

/** 单条 TTS 条目（由 tools 规划好 relativePath、可选 number 后传入端口） */
export interface SynthesizeSpeechItem {
  text: string;
  relativePath: string;
  /** 可选行号（tools 用 readLineNumbers 分配，端口原样返回供 appendEntries） */
  number?: number;
}

export interface SynthesizeSpeechParams {
  /** 已规划好的条目（tools 负责 readLineNumbers、规划路径后传入） */
  items: SynthesizeSpeechItem[];
  voice?: string;
  format?: string;
  sessionId?: string;
  /** 条间延迟（毫秒），由 tools 从 config/tools/tts.yaml 传入，属业务配置 */
  rateLimitMs?: number;
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
  /** 用户补充或修改要求（与系统 prompt 一起组成 VL 的完整提示词） */
  userPrompt?: string;
  /** 系统提示词（由 tools 从 config/tools/vl_script.yaml 读取后传入） */
  prompt?: string;
}

export interface GenerateScriptFromImageResult {
  lines: ScriptLine[];
  scriptPath?: ArtifactFilePath;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// 各能力配置（由 getAIConfig 返回，构建 adapter 时使用）
// ---------------------------------------------------------------------------

export type Provider = 'dashscope' | 'zhipu';

export type AIAbility = 'llm' | 'vl' | 'tts' | 't2i';

export interface AIConfigBase {
  provider: Provider;
  apiKey: string;
}

/** 同步：仅 endpoint */
export interface LLMAIConfig extends AIConfigBase {
  /** 同步接口。base URL（如 chat/completions 前缀） */
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/** 同步：仅 endpoint */
export interface VLAIConfig extends AIConfigBase {
  /** 同步接口。base URL */
  endpoint: string;
  model: string;
  prompt: string;
}

/** 同步仅 endpoint；异步（如通义）需 endpoint + taskEndpoint */
export interface TTSAIConfig extends AIConfigBase {
  /** 同步：请求即返回；异步：提交任务 */
  endpoint: string;
  /** 异步时必填：轮询任务结果 */
  taskEndpoint?: string;
  model: string;
}

/** 异步：endpoint（提交）+ taskEndpoint（轮询） */
export interface T2IAIConfig extends AIConfigBase {
  endpoint: string;
  taskEndpoint: string;
  model: string;
  negativePrompt?: string;
}

export type AIConfig = LLMAIConfig | VLAIConfig | TTSAIConfig | T2IAIConfig;

// ---------------------------------------------------------------------------
// ai_models.json：第一层级为 provider
// ---------------------------------------------------------------------------

export interface AiModelEntry {
  id: string;
  label?: string;
}

export interface ProviderAbilityModelsConfig {
  default: string;
  models: AiModelEntry[];
}

export type ProviderAbilityMap = {
  [K in AIAbility]: ProviderAbilityModelsConfig;
};

export type AiModelsSchema = {
  [P in Provider]?: ProviderAbilityMap;
};
