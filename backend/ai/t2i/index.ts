/**
 * T2I 统一入口：解析 prompt、按 provider 提交与轮询、下载保存
 */
import path from 'path';
import { getAIConfig } from '../config.js';
import { getWorkspaceFilesystem } from '../../services/fs.js';
import { traceAiRun } from '../../agent/langsmith-trace.js';
import { normalizePromptInput, resolvePromptInput } from '../utils/content-input.js';
import type {
  GenerateImageParams,
  GenerateImageResult,
  T2IAIConfig,
} from '../types.js';
import { submitTaskDashScope, pollForImageUrlDashScope } from './dashscope.js';
import { submitTaskZhipu, pollForImageUrlZhipu } from './zhipu.js';

const DEFAULT_SESSION_ID = 'default';

async function resolvePrompt(
  params: GenerateImageParams,
  sessionId: string
): Promise<string> {
  const promptInput = normalizePromptInput({
    prompt: params.prompt,
    promptFile: params.promptFile,
  });
  if (!promptInput) throw new Error('Either prompt or promptFile must be provided');
  const workspaceFs = getWorkspaceFilesystem({});
  return resolvePromptInput(promptInput, sessionId, workspaceFs);
}

export type { GenerateImageParams, GenerateImageResult };

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const { size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;
  const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
  const inputs = {
    prompt: params.prompt,
    promptFile: params.promptFile,
    size,
    style,
    count,
    sessionId,
    provider: cfg.provider,
    model: cfg.model,
    url: cfg.endpoint,
  };

  return traceAiRun(
    'ai.t2i',
    'tool',
    inputs,
    async () => generateImageImpl(params),
    (result) => ({
      imagePath: result.imagePath,
      imageUri: result.imageUri,
      imageUrl: result.imageUrl,
      sessionId: result.sessionId,
      _note: 'blob not recorded; path/uri only',
    })
  );
}

async function generateImageImpl(params: GenerateImageParams): Promise<GenerateImageResult> {
  const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
  const { size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;

  if (!cfg.apiKey) throw new Error('T2I API key not configured');

  const workspaceFs = getWorkspaceFilesystem({});
  const prompt = await resolvePrompt(params, sessionId);

  const negativePrompt = [cfg.negativePrompt, style].filter(Boolean).join(', ') || undefined;

  let imageUrl: string;
  if (cfg.provider === 'zhipu') {
    const taskId = await submitTaskZhipu(cfg, prompt, {
      size: size.replace(/\*/g, 'x'),
      quality: 'hd',
      negative_prompt: negativePrompt,
    });
    imageUrl = await pollForImageUrlZhipu(cfg, taskId);
  } else {
    const parameters: Record<string, unknown> = {
      size,
      max_images: count,
      enable_interleave: true,
    };
    if (negativePrompt) parameters.negative_prompt = negativePrompt;
    const taskId = await submitTaskDashScope(cfg, prompt, parameters);
    imageUrl = await pollForImageUrlDashScope(cfg, taskId);
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`T2I image download failed: ${imageRes.status} ${imageRes.statusText}`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const imageFileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
  const imagePath = await workspaceFs.writeFile(
    sessionId,
    path.posix.join('images', imageFileName),
    buffer
  );

  return {
    imagePath,
    imageUri: workspaceFs.toFileUri(imagePath),
    imageUrl,
    sessionId,
  };
}
