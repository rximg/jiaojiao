import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getMultimodalPortAsync } from '../backend/infrastructure/repositories.js';
import { loadConfig } from '../backend/agent/config';

const realFetch = globalThis.fetch;

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

    const cfg = await loadConfig();
    const expectedDir = path.join(cfg.storage.outputPath, 'workspaces', sessionId, 'audio');
    for (const p of result.audioPaths) {
      expect(path.resolve(p).startsWith(path.resolve(expectedDir))).toBe(true);
    }
  });
});
