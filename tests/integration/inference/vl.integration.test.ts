/**
 * Inference 层：VL 适配器，callVL 返回非空 content（集成测试调用真实 VL 接口 DashScope/智谱）
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import { callVLZhipu } from '../../../backend/infrastructure/inference/adapters/vl/zhipu.js';
import { callVLDashScope } from '../../../backend/infrastructure/inference/adapters/vl/dashscope.js';
import { loadConfig, lastLoadedConfigPath } from '../../../backend/app-config';
import type { VLAIConfig } from '#backend/domain/inference/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testProvider =
  process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope'
    ? process.env.TEST_API_PROVIDER
    : undefined;
let hasKey = false;

function logKeyStatus(apiKeys: { dashscope?: string; zhipu?: string }): string {
  const ds = apiKeys.dashscope?.trim();
  const zp = apiKeys.zhipu?.trim();
  return `dashscope: ${ds ? `已配置(len=${ds.length})` : '未配置'}, zhipu: ${zp ? `已配置(len=${zp.length})` : '未配置'}`;
}

function debugLog(msg: string): void {
  try {
    const fsSync = require('fs');
    const logPath = path.join(__dirname, '..', '..', '.integration-debug.log');
    fsSync.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore
  }
}

async function createMinimalTestPng(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe('Inference / VL', () => {
  beforeAll(async () => {
    debugLog(`[VL] TEST_API_PROVIDER=${process.env.TEST_API_PROVIDER ?? '(未设置)'}`);
    try {
      const config = await loadConfig();
      const apiKeys = config.apiKeys as { dashscope?: string; zhipu?: string };
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!(apiKeys[provider]?.trim());
      debugLog(`[VL] 配置文件路径: ${lastLoadedConfigPath ?? '(未使用文件)'}`);
      debugLog(`[VL] config.agent.provider=${config.agent?.provider} -> 使用 provider=${provider} hasKey=${hasKey} | ${logKeyStatus(apiKeys)}`);
    } catch (err) {
      hasKey = false;
      debugLog(`[VL] 初始化失败: ${(err as Error).message}`);
    }
  });

  it('(debug) 集成测试条件与配置路径', () => {
    expect(typeof hasKey).toBe('boolean');
  });

  it('should return non-empty content from VL API (zhipu or dashscope)', async (ctx) => {
    if (!hasKey) ctx.skip();
    const cfg = (await getAIConfig('vl')) as VLAIConfig;
    const buf = await createMinimalTestPng();
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    const prompt = cfg.prompt || '描述这张图片，用一句话即可。';
    const content =
      cfg.provider === 'zhipu'
        ? await callVLZhipu({ cfg, dataUrl, prompt })
        : await callVLDashScope({ cfg, dataUrl, prompt });
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  }, 60_000);
});
