/**
 * Inference 层：T2I 适配器（AsyncInferencePort），直接测 createT2IPort + submit + poll（集成测试调用真实 T2I 接口）
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import { createT2IPort } from '../../../backend/infrastructure/inference/create-ports.js';
import { loadConfig, lastLoadedConfigPath } from '../../../backend/app-config';
import type { T2IAIConfig } from '#backend/domain/inference/types.js';

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

describe('Inference / T2I', () => {
  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!((config.apiKeys as Record<string, string>)[provider]?.trim());
      debugLog(`[T2I inference] hasKey=${hasKey} path=${lastLoadedConfigPath ?? ''}`);
    } catch {
      hasKey = false;
    }
  });

  it('(debug) 集成测试条件', () => {
    expect(typeof hasKey).toBe('boolean');
  });

  it('should return image URL from T2I adapter (submit + poll)', async (ctx) => {
    if (!hasKey) ctx.skip();
    const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
    const port = createT2IPort(cfg);
    const taskId = await port.submit({
      prompt: 'A simple red apple on white background.',
      parameters: {},
    });
    expect(typeof taskId).toBe('string');
    expect(taskId.length).toBeGreaterThan(0);

    const imageUrl = await port.poll(taskId);
    expect(typeof imageUrl).toBe('string');
    expect(imageUrl.length).toBeGreaterThan(0);
    expect(imageUrl.startsWith('http')).toBe(true);
  }, 120_000);
});
