import { describe, it, expect, vi } from 'vitest';
import { ChatOpenAI } from '@langchain/openai';

describe('LLM [unit]', () => {
  it('invokes model and returns mocked content', async () => {
    const llm = new ChatOpenAI({
      apiKey: 'sk-test',
      modelName: 'qwen-plus',
      temperature: 0,
      maxTokens: 32,
      configuration: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    });

    const spy = vi.spyOn(llm, 'invoke').mockResolvedValue({ content: 'hello' } as any);
    const res = await llm.invoke('ping');
    expect((res as any).content).toBe('hello');
    spy.mockRestore();
  });
});
