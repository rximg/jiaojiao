import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getMultimodalPortAsync } from '../backend/infrastructure/repositories.js';
import { resolveWorkspaceRoot } from '../backend/services/fs';
import { fetchTtsAudioUrlDashScope, TTSDashScopePort } from '../backend/infrastructure/inference/adapters/tts/dashscope.js';

const realFetch = globalThis.fetch;

const dashscopeTtsCfg = {
  provider: 'dashscope' as const,
  apiKey: 'sk-dashscope-tts',
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  model: 'qwen-tts',
};

describe('TTS synthesizeSpeech() [unit]', () => {
  const sessionId = 'unit-session';

  beforeEach(() => {
    // mock TTS API calls:
    // Odd calls (1, 3, 5...): POST request to synthesize text -> returns audio URL
    // Even calls (2, 4, 6...): GET request to download audio -> returns audio buffer
    let callCount = 0;
    // @ts-ignore
    globalThis.fetch = vi.fn(async (url: string, options?: any) => {
      callCount++;
      
      // Odd calls: TTS API request (POST)
      if (callCount % 2 === 1) {
        return {
          ok: true,
          json: async () => ({ 
            output: { 
              audio: { 
                url: `https://example.com/audio_${callCount}.mp3` 
              } 
            } 
          }),
        } as any;
      }
      
      // Even calls: download audio file (GET)
      const encoder = new TextEncoder();
      const bytes = encoder.encode('fake audio data');
      return {
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      } as any;
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('writes audio files to workspace session directory', async () => {
    const texts = ['a', 'b'];
    const port = await getMultimodalPortAsync();
    const items = texts.map((t, i) => ({ text: t, relativePath: `audio/${i}_${t}.mp3` }));
    const result = await port.synthesizeSpeech({ items, format: 'mp3', sessionId });

    expect(result.audioPaths.length).toBe(2);
    expect(result.audioUris.length).toBe(2);
    expect(result.sessionId).toBe(sessionId);
    result.audioUris.forEach((uri) => expect(uri.startsWith('file://')).toBe(true));

    for (const p of result.audioPaths) {
      const exists = await fs
        .access(p)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
      await fs.unlink(p).catch(() => {});
    }

    const expectedDir = path.join(resolveWorkspaceRoot(), sessionId, 'audio');
    for (const p of result.audioPaths) {
      expect(path.resolve(p).startsWith(path.resolve(expectedDir))).toBe(true);
    }
  });
});

describe('TTS DashScope (sync) [unit]', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetchTtsAudioUrlDashScope: POST 返回 output.audio.url', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        output: { audio: { url: 'https://example.com/audio.wav' } },
      }),
    });

    const result = await fetchTtsAudioUrlDashScope(
      dashscopeTtsCfg,
      '你好世界',
      'chinese_female'
    );

    expect(result.audioUrl).toBe('https://example.com/audio.wav');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(dashscopeTtsCfg.endpoint);
    expect(opts.method).toBe('POST');
    expect(opts.headers?.Authorization).toBe('Bearer sk-dashscope-tts');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('qwen-tts');
    expect(body.input).toEqual({
      text: '你好世界',
      voice: 'Cherry',
      language_type: 'Chinese',
    });
  });

  it('fetchTtsAudioUrlDashScope: 响应无 output.audio.url 时抛出', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ output: {} }),
    });

    await expect(
      fetchTtsAudioUrlDashScope(dashscopeTtsCfg, 'hi', 'Cherry')
    ).rejects.toThrow('TTS API did not return output.audio.url');
  });

  it('TTSDashScopePort.execute 返回 audioUrl', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        output: { audio: { url: 'https://example.com/out.mp3' } },
      }),
    });

    const port = new TTSDashScopePort(dashscopeTtsCfg);
    const result = await port.execute({ text: '测试', voice: 'Ethan' });

    expect(result).toEqual({ audioUrl: 'https://example.com/out.mp3' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
