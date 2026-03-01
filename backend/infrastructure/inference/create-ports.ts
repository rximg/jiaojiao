/**
 * 根据配置创建 VL / T2I / TTS 的 SyncInferencePort 或 AsyncInferencePort 实例
 */
import type { SyncInferencePort } from '#backend/domain/inference/index.js';
import type { AsyncInferencePort } from '#backend/domain/inference/index.js';
import type { VLAIConfig, T2IAIConfig, TTSAIConfig } from '#backend/domain/inference/types.js';
import type { VLPortInput, T2IPortInput, EditImagePortInput, TTSPortInput } from './port-types.js';
import { VLDashScopePort } from './adapters/vl/dashscope.js';
import { VLZhipuPort } from './adapters/vl/zhipu.js';
import { T2IDashScopePort } from './adapters/t2i/dashscope.js';
import { T2IZhipuPort } from './adapters/t2i/zhipu.js';
import { EditImageDashScopePort } from './adapters/image-edit/dashscope.js';
import { EditImageZhipuPort } from './adapters/image-edit/zhipu.js';
import { TTSZhipuPort } from './adapters/tts/zhipu.js';
import type { TtsZhipuPcmResult } from './adapters/tts/zhipu.js';
import { TTSDashScopePort } from './adapters/tts/dashscope.js';
import type { TtsDashScopeResult } from './adapters/tts/dashscope.js';

export type VLPort = SyncInferencePort<VLPortInput, string>;
export type T2IPort = AsyncInferencePort<T2IPortInput, string, string>;
export type EditImagePort = SyncInferencePort<EditImagePortInput, { imageUrl: string }>;
/** 同步 TTS：智谱返回 PCM，通义返回 audioUrl */
export type TTSSyncPort = SyncInferencePort<TTSPortInput, TtsZhipuPcmResult | TtsDashScopeResult>;

export function createVLPort(cfg: VLAIConfig): VLPort {
  return cfg.provider === 'zhipu' ? new VLZhipuPort(cfg) : new VLDashScopePort(cfg);
}

export function createT2IPort(cfg: T2IAIConfig): T2IPort {
  return cfg.provider === 'zhipu' ? new T2IZhipuPort(cfg) : new T2IDashScopePort(cfg);
}

export function createEditImagePort(cfg: T2IAIConfig): EditImagePort {
  return cfg.provider === 'zhipu' ? new EditImageZhipuPort(cfg) : new EditImageDashScopePort(cfg);
}

export function createTTSSyncPort(cfg: TTSAIConfig): TTSSyncPort {
  return cfg.provider === 'zhipu' ? new TTSZhipuPort(cfg) : new TTSDashScopePort(cfg);
}
