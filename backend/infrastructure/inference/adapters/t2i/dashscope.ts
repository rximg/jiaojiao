/**
 * 通义 T2I 适配器：纯 HTTP，异步提交 + 轮询，返回 imageUrl
 */
import type { T2IAIConfig } from '../../../ai/types.js';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 60;

export async function submitTaskDashScope(
  cfg: T2IAIConfig,
  prompt: string,
  parameters: Record<string, unknown>
): Promise<string> {
  const body = {
    model: cfg.model,
    input: {
      messages: [{ role: 'user' as const, content: [{ text: prompt }] }],
    },
    parameters,
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
    throw new Error(`T2I submit failed: ${res.status} ${res.statusText} ${text}`);
  }
  const data = (await res.json()) as { output?: { task_id?: string } };
  const taskId = data?.output?.task_id;
  if (!taskId) throw new Error('T2I submit did not return task_id');
  return taskId;
}

export async function pollForImageUrlDashScope(
  cfg: T2IAIConfig,
  taskId: string
): Promise<string> {
  const url = cfg.taskEndpoint.replace(/\/$/, '') + '/' + taskId;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) throw new Error(`T2I poll failed: ${res.status}`);
    const taskData = (await res.json()) as {
      output?: {
        task_status?: string;
        message?: string;
        choices?: Array<{ message?: { content?: Array<{ type?: string; image?: string }> } }>;
      };
    };
    const status = taskData?.output?.task_status;
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
      throw new Error('T2I task succeeded but no image URL in response');
    }
  }
  throw new Error(`T2I task timeout after ${MAX_ATTEMPTS} attempts`);
}
