import { describe, expect, it, vi } from 'vitest';
import { invokeAgentUseCase } from '../../../../backend/application/agent/invoke-agent-use-case.ts';

describe('invokeAgentUseCase', () => {
  it('keeps distinct assistant messages distinct when stream emits a new assistant message id', async () => {
    async function* createStream() {
      yield {
        messages: [
          { id: 'assistant-1', type: 'ai', content: '第一句' },
        ],
      };

      yield {
        messages: [
          { id: 'assistant-1', type: 'ai', content: '第一句，继续补充' },
        ],
      };

      yield {
        messages: [
          { id: 'assistant-1', type: 'ai', content: '第一句，继续补充' },
          { id: 'assistant-2', type: 'ai', content: '第二句' },
        ],
      };
    }

    const onMessage = vi.fn();

    await invokeAgentUseCase(
      {
        createAgent: async () => ({
          stream: async () => createStream(),
        }),
        getSessionMessages: async () => [],
      },
      {
        message: 'test',
        signal: new AbortController().signal,
        callbacks: {
          onMessage,
        },
      }
    );

    expect(onMessage).toHaveBeenCalledTimes(3);
    expect(onMessage.mock.calls[0][1][0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: '第一句',
    });
    expect(onMessage.mock.calls[1][1][0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: '第一句，继续补充',
    });
    expect(onMessage.mock.calls[2][1][0]).toMatchObject({
      id: 'assistant-2',
      role: 'assistant',
      content: '第二句',
    });
  });
});