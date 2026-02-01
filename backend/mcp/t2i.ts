import path from 'path';
import { promises as fs } from 'fs';
import jsyaml from 'js-yaml';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

// ---------------------------------------------------------------------------
// 模型配置：所有模型统一为「提交 endpoint → 轮询 result_endpoint」，无 SSE
// ---------------------------------------------------------------------------

export interface T2IModelConfig {
  model_name: string;
  endpoint: string;
  result_endpoint: string;
  provider: string;
}

const T2I_MODELS: T2IModelConfig[] = [
  {
    model_name: 'wan2.6-t2i',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation',
    result_endpoint: 'https://dashscope.aliyuncs.com/api/v1/tasks',
    provider: 'dashscope',
  },
];

function getModelConfig(modelName: string): T2IModelConfig | null {
  return T2I_MODELS.find((m) => m.model_name === modelName) ?? null;
}

// ---------------------------------------------------------------------------
// 入参 / 出参
// ---------------------------------------------------------------------------

export interface GenerateImageParams {
  prompt?: string;
  promptFile?: string;
  size?: string;
  style?: string;
  count?: number;
  model?: string;
  sessionId?: string;
}

export interface GenerateImageResult {
  imagePath: string;
  imageUri: string;
  imageUrl?: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Task 1：提交任务（POST endpoint）
// ---------------------------------------------------------------------------

async function submitTask(
  endpoint: string,
  token: string,
  model: string,
  prompt: string,
  parameters: Record<string, unknown>
): Promise<string> {
  const body = {
    model,
    input: {
      messages: [{ role: 'user' as const, content: [{ text: prompt }] }],
    },
    parameters,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`T2I submit failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as { output?: { task_id?: string } };
  const taskId = data?.output?.task_id;
  if (!taskId) throw new Error('T2I submit did not return task_id');
  return taskId;
}

// ---------------------------------------------------------------------------
// Task 2：轮询结果（GET result_endpoint/taskId）
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 60;

async function pollForImageUrl(
  resultEndpoint: string,
  taskId: string,
  token: string
): Promise<string> {
  const url = resultEndpoint.replace(/\/$/, '') + '/' + taskId;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`T2I poll failed: ${res.status}`);

    const taskData = (await res.json()) as {
      output?: { task_status?: string; message?: string; choices?: Array<{ message?: { content?: Array<{ type?: string; image?: string }> } }> };
    };
    const status = taskData?.output?.task_status;

    console.log(`[T2I] task status (${attempt}/${MAX_ATTEMPTS}): ${status}`);

    if (status === 'FAILED') {
      const msg = taskData?.output?.message ?? 'Unknown error';
      throw new Error(`T2I task failed: ${msg}`);
    }

    if (status === 'SUCCEEDED') {
      const content = taskData?.output?.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item?.type === 'image' && item?.image) return item.image;
        }
      }
      console.error('[T2I] response:', JSON.stringify(taskData, null, 2));
      throw new Error('T2I task succeeded but no image URL in response');
    }
  }

  throw new Error(`T2I task timeout after ${MAX_ATTEMPTS} attempts`);
}

// ---------------------------------------------------------------------------
// 主入口：解析配置 → 提交任务 → 轮询结果 → 下载保存
// ---------------------------------------------------------------------------

async function resolvePrompt(
  params: GenerateImageParams,
  sessionId: string,
  outputPath: string
): Promise<string> {
  if (params.prompt) return params.prompt;
  if (!params.promptFile) throw new Error('Either prompt or promptFile must be provided');

  const workspaceRoot = path.join(outputPath, 'workspaces', sessionId);
  const fullPath = path.join(workspaceRoot, params.promptFile);
  const content = await fs.readFile(fullPath, 'utf-8');
  console.log(`[T2I] prompt from file: ${params.promptFile}, length: ${content.length}`);
  return content;
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const appConfig = await loadConfig();
  const { size = '1024*1024', style, count = 1, sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: appConfig.storage.outputPath });

  if (!params.model) {
    throw new Error('未传入 model，请指定 params.model');
  }
  const modelName = params.model;

  let t2iYaml: Record<string, unknown> = {};
  try {
    const yamlPath = path.join(process.cwd(), 'backend', 'config', 'mcp', 't2i_config.yaml');
    t2iYaml = (jsyaml.load(await fs.readFile(yamlPath, 'utf-8')) as Record<string, unknown>) ?? {};
  } catch {
    // ignore
  }
  const service = t2iYaml.service as Record<string, unknown> | undefined;
  const modelConfig = getModelConfig(modelName);
  if (!modelConfig) {
    throw new Error(`不支持的模型: ${modelName}。支持的模型: ${T2I_MODELS.map((m) => m.model_name).join(', ')}`);
  }

  const endpoint =
    (process.env.DASHSCOPE_T2I_ENDPOINT as string) ||
    (service?.endpoint as string | undefined) ||
    modelConfig.endpoint;
  const resultEndpoint =
    (process.env.DASHSCOPE_T2I_RESULT_ENDPOINT as string) ||
    (service?.task_endpoint as string | undefined) ||
    modelConfig.result_endpoint;
  const token = appConfig.apiKeys.t2i || appConfig.apiKeys.dashscope || '';
  if (!token) throw new Error('T2I API key not configured (t2i or dashscope)');

  const prompt = await resolvePrompt(params, sessionId, appConfig.storage.outputPath);

  const parameters: Record<string, unknown> = {
    size,
    max_images: count,
    enable_interleave: true,
  };
  if (style) parameters.negative_prompt = style;

  console.log('[T2I] submit:', endpoint, 'model:', modelName, 'prompt length:', prompt.length);

  const taskId = await submitTask(endpoint, token, modelName, prompt, parameters);
  const imageUrl = await pollForImageUrl(resultEndpoint, taskId, token);

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`T2I image download failed: ${imageRes.status} ${imageRes.statusText}`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const imageFileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
  const imagePath = await workspaceFs.writeFile(sessionId, path.posix.join('images', imageFileName), buffer);

  return {
    imagePath,
    imageUri: workspaceFs.toFileUri(imagePath),
    imageUrl,
    sessionId,
  };
}
