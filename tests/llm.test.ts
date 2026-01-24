import { describe, it, expect, beforeAll } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';

const hasKey = !!process.env.DASHSCOPE_API_KEY;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

describe('LLM (DashScope via OpenAI-compatible endpoint)', () => {
  beforeAll(() => {
    if (!hasKey) {
      // eslint-disable-next-line no-console
      console.warn('Skipping LLM test: missing DASHSCOPE_API_KEY');
    }
  });

  it.skipIf(!hasKey || !runIntegration)('should return a non-empty response', async () => {
    const llm = new ChatOpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      modelName: process.env.DASHSCOPE_MODEL || 'qwen-plus',
      temperature: 0.2,
      maxTokens: 128,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });

    const res = await llm.invoke('用一句话介绍你自己');
    const content = typeof (res as any)?.content === 'string'
      ? (res as any).content
      : JSON.stringify((res as any)?.content ?? '');

    expect(content).toBeTypeOf('string');
    expect(content.length).toBeGreaterThan(0);
  }, 60_000);
});
