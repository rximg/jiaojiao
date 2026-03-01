/**
 * Inference 层：图片编辑适配器集成测试（DashScope wan2.6-image）
 * 直接测试 createEditImagePort + execute（真实接口）
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getAIConfig } from '../../../backend/infrastructure/inference/ai-config.js';
import { createEditImagePort } from '../../../backend/infrastructure/inference/create-ports.js';
import { loadConfig } from '../../../backend/app-config';
import type { T2IAIConfig } from '../../../backend/domain/inference/types.js';

let hasKey = false;

const SAMPLE_IMAGE_URL =
  'https://cdn.wanx.aliyuncs.com/tmp/pressure/umbrella1.png';

describe('Inference / Image Edit (DashScope)', () => {
  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const key =
        (config.multimodalApiKeys as Record<string, string> | undefined)?.dashscope ??
        (config.apiKeys as Record<string, string> | undefined)?.dashscope;
      hasKey = !!key?.trim();
    } catch {
      hasKey = false;
    }
  });

  it('should return image URL from DashScope image-edit adapter', async (ctx) => {
    if (!hasKey) ctx.skip();

    const cfg = (await getAIConfig('t2i')) as T2IAIConfig;
    if (cfg.provider !== 'dashscope') {
      ctx.skip();
    }

    const port = createEditImagePort(cfg);
    let result: { imageUrl: string };
    try {
      result = await port.execute({
        model: 'wan2.6-image',
        prompt: '参考图颜色与构图，生成一张简洁风格的水果插画',
        imageDataUrls: [SAMPLE_IMAGE_URL],
        parameters: {
          size: '1280*1280',
          n: 1,
          prompt_extend: true,
          watermark: false,
          enable_interleave: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('AccessDenied') && message.includes('does not support synchronous calls')) {
        ctx.skip();
      }
      throw error;
    }

    expect(typeof result.imageUrl).toBe('string');
    expect(result.imageUrl.startsWith('http')).toBe(true);
  }, 120_000);
});
