/**
 * 通义 TTS 适配器：纯 HTTP，返回音频 URL（调用方负责下载）
 */
import type { TTSAIConfig } from '../../../ai/types.js';

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

/** 调用通义 TTS API，返回音频 URL；支持 429/503 重试 */
export async function fetchTtsAudioUrlDashScope(
  cfg: TTSAIConfig,
  text: string,
  voice: string,
  backoffBaseMs: number,
  maxRetries: number
): Promise<TtsDashScopeResult> {
  const voiceApi = VOICE_MAP[voice] || 'Cherry';
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const waitMs = backoffBaseMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
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
    if (response.status === 429 || response.status === 503) {
      const body = await response.text().catch(() => '');
      lastError = new Error(`TTS API error: ${response.status} ${response.statusText} ${body}`);
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`TTS API error: ${response.status} ${response.statusText} ${body}`);
    }
    const data = (await response.json()) as {
      output?: { audio?: { url?: string } };
      audio?: { url?: string };
      url?: string;
    };
    const audioUrl = data?.output?.audio?.url || data?.audio?.url || data?.url;
    if (!audioUrl) throw new Error('TTS API did not return audio URL');
    return { audioUrl };
  }
  throw lastError ?? new Error('TTS rate limit retries exhausted');
}
