/**
 * 通义 TTS 适配器：异步接口（endpoint 提交 + taskEndpoint 轮询），返回音频 URL
 */
import type { TTSAIConfig } from '#backend/domain/inference/types.js';
import { AsyncInferenceBase } from '../../bases/async-inference-base.js';
import type { TTSPortInput } from '../../port-types.js';

const VOICE_MAP: Record<string, string> = {
  chinese_female: 'Cherry',
  chinese_male: 'Ethan',
  english_female: 'Serena',
  english_male: 'Chelsie',
  Cherry: 'Cherry',
  Ethan: 'Ethan',
  Serena: 'Serena',
  Chelsie: 'Chelsie',
};

export interface TtsDashScopeResult {
  audioUrl: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

/** 异步提交 TTS 任务，返回 taskId（提交一次，不重试） */
export async function submitTtsTaskDashScope(
  cfg: TTSAIConfig & { taskEndpoint: string },
  text: string,
  voice: string
): Promise<string> {
  const voiceApi = VOICE_MAP[voice] || 'Cherry';
  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: cfg.model,
      input: {
        text,
        voice: voiceApi,
        language_type: 'Chinese',
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`TTS submit error: ${response.status} ${response.statusText} ${body}`);
  }
  const data = (await response.json()) as { output?: { task_id?: string } };
  const taskId = data?.output?.task_id;
  if (!taskId) throw new Error('TTS submit did not return task_id');
  return taskId;
}

/** 轮询 TTS 任务结果，返回音频 URL；支持 429/503 重试 */
export async function pollTtsResultDashScope(
  cfg: TTSAIConfig & { taskEndpoint: string },
  taskId: string
): Promise<TtsDashScopeResult> {
  const url = cfg.taskEndpoint.replace(/\/$/, '') + '/' + taskId;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (res.status === 429 || res.status === 503) {
      lastError = new Error(`TTS poll error: ${res.status}`);
      continue;
    }
    if (!res.ok) throw new Error(`TTS poll failed: ${res.status} ${res.statusText}`);
    const taskData = (await res.json()) as {
      output?: {
        task_status?: string;
        message?: string;
        output?: { audio?: { url?: string } };
        audio?: { url?: string };
      };
    };
    const status = taskData?.output?.task_status;
    if (status === 'FAILED') {
      const msg = taskData?.output?.message ?? 'Unknown error';
      throw new Error(`TTS task failed: ${msg}`);
    }
    if (status === 'SUCCEEDED') {
      const out = taskData?.output;
      const audioUrl =
        out?.output?.audio?.url ?? (out as { audio?: { url?: string } })?.audio?.url;
      if (audioUrl) return { audioUrl };
      throw new Error('TTS task succeeded but no audio URL in response');
    }
  }
  throw lastError ?? new Error(`TTS task timeout after ${MAX_POLL_ATTEMPTS} attempts`);
}

/** 通义 TTS 异步端口适配器（需 cfg.taskEndpoint） */
export class TTSDashScopePort extends AsyncInferenceBase<
  TTSPortInput,
  string,
  TtsDashScopeResult
> {
  constructor(private readonly cfg: TTSAIConfig & { taskEndpoint: string }) {
    super();
  }

  protected async _submit(input: TTSPortInput): Promise<string> {
    return submitTtsTaskDashScope(this.cfg, input.text, input.voice);
  }

  protected async _poll(taskId: string): Promise<TtsDashScopeResult> {
    return pollTtsResultDashScope(this.cfg, taskId);
  }
}
