import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { generateImage } from '../backend/mcp/t2i';
import { loadConfig } from '../backend/agent/config';

const hasKey = !!process.env.DASHSCOPE_API_KEY;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

const createdFiles: string[] = [];

describe('T2I generateImage()', () => {
  const sessionId = 'integration-session';

  beforeAll(() => {
    if (!hasKey) {
      // eslint-disable-next-line no-console
      console.warn('Skipping T2I test: missing DASHSCOPE_API_KEY');
    }
  });

  afterAll(async () => {
    // Print generated files for inspection
    if (createdFiles.length > 0) {
      // eslint-disable-next-line no-console
      console.log('\n✅ Generated image files:');
      for (const file of createdFiles) {
        // eslint-disable-next-line no-console
        console.log(`   ${file}`);
      }
    }
    // Note: files are preserved for inspection. Uncomment below to clean up:
    // for (const file of createdFiles) {
    //   try {
    //     await fs.unlink(file);
    //   } catch {}
    // }
  });

  it.skipIf(!hasKey || !runIntegration)('should generate an image file', async () => {
    const result = await generateImage({ prompt: 'A cute cartoon cat', size: '1024*1024', sessionId });

    // record for cleanup
    createdFiles.push(result.imagePath);

    const exists = await fs
      .access(result.imagePath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);

    const cfg = await loadConfig();
    const expectedDir = path.join(cfg.storage.outputPath, 'workspaces', sessionId, 'images');
    expect(result.imagePath.startsWith(path.resolve(expectedDir))).toBe(true);
  }, 120_000);
});
