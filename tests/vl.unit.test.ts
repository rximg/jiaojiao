import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { callVLZhipu } from '../backend/ai/vl/zhipu';
import { callVLDashScope } from '../backend/ai/vl/dashscope';

const realFetch = globalThis.fetch;

const zhipuCfg = {
  provider: 'zhipu' as const,
  apiKey: 'zhipu-key',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4v',
  prompt: '描述图片并返回 JSON 数组',
};

const dashscopeCfg = {
  provider: 'dashscope' as const,
  apiKey: 'dashscope-key',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-vl-plus',
  prompt: 'Describe the image.',
};

describe('VL Zhipu callVLZhipu [unit]', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('POST 到 baseUrl/chat/completions，body 含 type image + image_url', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"text":"图上有猫","x":0,"y":0}]' } }],
      }),
    });

    const dataUrl = 'data:image/png;base64,abc123';
    const content = await callVLZhipu({ cfg: zhipuCfg, dataUrl, prompt: zhipuCfg.prompt });

    expect(content).toBe('[{"text":"图上有猫","x":0,"y":0}]');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers?.Authorization).toBe('Bearer zhipu-key');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('glm-4v');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toEqual([
      { type: 'image', image_url: dataUrl },
      { type: 'text', text: zhipuCfg.prompt },
    ]);
  });

  it('res.ok 为 false 时抛出 VL API failed', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => '{"error":"invalid image"}',
    });

    await expect(
      callVLZhipu({ cfg: zhipuCfg, dataUrl: 'data:image/png;base64,x', prompt: zhipuCfg.prompt })
    ).rejects.toThrow('VL API failed');
  });

  it('响应无 choices[0].message.content 时抛出', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    await expect(
      callVLZhipu({ cfg: zhipuCfg, dataUrl: 'data:image/png;base64,x', prompt: zhipuCfg.prompt })
    ).rejects.toThrow('VL API did not return message content');
  });
});

describe('VL DashScope callVLDashScope [unit]', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('POST 到 baseUrl/chat/completions，body 含 type image_url + url 对象', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"text":"a","x":1,"y":2}]' } }],
      }),
    });

    const dataUrl = 'data:image/jpeg;base64,xyz789';
    const content = await callVLDashScope({
      cfg: dashscopeCfg,
      dataUrl,
      prompt: dashscopeCfg.prompt,
    });

    expect(content).toBe('[{"text":"a","x":1,"y":2}]');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers?.Authorization).toBe('Bearer dashscope-key');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('qwen-vl-plus');
    expect(body.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: dashscopeCfg.prompt },
    ]);
  });

  it('res.ok 为 false 时抛出 VL API failed', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    });

    await expect(
      callVLDashScope({
        cfg: dashscopeCfg,
        dataUrl: 'data:image/png;base64,y',
        prompt: dashscopeCfg.prompt,
      })
    ).rejects.toThrow('VL API failed');
  });

  it('响应 content 非字符串时抛出', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: null } }] }),
    });

    await expect(
      callVLDashScope({
        cfg: dashscopeCfg,
        dataUrl: 'data:image/png;base64,z',
        prompt: dashscopeCfg.prompt,
      })
    ).rejects.toThrow('VL API did not return message content');
  });
});
