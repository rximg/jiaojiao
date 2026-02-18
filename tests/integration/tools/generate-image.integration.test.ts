/**
 * Tools 层：generate_image（MultimodalPort.generateImage）集成测试
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { getMultimodalPortAsync } from '../../../backend/infrastructure/repositories.js';
import { loadConfig } from '../../../backend/app-config';
import { getWorkspaceFilesystem, resolveWorkspaceRoot } from '../../../backend/services/fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const testProvider = process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope' ? process.env.TEST_API_PROVIDER : undefined;
let hasKey = false;
const createdFiles: string[] = [];

function debugLog(msg: string) {
  try {
    require('fs').appendFileSync(path.join(__dirname, '..', '..', '.integration-debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

describe('Tools / generate_image', () => {
  const sessionId = 'default';

  beforeAll(async () => {
    try {
      const config = await loadConfig();
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!((config.apiKeys as Record<string, string>)[provider]?.trim());
      debugLog(`[T2I] runIntegration=${runIntegration} hasKey=${hasKey}`);
    } catch {
      hasKey = false;
    }
  });

  afterAll(() => {
    if (createdFiles.length > 0) {
      console.log('\n✅ Generated image files:', ...createdFiles);
    }
  });

  it('should generate an image from prompt file', async (ctx) => {
    if (!hasKey || !runIntegration) ctx.skip();
    const workspaceFs = getWorkspaceFilesystem();
    await workspaceFs.writeFile(sessionId, 'image_prompt.txt', 'A cute cartoon cat on a sunny windowsill.', 'utf-8');
    const port = await getMultimodalPortAsync();
    const result = await port.generateImage({
      prompt: { fromFile: 'image_prompt.txt' },
      size: '1024*1024',
      sessionId,
    });

    createdFiles.push(result.imagePath);
    await expect(fs.access(result.imagePath).then(() => true).catch(() => false)).resolves.toBe(true);
    const expectedDir = path.join(resolveWorkspaceRoot(), sessionId, 'images');
    expect(path.resolve(result.imagePath).startsWith(path.resolve(expectedDir))).toBe(true);
  }, 120_000);
});
