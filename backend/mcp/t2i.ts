/**
 * T2I MCP：委托给 ai/t2i 统一层，provider 由 getAIConfig('t2i') 决定
 */
export {
  generateImage,
  type GenerateImageParams,
  type GenerateImageResult,
} from '../ai/t2i/index.js';
