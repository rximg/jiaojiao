/**
 * AI 能力统一层：供应商无关的请求/响应类型
 */

export type Provider = 'dashscope' | 'zhipu';

// ---------------------------------------------------------------------------
// LLM（由 LangChain Chat 模型封装，此处仅作配置/能力标识）
// ---------------------------------------------------------------------------

export interface LLMOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// VL 视觉理解（绘本台词）
// ---------------------------------------------------------------------------

export interface GenerateScriptFromImageParams {
  imagePath: string;
  sessionId?: string;
  /** 用户补充或修改要求，与系统提示词一起组成 VL 的完整提示词 */
  userPrompt?: string;
}

export interface ScriptLine {
  text: string;
  x: number;
  y: number;
}

export interface GenerateScriptFromImageResult {
  lines: ScriptLine[];
  scriptPath?: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

export interface SynthesizeSpeechParams {
  texts?: string[];
  /** 台词文件路径（相对 session），确认后写入，TTS 优先从此文件读取以保证使用用户确认的台词 */
  scriptFile?: string;
  voice?: string;
  format?: string;
  sessionId?: string;
}

export interface SynthesizeSpeechResult {
  audioPaths: string[];
  audioUris: string[];
  numbers: number[];
  sessionId: string;
}

// ---------------------------------------------------------------------------
// T2I
// ---------------------------------------------------------------------------

export interface GenerateImageParams {
  prompt?: string;
  promptFile?: string;
  size?: string;
  style?: string;
  count?: number;
  model?: string;
  sessionId?: string;
}

export interface GenerateImageResult {
  imagePath: string;
  imageUri: string;
  imageUrl?: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// 各能力配置（由 getAIConfig 返回）
// ---------------------------------------------------------------------------

export type AIAbility = 'llm' | 'vl' | 'tts' | 't2i';

export interface AIConfigBase {
  provider: Provider;
  apiKey: string;
}

export interface LLMAIConfig extends AIConfigBase {
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface VLAIConfig extends AIConfigBase {
  baseUrl: string;
  model: string;
  prompt: string;
}

export interface TTSAIConfig extends AIConfigBase {
  endpoint: string;
  model: string;
  rateLimitMs: number;
}

export interface T2IAIConfig extends AIConfigBase {
  endpoint: string;
  taskEndpoint: string;
  model: string;
}

export type AIConfig = LLMAIConfig | VLAIConfig | TTSAIConfig | T2IAIConfig;

// ---------------------------------------------------------------------------
// ai_models.json：第一层级为 provider，下列各能力的默认模型与列表
// ---------------------------------------------------------------------------

export interface AiModelEntry {
  id: string;
  label?: string;
}

/** 某 provider 下某能力的配置：default 模型 id + 可选模型列表 */
export interface ProviderAbilityModelsConfig {
  default: string;
  models: AiModelEntry[];
}

/** 某 provider 下各能力的模型配置 */
export type ProviderAbilityMap = {
  [K in AIAbility]: ProviderAbilityModelsConfig;
};

/** ai_models.json 根结构：第一层级为 provider */
export type AiModelsSchema = {
  [P in Provider]?: ProviderAbilityMap;
};
