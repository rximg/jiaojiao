/**
 * Inference 层：TTS 适配器（SyncInferencePort），直接测 createTTSSyncPort + execute（集成测试调用真实 TTS 接口）
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import { createTTSSyncPort } from '../../../backend/infrastructure/inference/create-ports.js';
import { loadConfig, lastLoadedConfigPath } from '../../../backend/app-config';
import type { TTSAIConfig } from '#backend/domain/inference/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testProvider =
  process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope'
    ? process.env.TEST_API_PROVIDER
    : undefined;
let hasKey = false;

function debugLog(msg: string): void {
  try {
    require('fs').appendFileSync(
      path.join(__dirname, '..', '..', '.integration-debug.log'),
      `${new Date().toISOString()} ${msg}\n`
    );
  } catch {
    // ignore
  }
}

describe('Inference / TTS', () => {
  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!((config.apiKeys as Record<string, string>)[provider]?.trim());
      debugLog(`[TTS inference] hasKey=${hasKey} path=${lastLoadedConfigPath ?? ''}`);
    } catch {
      hasKey = false;
    }
  });

  it('(debug) 集成测试条件', () => {
    expect(typeof hasKey).toBe('boolean');
  });

  it('should return audio (PCM buffer or audioUrl) from TTS adapter', async (ctx) => {
    if (!hasKey) ctx.skip();
    const cfg = (await getAIConfig('tts')) as TTSAIConfig;
    const port = createTTSSyncPort(cfg);
    const result = await port.execute({
      text: '你好，这是 TTS 推理层测试。',
      voice: 'chinese_female',
    });

    if ('pcmBuffer' in result) {
      expect(Buffer.isBuffer(result.pcmBuffer)).toBe(true);
      expect(result.pcmBuffer.length).toBeGreaterThan(0);
    } else if ('audioUrl' in result) {
      expect(typeof result.audioUrl).toBe('string');
      expect(result.audioUrl.length).toBeGreaterThan(0);
    } else {
      expect(result).toBeDefined();
    }
  }, 60_000);
});
