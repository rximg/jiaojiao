import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callVLDashScope } from '../backend/ai/vl/dashscope';
import { callVLZhipu } from '../backend/ai/vl/zhipu';

vi.mock('../backend/app-config', () => ({ loadConfig: vi.fn() }));

// 若 parse-util 未抽出，则直接测 parse 逻辑在 index 内，通过 generateScriptFromImage mock fetch 测试
describe('VL parseAndValidateLines', () => {
  function parse(content: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error('VL script response is not valid JSON');
    }
    if (!Array.isArray(raw)) throw new Error('VL script response must be a JSON array');
    const lines: { text: string; x: number; y: number }[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (item == null || typeof item !== 'object') throw new Error(`VL script item at index ${i} must be an object`);
      const text = typeof item.text === 'string' ? item.text : String(item.text ?? '');
      const x = typeof item.x === 'number' ? item.x : Number(item.x) || 0;
      const y = typeof item.y === 'number' ? item.y : Number(item.y) || 0;
      lines.push({ text, x, y });
    }
    return lines;
  }

  it('parses valid JSON array to lines', () => {
    const content = '[{"text":"hello","x":10,"y":20}]';
    const lines = parse(content);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: 'hello', x: 10, y: 20 });
  });

  it('throws on invalid JSON', () => {
    expect(() => parse('not json')).toThrow('not valid JSON');
  });

  it('throws when not array', () => {
    expect(() => parse('{}')).toThrow('must be a JSON array');
  });
});

describe('VL adapters (mocked fetch)', () => {
  const cfg = {
    provider: 'dashscope' as const,
    apiKey: 'sk-test',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-vl-plus',
    prompt: 'Describe the image.',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('dashscope returns content from choices[0].message.content', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"text":"a","x":1,"y":2}]' } }],
      }),
    });
    const content = await callVLDashScope({ cfg, dataUrl: 'data:image/png;base64,abc', prompt: cfg.prompt });
    expect(content).toBe('[{"text":"a","x":1,"y":2}]');
  });

  it('zhipu returns content from choices[0].message.content', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"text":"b","x":3,"y":4}]' } }],
      }),
    });
    const content = await callVLZhipu({ cfg: { ...cfg, provider: 'zhipu' }, dataUrl: 'data:image/png;base64,xyz', prompt: cfg.prompt });
    expect(content).toBe('[{"text":"b","x":3,"y":4}]');
  });
});
