/**
 * MultimodalPort 实现：委托给现有 ai/* 模块
 */
import { generateImage } from '../../ai/t2i/index.js';
import { synthesizeSpeech } from '../../ai/tts/index.js';
import { generateScriptFromImage } from '../../ai/vl/index.js';
import type {
  MultimodalPort,
  GenerateImageParams,
  GenerateImageResult,
  SynthesizeSpeechParams,
  SynthesizeSpeechResult,
  GenerateScriptFromImageParams,
  GenerateScriptFromImageResult,
} from '#backend/domain/inference/index.js';

export class MultimodalPortImpl implements MultimodalPort {
  async generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    return generateImage(params as Parameters<typeof generateImage>[0]);
  }

  async synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult> {
    return synthesizeSpeech(params as Parameters<typeof synthesizeSpeech>[0]);
  }

  async generateScriptFromImage(
    params: GenerateScriptFromImageParams
  ): Promise<GenerateScriptFromImageResult> {
    return generateScriptFromImage(params as Parameters<typeof generateScriptFromImage>[0]);
  }
}
