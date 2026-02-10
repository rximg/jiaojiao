/**
 * TTS 统一入口：mutex、条间延迟、line_numbers、按 provider 调用适配器
 */
import path from 'path';
import { getAIConfig } from '../config.js';
import { getWorkspaceFilesystem } from '../../services/fs.js';
import { readLineNumbers, appendEntries, type LineNumberEntry } from '../../mcp/line-numbers.js';
import type { SynthesizeSpeechParams, SynthesizeSpeechResult, TTSAIConfig } from '../types.js';
import { doOneTtsDashScope } from './dashscope.js';
import { doOneTtsZhipu } from './zhipu.js';

const DEFAULT_SESSION_ID = 'default';
const TTS_RATE_LIMIT_RETRIES = 3;
const TTS_RATE_LIMIT_BACKOFF_MS = 5000;

function sanitizeForFilename(text: string, maxLen = 40): string {
  const noPunctuation = text.replace(/[\s\p{P}\p{S}]/gu, '').trim();
  const truncated = noPunctuation.slice(0, maxLen);
  const safe = truncated.replace(/[/\\:*?"<>|]/g, '_');
  return safe || 'line';
}

let ttsMutex: Promise<void> = Promise.resolve();

export type { SynthesizeSpeechParams, SynthesizeSpeechResult };

export async function synthesizeSpeech(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult> {
  const previous = ttsMutex;
  let resolveMutex: () => void;
  ttsMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve;
  });
  await previous;
  try {
    return await synthesizeSpeechSequential(params);
  } finally {
    resolveMutex!();
  }
}

async function synthesizeSpeechSequential(params: SynthesizeSpeechParams): Promise<SynthesizeSpeechResult> {
  const { loadConfig } = await import('../../agent/config.js');
  const config = await loadConfig();
  const cfg = (await getAIConfig('tts')) as TTSAIConfig;
  const { texts, voice = 'chinese_female', format = 'mp3', sessionId = DEFAULT_SESSION_ID } = params;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });
  const outputPath = config.storage.outputPath;
  const ttsStartNumber = config.storage.ttsStartNumber ?? 6000;

  const { nextNumber } = await readLineNumbers(outputPath, ttsStartNumber);
  const planned: { num: number; relativePath: string; text: string }[] = texts.map((text, i) => {
    const num = nextNumber + i;
    const relativePath = path.posix.join('audio', `${num}_${sanitizeForFilename(text)}.${format}`);
    return { num, relativePath, text };
  });

  const audioPaths: string[] = [];
  const audioUris: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, cfg.rateLimitMs));
    const { relativePath, text } = planned[i];
    const opts = {
      cfg,
      text,
      voice,
      format,
      sessionId,
      relativePath,
      workspaceFs,
      backoffBaseMs: TTS_RATE_LIMIT_BACKOFF_MS,
      maxRetries: TTS_RATE_LIMIT_RETRIES,
    };
    const result =
      cfg.provider === 'zhipu' ? await doOneTtsZhipu(opts) : await doOneTtsDashScope(opts);
    audioPaths.push(result.audioPath);
    audioUris.push(result.audioUri);
  }

  const newEntries: LineNumberEntry[] = planned.map((p) => ({
    number: p.num,
    sessionId,
    relativePath: p.relativePath,
    text: p.text,
  }));
  await appendEntries(outputPath, newEntries, ttsStartNumber);

  return {
    audioPaths,
    audioUris,
    numbers: planned.map((p) => p.num),
    sessionId,
  };
}
