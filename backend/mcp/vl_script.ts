/**
 * VL 脚本 MCP：委托给 MultimodalPort，不再直接调用 ai/*
 */
import { getMultimodalPort } from '../infrastructure/repositories.js';
import type {
  GenerateScriptFromImageParams,
  GenerateScriptFromImageResult,
  ScriptLine,
} from '#backend/domain/inference/types.js';

export type { GenerateScriptFromImageParams, GenerateScriptFromImageResult, ScriptLine };

export async function generateScriptFromImage(
  params: GenerateScriptFromImageParams
): Promise<GenerateScriptFromImageResult> {
  const port = getMultimodalPort();
  return port.generateScriptFromImage(params);
}
