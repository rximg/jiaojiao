import path from 'path';
import { promises as fs } from 'fs';
import jsyaml from 'js-yaml';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';
import { readLineNumbers, appendEntries, type LineNumberEntry } from './line-numbers.js';

export interface SynthesizeSpeechParams {
  texts: string[];
  voice?: string;
  format?: string;
  sessionId?: string;
}

export interface SynthesizeSpeechResult {
  audioPaths: string[];
  audioUris: string[];
  numbers: number[]; // 返回生成的 number 列表，与 audioPaths 一一对应
  sessionId: string;
}

/** 去掉标点、限制长度、替换非法文件名字符，用于 TTS 文件名 */
function sanitizeForFilename(text: string, maxLen: number = 40): string {
  const noPunctuation = text.replace(/[\s\p{P}\p{S}]/gu, '').trim();
  const truncated = noPunctuation.slice(0, maxLen);
  const safe = truncated.replace(/[/\\:*?"<>|]/g, '_');
  return safe || 'line';
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

/** 429/503 时重试：最多重试次数与退避基数（毫秒） */
const TTS_RATE_LIMIT_RETRIES = 3;
const TTS_RATE_LIMIT_BACKOFF_MS = 5000;

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

/** 单条 TTS：请求 API，遇 429/503 时退避重试 */
async function doOneTtsWithRetry(options: {
  endpoint: string;
  token: string;
  model: string;
  voice: string;
  format: string;
  text: string;
  sessionId: string;
  relativePath: string;
  workspaceFs: ReturnType<typeof getWorkspaceFilesystem>;
  audioPaths: string[];
  audioUris: string[];
  backoffBaseMs: number;
  maxRetries: number;
}): Promise<void> {
  const voiceApi = voiceMap[options.voice] || 'Cherry';
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (attempt > 0) {
      const waitMs = options.backoffBaseMs * Math.pow(2, attempt - 1);
      console.warn(`[TTS] Rate limit (429/503), retry ${attempt}/${options.maxRetries} after ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({
        model: options.model,
        input: { text: options.text, voice: voiceApi },
        parameters: { format: options.format, sample_rate: 44100 },
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
    const data = (await response.json()) as any;
    const audioUrl = data?.output?.audio?.url || data?.audio?.url || data?.url;
    if (!audioUrl) throw new Error('TTS API did not return audio URL');
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      const body = await audioResponse.text().catch(() => '');
      throw new Error(`TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText} ${body}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioPath = await options.workspaceFs.writeFile(
      options.sessionId,
      options.relativePath,
      Buffer.from(audioBuffer)
    );
    options.audioPaths.push(audioPath);
    options.audioUris.push(options.workspaceFs.toFileUri(audioPath));
    return;
  }
  throw lastError ?? new Error('TTS rate limit retries exhausted');
}

/** 单次调用的内部实现：对 texts 严格顺序执行，避免 Requests rate limit exceeded */
async function synthesizeSpeechSequential(
  params: SynthesizeSpeechParams
): Promise<SynthesizeSpeechResult> {
  const config = await loadConfig();
  const { texts, voice = 'chinese_female', format = 'mp3', sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });
  const outputPath = config.storage.outputPath;
  const ttsStartNumber = config.storage.ttsStartNumber ?? 6000;

  // 在持有 mutex 内读 line_numbers，预留本批编号
  const { nextNumber } = await readLineNumbers(outputPath, ttsStartNumber);
  const planned: { num: number; relativePath: string; text: string }[] = texts.map((text, i) => {
    const num = nextNumber + i;
    const sanitized = sanitizeForFilename(text);
    const relativePath = path.posix.join('audio', `${num}_${sanitized}.${format}`);
    return { num, relativePath, text };
  });

  const token = config.apiKeys.tts || config.apiKeys.dashscope || '';
  const endpoint = process.env.DASHSCOPE_TTS_ENDPOINT 
    || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const model = process.env.DASHSCOPE_TTS_MODEL || 'qwen-tts';

  // 条与条之间的间隔：环境变量 > tts_config.yaml service.batch.delay > 默认 2000ms
  let rateLimitMs = Number(process.env.TTS_RATE_LIMIT_MS);
  if (!rateLimitMs) {
    try {
      const yamlPath = path.join(process.cwd(), 'backend', 'config', 'mcp', 'tts_config.yaml');
      const ttsYaml = (jsyaml.load(await fs.readFile(yamlPath, 'utf-8')) as Record<string, unknown>) ?? {};
      const service = ttsYaml.service as Record<string, unknown> | undefined;
      const batch = service?.batch as { delay?: number } | undefined;
      rateLimitMs = typeof batch?.delay === 'number' ? batch.delay : 2000;
    } catch {
      rateLimitMs = 2000;
    }
  }

  const audioPaths: string[] = [];
  const audioUris: string[] = [];

  // 顺序执行每条 TTS，条与条之间等待 rateLimitMs，避免 rate limit
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const { relativePath } = planned[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitMs));
    }

    try {
      await doOneTtsWithRetry({
        endpoint,
        token,
        model,
        voice,
        format,
        text,
        sessionId,
        relativePath,
        workspaceFs,
        audioPaths,
        audioUris,
        backoffBaseMs: TTS_RATE_LIMIT_BACKOFF_MS,
        maxRetries: TTS_RATE_LIMIT_RETRIES,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`TTS synthesis failed for text ${i + 1}:`, error);
      throw error;
    }
  }

  // 本批全部成功后，更新 workspace 下的 audio_record.json
  const newEntries: LineNumberEntry[] = planned.map((p) => ({
    number: p.num,
    sessionId,
    relativePath: p.relativePath,
    text: p.text,
  }));
  await appendEntries(outputPath, newEntries, ttsStartNumber);

  const numbers = planned.map((p) => p.num);
  return { audioPaths, audioUris, numbers, sessionId };
}
