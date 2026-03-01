/**
 * 通义图像编辑（wan2.6-image）适配器：异步提交 + 轮询，最终返回 imageUrl
 * 文档：docs/百炼万象2.6的图片编辑api.md
 */
import type { T2IAIConfig } from '#backend/domain/inference/types.js';
import { SyncInferenceBase } from '../../bases/sync-inference-base.js';
import type { EditImagePortInput } from '../../port-types.js';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 60;

export interface DashScopeEditImageOutput {
  imageUrl: string;
}

interface DashScopeEditImageResponse {
  output?: {
    task_id?: string;
    task_status?: string;
    message?: string;
    choices?: Array<{
      message?: {
        content?: Array<{
          type?: string;
          image?: string;
        }>;
      };
    }>;
  };
  code?: string;
  message?: string;
}

export async function submitEditImageDashScope(
  cfg: T2IAIConfig,
  input: EditImagePortInput
): Promise<string> {
  const content = [
    { text: input.prompt },
    ...input.imageDataUrls.map((dataUrl) => ({ image: dataUrl })),
  ];

  const resolvedModel =
    input.model?.trim() ||
    (cfg.model === 'wan2.6-t2i' ? 'wan2.6-image' : cfg.model);

  const body = {
    model: resolvedModel,
    input: {
      messages: [
        {
          role: 'user' as const,
          content,
        },
      ],
    },
    parameters: {
      prompt_extend: input.parameters.prompt_extend,
      watermark: input.parameters.watermark,
      n: input.parameters.n,
      enable_interleave: input.parameters.enable_interleave,
      size: input.parameters.size,
    },
  };

  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Edit image submit failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as DashScopeEditImageResponse;
  if (data?.code) {
    throw new Error(`Edit image API error: ${data.code} ${data.message ?? ''}`.trim());
  }

  const taskId = data?.output?.task_id;
  if (!taskId) {
    throw new Error('Edit image submit did not return task_id');
  }
  return taskId;
}

export async function pollEditImageDashScope(
  cfg: T2IAIConfig,
  taskId: string
): Promise<DashScopeEditImageOutput> {
  const pollUrl = cfg.taskEndpoint.replace(/\/$/, '') + '/' + taskId;
  const intervalMs = cfg.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = cfg.max_poll_attempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const res = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Edit image poll failed: ${res.status} ${res.statusText} ${text}`);
    }

    const data = (await res.json()) as DashScopeEditImageResponse;
    if (data?.code) {
      throw new Error(`Edit image API error: ${data.code} ${data.message ?? ''}`.trim());
    }

    const status = data?.output?.task_status;
    if (status === 'FAILED') {
      throw new Error(`Edit image task failed: ${data?.output?.message ?? 'Unknown error'}`);
    }

    if (status === 'SUCCEEDED') {
      const imageUrl = data?.output?.choices?.[0]?.message?.content?.find(
        (item) => item?.type === 'image' && !!item.image
      )?.image;
      if (!imageUrl) {
        throw new Error('Edit image task succeeded but no output image URL returned');
      }
      return { imageUrl };
    }
  }

  throw new Error(`Edit image task timeout after ${maxAttempts} attempts`);
}

export async function callEditImageDashScope(
  cfg: T2IAIConfig,
  input: EditImagePortInput
): Promise<DashScopeEditImageOutput> {
  const taskId = await submitEditImageDashScope(cfg, input);
  return pollEditImageDashScope(cfg, taskId);
}

export class EditImageDashScopePort extends SyncInferenceBase<EditImagePortInput, DashScopeEditImageOutput> {
  constructor(private readonly cfg: T2IAIConfig) {
    super();
  }

  protected async _execute(input: EditImagePortInput): Promise<DashScopeEditImageOutput> {
    return callEditImageDashScope(this.cfg, input);
  }
}
