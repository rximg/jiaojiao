import path from 'path';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

export interface SynthesizeSpeechParams {
  texts: string[];
  voice?: string;
  format?: string;
  sessionId?: string;
}

export interface SynthesizeSpeechResult {
  audioPaths: string[];
  audioUris: string[];
  sessionId: string;
}

const voiceMap: Record<string, string> = {
  'chinese_female': 'Cherry',
  'chinese_male': 'Ethan',
  'english_female': 'Serena',
  'english_male': 'Chelsie',
  'Cherry': 'Cherry',
  'Ethan': 'Ethan',
  'Serena': 'Serena',
  'Chelsie': 'Chelsie',
};

/** 全局锁：同一时间只允许一个 synthesizeSpeech 在执行，避免多 session/多次调用并行触发 rate limit */
let ttsMutex: Promise<void> = Promise.resolve();

export async function synthesizeSpeech(
  params: SynthesizeSpeechParams
): Promise<SynthesizeSpeechResult> {
  const previous = ttsMutex;
  let resolveMutex: () => void;
  ttsMutex = new Promise<void>((resolve) => { resolveMutex = resolve; });
  await previous;

  try {
    return await synthesizeSpeechSequential(params);
  } finally {
    resolveMutex!();
  }
}

/** 单次调用的内部实现：对 texts 严格顺序执行，避免 Requests rate limit exceeded */
async function synthesizeSpeechSequential(
  params: SynthesizeSpeechParams
): Promise<SynthesizeSpeechResult> {
  const config = await loadConfig();
  const { texts, voice = 'chinese_female', format = 'mp3', sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });

  const token = config.apiKeys.tts || config.apiKeys.dashscope || '';
  const endpoint = process.env.DASHSCOPE_TTS_ENDPOINT 
    || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const model = process.env.DASHSCOPE_TTS_MODEL || 'qwen-tts';
  const rateLimitMs = Number(process.env.TTS_RATE_LIMIT_MS) || 2000;

  const audioPaths: string[] = [];
  const audioUris: string[] = [];

  // 顺序执行每条 TTS，条与条之间等待 rateLimitMs，避免 rate limit
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitMs));
    }

    try {
      // 映射音色到 API 支持的值
      const voiceApi = voiceMap[voice] || 'Cherry';

      // 调用阿里百炼 TTS API（使用multimodal-generation端点）
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          input: {
            text,
            voice: voiceApi,
          },
          parameters: {
            format,
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`TTS API error: ${response.status} ${response.statusText} ${body}`);
      }

      const data = await response.json() as any;

      // 提取音频 URL
      const audioUrl = data?.output?.audio?.url || data?.audio?.url || data?.url;

      if (!audioUrl) {
        throw new Error('TTS API did not return audio URL');
      }

      // 下载音频
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        const body = await audioResponse.text().catch(() => '');
        throw new Error(`TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText} ${body}`);
      }
      const audioBuffer = await audioResponse.arrayBuffer();

      const audioFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${format}`;
      const relativePath = path.posix.join('audio', audioFileName);
      const audioPath = await workspaceFs.writeFile(sessionId, relativePath, Buffer.from(audioBuffer));
      const audioUri = workspaceFs.toFileUri(audioPath);
      audioPaths.push(audioPath);
      audioUris.push(audioUri);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`TTS synthesis failed for text ${i + 1}:`, error);
      throw error;
    }
  }

  return { audioPaths, audioUris, sessionId };
}
