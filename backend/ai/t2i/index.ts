/**
 * T2I 统一入口：解析 prompt、按 provider 提交与轮询、下载保存
 */
import path from 'path';
import { promises as fs } from 'fs';
import { getAIConfig } from '../config.js';
import { getWorkspaceFilesystem } from '../../services/fs.js';
import type {
  GenerateImageParams,
  GenerateImageResult,
  T2IAIConfig,
} from '../types.js';
import { submitTaskDashScope, pollForImageUrlDashScope } from './dashscope.js';
import { submitTaskZhipu, pollForImageUrlZhipu } from './zhipu.js';

const DEFAULT_SESSION_ID = 'default';

function toSafePromptRelative(promptFile: string): string {
  const normalized = promptFile.replace(/\\/g, '/').replace(/^\/+/, '');
  if (path.isAbsolute(promptFile) || normalized.includes('..')) {
    return path.basename(promptFile);
  }
  return normalized || path.basename(promptFile);
}

async function resolvePrompt(
  params: GenerateImageParams,
  sessionId: string,
  outputPath: string
): Promise<string> {
  if (params.prompt) return params.prompt;
  if (!params.promptFile) throw new Error('Either prompt or promptFile must be provided');
  const workspaceFs = getWorkspaceFilesystem({ outputPath });
  const safeRelative = toSafePromptRelative(params.promptFile);
  const fullPath = workspaceFs.sessionPath(sessionId, safeRelative);
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    throw new Error(
      `Prompt file not found at: ${fullPath}\n` +
        `Please ensure prompt_generator subagent has saved the file to workspaces/${sessionId}/${params.promptFile}`
    );
  }
}

export type { GenerateImageParams, GenerateImageResult };

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const { loadConfig } = await import('../../app-config.js');
  const appConfig = await loadConfig();
  const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
  const { size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;

  if (!cfg.apiKey) throw new Error('T2I API key not configured');

  const workspaceFs = getWorkspaceFilesystem({ outputPath: appConfig.storage.outputPath });
  const prompt = await resolvePrompt(params, sessionId, appConfig.storage.outputPath);

  let imageUrl: string;
  if (cfg.provider === 'zhipu') {
    const taskId = await submitTaskZhipu(cfg, prompt, {
      size: size.replace(/\*/g, 'x'),
      quality: 'hd',
    });
    imageUrl = await pollForImageUrlZhipu(cfg, taskId);
  } else {
    const parameters: Record<string, unknown> = {
      size,
      max_images: count,
      enable_interleave: true,
    };
    if (style) parameters.negative_prompt = style;
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
