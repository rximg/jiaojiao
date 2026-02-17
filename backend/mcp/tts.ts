/**
 * TTS MCP：委托给 MultimodalPort，不再直接调用 ai/*
 */
import { getMultimodalPort } from '../infrastructure/repositories.js';
import { normalizeTextsInput } from '../ai/utils/content-input.js';
import type { SynthesizeSpeechParams, SynthesizeSpeechResult } from '#backend/domain/inference/types.js';

export type { SynthesizeSpeechParams, SynthesizeSpeechResult };

export async function synthesizeSpeech(params: {
  content?: SynthesizeSpeechParams['content'];
  texts?: string[];
  scriptFile?: string;
  voice?: string;
  format?: string;
  sessionId?: string;
}): Promise<SynthesizeSpeechResult> {
  const contentInput = normalizeTextsInput({
    content: params.content,
    texts: params.texts,
    scriptFile: params.scriptFile,
  });
  if (!contentInput) throw new Error('synthesize_speech 需要 texts、scriptFile 或 content 参数');
  const port = getMultimodalPort();
  return port.synthesizeSpeech({ ...params, content: contentInput } as SynthesizeSpeechParams);
}
