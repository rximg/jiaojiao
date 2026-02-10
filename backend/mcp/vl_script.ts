/**
 * VL 脚本 MCP：委托给 ai/vl 统一层，provider 由 getAIConfig('vl') 决定
 */
export {
  generateScriptFromImage,
  type GenerateScriptFromImageParams,
  type GenerateScriptFromImageResult,
  type ScriptLine,
} from '../ai/vl/index.js';
