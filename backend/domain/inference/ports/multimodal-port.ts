/**
 * 多模态业务端口：应用层（Tools）依赖此端口
 */
import type {
  GenerateImageParams,
  GenerateImageResult,
  SynthesizeSpeechParams,
  SynthesizeSpeechResult,
  GenerateScriptFromImageParams,
  GenerateScriptFromImageResult,
} from '../types.js';

export interface MultimodalPort {
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult>;
  generateScriptFromImage(params: GenerateScriptFromImageParams): Promise<GenerateScriptFromImageResult>;
}
