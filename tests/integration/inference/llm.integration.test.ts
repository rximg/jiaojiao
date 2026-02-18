/**
 * Inference 层：LLM 适配器
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig, lastLoadedConfigPath } from '../../../backend/app-config';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import { createLLMFromAIConfig } from '../../../backend/infrastructure/inference/adapters/llm/index.js';
import type { LLMAIConfig } from '#backend/domain/inference/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const testProvider = process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope' ? process.env.TEST_API_PROVIDER : undefined;
let hasKey = false;

function debugLog(msg: string) {
  try {
    require('fs').appendFileSync(path.join(__dirname, '../../.integration-debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

describe('Inference / LLM', () => {
  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = testProvider ?? (config.agent?.provider as string) ?? 'dashscope';
      hasKey = !!((config.apiKeys as Record<string, string>)[provider]?.trim());
      debugLog(`[LLM] runIntegration=${runIntegration} hasKey=${hasKey} path=${lastLoadedConfigPath ?? ''}`);
    } catch {
      hasKey = false;
    }
  });

  it('should return non-empty response', async (ctx) => {
    if (!hasKey || !runIntegration) ctx.skip();
    const cfg = (await getAIConfig('llm')) as LLMAIConfig;
    const llm = createLLMFromAIConfig(cfg);
    const res = await llm.invoke('用一句话介绍你自己');
    const content = typeof (res as any)?.content === 'string' ? (res as any).content : JSON.stringify((res as any)?.content ?? '');
    expect(content.length).toBeGreaterThan(0);
  }, 60_000);
});
