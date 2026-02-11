import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig, lastLoadedConfigPath } from '../backend/app-config';
import { getAIConfig } from '../backend/ai/config';
import { createLLMFromAIConfig } from '../backend/ai/llm/index';
import type { LLMAIConfig } from '../backend/ai/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
/** 集成测试时指定只测某方：zhipu | dashscope，未设置时用应用配置的 provider */
const testProvider = (process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope')
  ? process.env.TEST_API_PROVIDER
  : undefined;
let hasKey = false;

function logKeyStatus(apiKeys: { dashscope?: string; zhipu?: string }): string {
  const ds = apiKeys.dashscope?.trim();
  const zp = apiKeys.zhipu?.trim();
  return `dashscope: ${ds ? `已配置(len=${ds.length})` : '未配置'}, zhipu: ${zp ? `已配置(len=${zp.length})` : '未配置'}`;
}

function debugLog(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
  try {
    const fs = require('fs');
    const logPath = path.join(__dirname, '.integration-debug.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore
  }
}

describe('LLM (用户目录配置的 API Key)', () => {
  beforeAll(async () => {
    debugLog(`[LLM] RUN_INTEGRATION_TESTS=${runIntegration} TEST_API_PROVIDER=${process.env.TEST_API_PROVIDER ?? '(未设置)'}`);
    try {
      const config = await loadConfig();
      const apiKeys = config.apiKeys as { dashscope?: string; zhipu?: string };
      const provider = testProvider ?? (config.agent?.provider as 'dashscope' | 'zhipu') ?? 'dashscope';
      hasKey = !!(apiKeys[provider]?.trim());
      debugLog(`[LLM] 配置文件路径: ${lastLoadedConfigPath ?? '(未使用文件)'}`);
      debugLog(`[LLM] config.agent.provider=${config.agent?.provider} -> 使用 provider=${provider} hasKey=${hasKey} | ${logKeyStatus(apiKeys)}`);
    } catch (err) {
      hasKey = false;
      debugLog(`[LLM] loadConfig 失败: ${(err as Error).message}`);
    }
    if (!hasKey) {
      debugLog(`[LLM] Skipping (provider=${testProvider ?? 'config'}): 请在应用设置中配置对应 API Key`);
    }
  });

  it('(debug) 集成测试条件与配置路径', () => {
    const msg = `[LLM] runIntegration=${runIntegration} hasKey=${hasKey} 配置文件路径=${lastLoadedConfigPath ?? '(未使用文件)'} 详见 tests/.integration-debug.log`;
    // eslint-disable-next-line no-console
    console.log(msg);
    expect(typeof hasKey).toBe('boolean');
  });

  it('should return a non-empty response', async (ctx) => {
    if (!hasKey || !runIntegration) {
      ctx.skip();
    }
    const cfg = (await getAIConfig('llm')) as LLMAIConfig;
    const llm = createLLMFromAIConfig(cfg);

    const res = await llm.invoke('用一句话介绍你自己');
    const content = typeof (res as any)?.content === 'string'
      ? (res as any).content
      : JSON.stringify((res as any)?.content ?? '');

    expect(content).toBeTypeOf('string');
    expect(content.length).toBeGreaterThan(0);
  }, 60_000);
});
