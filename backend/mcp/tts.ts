/**
 * TTS MCP：委托给 ai/tts 统一层，provider 由 getAIConfig('tts') 决定
 */
export {
  synthesizeSpeech,
  type SynthesizeSpeechParams,
  type SynthesizeSpeechResult,
} from '../ai/tts/index.js';
