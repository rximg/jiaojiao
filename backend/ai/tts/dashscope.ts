/**
 * 通义 TTS：请求返回音频 URL → 下载写入 workspace，支持 429/503 重试
 */
import type { TTSAIConfig } from '../types.js';

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

export interface DoOneTtsOptions {
  cfg: TTSAIConfig;
  text: string;
  voice: string;
  format: string;
  sessionId: string;
  relativePath: string;
  workspaceFs: { writeFile: (sid: string, rel: string, data: Buffer) => Promise<string>; toFileUri: (p: string) => string };
  backoffBaseMs: number;
  maxRetries: number;
}

export interface DoOneTtsResult {
  audioPath: string;
  audioUri: string;
}

export async function doOneTtsDashScope(options: DoOneTtsOptions): Promise<DoOneTtsResult> {
  const { cfg, text, voice, format, sessionId, relativePath, workspaceFs, backoffBaseMs, maxRetries } = options;
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
        input: { text, voice: voiceApi },
        parameters: { format, sample_rate: 44100 },
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
    const data = (await response.json()) as { output?: { audio?: { url?: string } }; audio?: { url?: string }; url?: string };
    const audioUrl = data?.output?.audio?.url || data?.audio?.url || data?.url;
    if (!audioUrl) throw new Error('TTS API did not return audio URL');
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      const body = await audioResponse.text().catch(() => '');
      throw new Error(`TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText} ${body}`);
    }
    const buffer = Buffer.from(await audioResponse.arrayBuffer());
    const audioPath = await workspaceFs.writeFile(sessionId, relativePath, buffer);
    return { audioPath, audioUri: workspaceFs.toFileUri(audioPath) };
  }
  throw lastError ?? new Error('TTS rate limit retries exhausted');
}
