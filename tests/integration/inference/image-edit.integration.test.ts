/**
 * Inference 层：图片编辑适配器集成测试（DashScope / Jiaojiao qwen-image-edit）。
 * 直接测试提交 + 轮询真实接口。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import {
  pollEditImageDashScope,
  submitEditImageDashScope,
} from '../../../backend/infrastructure/inference/adapters/image-edit/dashscope.ts';
import { loadConfig } from '../../../backend/app-config';
import type { T2IAIConfig } from '../../../backend/domain/inference/types.js';

const testProvider =
  process.env.TEST_API_PROVIDER === 'zhipu' ||
  process.env.TEST_API_PROVIDER === 'dashscope' ||
  process.env.TEST_API_PROVIDER === 'jiaojiao'
    ? process.env.TEST_API_PROVIDER
    : undefined;

let hasKey = false;
const testTimeoutMs = process.env.TEST_API_PROVIDER === 'jiaojiao' ? 300_000 : 120_000;

async function createMinimalTestPng(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe('Inference / Image Edit (DashScope/Jiaojiao)', () => {
  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = (testProvider ?? config.agent?.multimodalProvider ?? config.agent?.provider ?? 'dashscope') as
        | 'dashscope'
        | 'zhipu'
        | 'jiaojiao';
      const keys = (config.multimodalApiKeys ?? config.apiKeys) as Record<string, string | undefined>;
      const key = keys[provider];
      hasKey = !!key?.trim();
    } catch {
      hasKey = false;
    }
  });

  it('should return image URL from image-edit adapter', async (ctx) => {
    if (!hasKey) ctx.skip();

    const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
    if (cfg.provider !== 'dashscope' && cfg.provider !== 'jiaojiao') {
      ctx.skip();
    }
    const model = cfg.provider === 'jiaojiao' ? 'qwen-image-edit' : 'wan2.6-image';

    const imageBuffer = await createMinimalTestPng();
    const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    let taskId = '';
    let result: { imageUrl: string };
    try {
      taskId = await submitEditImageDashScope(cfg, {
        model,
        prompt: '参考图颜色与构图，生成一张简洁风格的水果插画',
        imageDataUrls: [imageDataUrl],
        parameters: {
          size: '1280*1280',
          n: 1,
          prompt_extend: true,
          watermark: false,
          enable_interleave: false,
        },
      });
      if (cfg.provider === 'jiaojiao') {
        expect(taskId.startsWith('qe_') || taskId.startsWith('qu_')).toBe(true);
      }
      result = await pollEditImageDashScope(cfg, taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('AccessDenied') && message.includes('does not support synchronous calls')) {
        ctx.skip();
      }
      throw error;
    }

    expect(typeof taskId).toBe('string');
    expect(taskId.length).toBeGreaterThan(0);
    expect(typeof result.imageUrl).toBe('string');
    expect(result.imageUrl.startsWith('http')).toBe(true);
  }, testTimeoutMs);
});
