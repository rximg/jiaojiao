/**
 * Tools 层：synthesize_speech 集成测试
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import { getMultimodalPortAsync } from '../../../backend/infrastructure/repositories.js';
import { loadConfig, lastLoadedConfigPath } from '../../../backend/app-config';
import { resolveWorkspaceRoot } from '../../../backend/services/fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testProvider = process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope' ? process.env.TEST_API_PROVIDER : undefined;
let hasKey = false;

function debugLog(msg: string) {
  try {
    require('fs').appendFileSync(path.join(__dirname, '..', '..', '.integration-debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

describe('Tools / synthesize_speech', () => {
  const sessionId = 'default';

  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!((config.apiKeys as Record<string, string>)[provider]?.trim());
      debugLog('[TTS] hasKey=' + hasKey);
    } catch {
      hasKey = false;
    }
  });

  it('should generate audio files', async (ctx) => {
    if (!hasKey) ctx.skip();
    const texts = ['你好，世界！', '这是一次 TTS 测试。'];
    const port = await getMultimodalPortAsync();
    const items = texts.map((text, i) => ({ text, relativePath: `audio/test_${i}.mp3` }));
    const result = await port.synthesizeSpeech({ items, format: 'mp3', sessionId });

    expect(Array.isArray(result.audioPaths)).toBe(true);
    expect(result.audioPaths.length).toBe(texts.length);
    const expectedDir = path.join(resolveWorkspaceRoot(), sessionId, 'audio');
    for (const p of result.audioPaths) {
      const exists = await fs.access(p).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      expect(path.resolve(p).startsWith(path.resolve(expectedDir))).toBe(true);
    }
  }, 180_000);
});
