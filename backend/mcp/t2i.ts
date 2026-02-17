/**
 * T2I MCP：委托给 MultimodalPort，不再直接调用 ai/*
 */
import { getMultimodalPort } from '../infrastructure/repositories.js';
import { normalizePromptInput } from '../ai/utils/content-input.js';
import type { GenerateImageParams, GenerateImageResult } from '#backend/domain/inference/types.js';

export type { GenerateImageParams, GenerateImageResult };

export async function generateImage(params: {
  prompt?: string | { fromFile: string };
  promptFile?: string;
  size?: string;
  style?: string;
  count?: number;
  model?: string;
  sessionId?: string;
}): Promise<GenerateImageResult> {
  const promptInput = normalizePromptInput({ prompt: params.prompt, promptFile: params.promptFile });
  if (!promptInput) throw new Error('Either prompt or promptFile must be provided');
  const port = getMultimodalPort();
  const { promptFile: _pf, ...rest } = params;
  return port.generateImage({ ...rest, prompt: promptInput } as GenerateImageParams);
}
