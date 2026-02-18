/**
 * 音频格式转换（业务层）：PCM 转 MP3/WAV，依赖系统 ffmpeg
 */
import { spawn } from 'child_process';

const FFMPEG_MISSING_MSG =
  'PCM 转 MP3 需要系统已安装 ffmpeg，请安装后重试（如 Windows: winget install ffmpeg，Mac: brew install ffmpeg）。';

export interface PcmOptions {
  sampleRate: number;
  channels: number;
}

/**
 * PCM 16-bit 转 MP3（通过 ffmpeg 子进程）
 */
export function pcmToMp3(
  pcmBuffer: Buffer,
  options: PcmOptions = { sampleRate: 24000, channels: 1 }
): Promise<Buffer> {
  const { sampleRate, channels } = options;
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

    const ff = spawn(
      'ffmpeg',
      [
        '-nostdin',
        '-f', 's16le',
        '-ar', String(sampleRate),
        '-ac', String(channels),
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-f', 'mp3',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    );

    const chunks: Buffer[] = [];
    ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ff.stdout.on('end', () => finish(Buffer.concat(chunks)));

    let stderr = '';
    ff.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ff.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
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

/**
 * PCM 16-bit 转 WAV（加 44 字节头）
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  options: PcmOptions = { sampleRate: 24000, channels: 1 }
): Buffer {
  const { sampleRate, channels } = options;
  const dataLen = pcmBuffer.length;
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
