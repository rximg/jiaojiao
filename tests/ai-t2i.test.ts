import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTaskDashScope, pollForImageUrlDashScope } from '../backend/infrastructure/inference/adapters/t2i/dashscope.js';
import { submitTaskZhipu, pollForImageUrlZhipu } from '../backend/infrastructure/inference/adapters/t2i/zhipu.js';

const dashscopeCfg = {
  provider: 'dashscope' as const,
  apiKey: 'sk-ds',
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation',
  taskEndpoint: 'https://dashscope.aliyuncs.com/api/v1/tasks',
  model: 'wan2.6-t2i',
};

const zhipuCfg = {
  provider: 'zhipu' as const,
  apiKey: 'sk-zhipu',
  endpoint: 'https://open.bigmodel.cn/api/paas/v4/async/images/generations',
  taskEndpoint: 'https://open.bigmodel.cn/api/paas/v4/async/tasks',
  model: 'glm-image',
};

describe('T2I dashscope', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('submitTaskDashScope returns task_id', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ output: { task_id: 'task-123' } }),
    });
    const taskId = await submitTaskDashScope(dashscopeCfg, 'a cat', { size: '1024*1024', max_images: 1 });
    expect(taskId).toBe('task-123');
  });

  it('pollForImageUrlDashScope returns image URL on SUCCEEDED', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: { task_status: 'PROCESSING' } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: {
            task_status: 'SUCCEEDED',
            choices: [{ message: { content: [{ type: 'image', image: 'https://example.com/img.png' }] } }],
          },
        }),
      });
    const url = await pollForImageUrlDashScope(dashscopeCfg, 'task-123');
    expect(url).toBe('https://example.com/img.png');
  });
});

describe('T2I zhipu', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('submitTaskZhipu returns task id', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'img-task-xyz' }),
    });
    const taskId = await submitTaskZhipu(zhipuCfg, 'a dog', { size: '1280x1280' });
    expect(taskId).toBe('img-task-xyz');
  });

  it('pollForImageUrlZhipu returns image URL on SUCCESS', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ task_status: 'PROCESSING' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          task_status: 'SUCCESS',
          result: { images: [{ url: 'https://zhipu.com/gen.png' }] },
        }),
      });
    const url = await pollForImageUrlZhipu(zhipuCfg, 'img-task-xyz');
    expect(url).toBe('https://zhipu.com/gen.png');
  });
});
