import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { synthesizeSpeech } from '../backend/mcp/tts';
import { loadConfig } from '../backend/agent/config';

const hasKey = !!process.env.DASHSCOPE_API_KEY;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

const createdFiles: string[] = [];

describe('TTS synthesizeSpeech()', () => {
  beforeAll(() => {
    if (!hasKey) {
      // eslint-disable-next-line no-console
      console.warn('Skipping TTS test: missing DASHSCOPE_API_KEY');
    }
  });

  afterAll(async () => {
    // Print generated files for inspection
    if (createdFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log('\n✅ Generated audio files:');
      for (const file of createdFiles) {
        // eslint-disable-next-line no-console
        console.log(`   ${file}`);
      }
    }
    // Note: files are preserved for inspection. Uncomment below to clean up:
    // for (const file of createdFiles) {
    //   try {
    //     await fs.unlink(file);
    //   } catch {}
    // }
  });

  it.skipIf(!hasKey || !runIntegration)('should generate audio files', async () => {
    const texts = ['你好，世界！', '这是一次 TTS 测试。'];
    const result = await synthesizeSpeech({ texts, format: 'mp3' });

    expect(Array.isArray(result.audioPaths)).toBe(true);
    expect(result.audioPaths.length).toBe(texts.length);

    for (const p of result.audioPaths) {
      createdFiles.push(p);
      const exists = await fs
        .access(p)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    }

    const cfg = await loadConfig();
    const expectedDir = path.join(cfg.storage.outputPath, 'audios');
    for (const p of result.audioPaths) {
      expect(p.startsWith(path.resolve(expectedDir))).toBe(true);
    }
  }, 180_000);
});
