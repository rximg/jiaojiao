/**
 * 智谱 TTS 适配器：纯 HTTP，返回音频 buffer（PCM 转 MP3/WAV）
 */
import { spawn } from 'child_process';
import type { TTSAIConfig } from '../../../ai/types.js';

const ZHIPU_PCM_SAMPLE_RATE = 24000;
const ZHIPU_PCM_CHANNELS = 1;

const ZHIPU_VOICE_MAP: Record<string, string> = {
  chinese_female: 'tongtong',
  chinese_male: 'tongtong',
  tongtong: 'tongtong',
};

const FFMPEG_MISSING_MSG =
  'PCM 转 MP3 需要系统已安装 ffmpeg，请安装后重试（如 Windows: winget install ffmpeg，Mac: brew install ffmpeg）。';

async function pcmBufferToMp3(pcmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (buf: Buffer) => {
      if (!settled) {
        settled = true;
        resolve(buf);
      }
    };
    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const ff = spawn('ffmpeg', [
      '-nostdin',
      '-f',
      's16le',
      '-ar',
      String(ZHIPU_PCM_SAMPLE_RATE),
      '-ac',
      String(ZHIPU_PCM_CHANNELS),
      '-i',
      'pipe:0',
      '-acodec',
      'libmp3lame',
      '-ab',
      '128k',
      '-f',
      'mp3',
      'pipe:1',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ff.stdout.on('end', () => finish(Buffer.concat(chunks)));

    let stderr = '';
    ff.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    ff.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        fail(new Error(FFMPEG_MISSING_MSG));
      } else {
        fail(err);
      }
    });
    ff.on('close', (code) => {
      if (code !== 0 && code !== null && !settled) {
        fail(new Error(stderr || `ffmpeg exited with code ${code}. ${FFMPEG_MISSING_MSG}`));
      }
    });

    ff.stdin.write(pcmBuffer, (err) => {
      if (err) fail(err);
      else ff.stdin.end();
    });
  });
}

function pcmToWav(pcmBuffer: Buffer): Buffer {
  const dataLen = pcmBuffer.length;
  const sampleRate = ZHIPU_PCM_SAMPLE_RATE;
  const channels = ZHIPU_PCM_CHANNELS;
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcmBuffer]);
}

export interface TtsZhipuResult {
  audioBuffer: Buffer;
}

/** 调用智谱 TTS API，返回音频 buffer（已转 MP3 或 WAV） */
export async function fetchTtsAudioBufferZhipu(
  cfg: TTSAIConfig,
  text: string,
  voice: string,
  format: string
): Promise<TtsZhipuResult> {
  const voiceApi = ZHIPU_VOICE_MAP[voice] ?? 'tongtong';
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: text,
      voice: voiceApi,
      response_format: 'pcm',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS API error: ${res.status} ${res.statusText} ${body}`);
  }
  const pcmBuffer = Buffer.from(await res.arrayBuffer());
  const audioBuffer =
    format === 'wav' ? pcmToWav(pcmBuffer) : await pcmBufferToMp3(pcmBuffer);
  return { audioBuffer };
}
