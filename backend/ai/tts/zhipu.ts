/**
 * 智谱 TTS：POST /api/paas/v4/audio/speech，使用 response_format=pcm（文档默认，采样率 24000 Hz 16-bit 单声道）。
 * PCM 转 MP3 通过系统已安装的 ffmpeg 子进程完成（无需 npm 原生模块或 lamejs 补丁）；需 wav 时给 PCM 加 44 字节头。
 */
import { spawn } from 'child_process';
import type { DoOneTtsOptions, DoOneTtsResult } from './dashscope.js';

/** 智谱 TTS PCM 固定格式（文档：采样率建议 24000） */
const ZHIPU_PCM_SAMPLE_RATE = 24000;
const ZHIPU_PCM_CHANNELS = 1;

const ZHIPU_VOICE_MAP: Record<string, string> = {
  chinese_female: 'tongtong',
  chinese_male: 'tongtong',
  tongtong: 'tongtong',
};

const FFMPEG_MISSING_MSG =
  'PCM 转 MP3 需要系统已安装 ffmpeg，请安装后重试（如 Windows: winget install ffmpeg，Mac: brew install ffmpeg）。';

/**
 * 使用 ffmpeg 将 PCM 16-bit 单声道 buffer 转为 MP3（pipe 进/出，无需临时文件）。
 */
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

/** 给裸 PCM 加 44 字节 WAV 头，便于输出 .wav 文件 */
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

export async function doOneTtsZhipu(options: DoOneTtsOptions): Promise<DoOneTtsResult> {
  const { cfg, sessionId, relativePath, workspaceFs } = options;
  const voice = ZHIPU_VOICE_MAP[options.voice] ?? 'tongtong';
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: options.text,
      voice,
      response_format: 'pcm',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS API error: ${res.status} ${res.statusText} ${body}`);
  }
  const pcmBuffer = Buffer.from(await res.arrayBuffer());
  const buffer =
    options.format === 'wav' ? pcmToWav(pcmBuffer) : await pcmBufferToMp3(pcmBuffer);
  const audioPath = await workspaceFs.writeFile(sessionId, relativePath, buffer);
  return { audioPath, audioUri: workspaceFs.toFileUri(audioPath) };
}
