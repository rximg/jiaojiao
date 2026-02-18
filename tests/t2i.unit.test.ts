import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getMultimodalPortAsync } from '../backend/infrastructure/repositories.js';
import { loadConfig } from '../backend/agent/config';

const realFetch = globalThis.fetch;

describe('T2I generateImage() [unit]', () => {
  const sessionId = 'unit-session';

  beforeEach(() => {
    // mock fetch calls for T2I:
    // 1. POST request to initiate async task -> returns task_id
    // 2. GET request(s) to poll task status -> returns SUCCEEDED with results
    // 3. GET request(s) to download image(s) -> returns image buffer
    let callCount = 0;
    // @ts-ignore
    globalThis.fetch = vi.fn(async (url: string, options?: any) => {
      callCount++;
      
      // First call: POST request to start async task
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({ output: { task_id: 'test-task-123' } }),
        } as any;
      }
      
      // Second call: GET request to poll task status (dashscope shape: output.choices[0].message.content[].image)
      if (callCount === 2) {
        return {
          ok: true,
          json: async () => ({
            output: {
              task_status: 'SUCCEEDED',
              choices: [{ message: { content: [{ type: 'image', image: 'https://example.com/fake.png' }] } }],
            },
          }),
        } as any;
      }
      
      // Subsequent calls: image download
      const encoder = new TextEncoder();
      const bytes = encoder.encode('fake image data');
      return {
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      } as any;
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('writes image file to workspace session directory', async () => {
    const port = await getMultimodalPortAsync();
    const result = await port.generateImage({ prompt: 'any', size: '1024*1024', sessionId });
    const exists = await fs
      .access(result.imagePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    expect(result.sessionId).toBe(sessionId);
    expect(result.imageUri.startsWith('file://')).toBe(true);

    const cfg = await loadConfig();
    const expectedDir = path.join(cfg.storage.outputPath, 'workspaces', sessionId, 'images');
    expect(path.resolve(result.imagePath).startsWith(path.resolve(expectedDir))).toBe(true);

    // cleanup
    await fs.unlink(result.imagePath).catch(() => {});
  });
});
