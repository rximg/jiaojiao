import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { generateImage } from '../backend/mcp/t2i';
import { loadConfig, lastLoadedConfigPath } from '../backend/app-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
/** 集成测试时指定只测某方：zhipu | dashscope，未设置时用应用配置的 provider */
const testProvider = (process.env.TEST_API_PROVIDER === 'zhipu' || process.env.TEST_API_PROVIDER === 'dashscope')
  ? process.env.TEST_API_PROVIDER
  : undefined;
let hasKey = false;

const createdFiles: string[] = [];

function logKeyStatus(apiKeys: { dashscope?: string; zhipu?: string }): string {
  const ds = apiKeys.dashscope?.trim();
  const zp = apiKeys.zhipu?.trim();
  return `dashscope: ${ds ? `已配置(len=${ds.length})` : '未配置'}, zhipu: ${zp ? `已配置(len=${zp.length})` : '未配置'}`;
}

function debugLog(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
  try {
    const fs = require('fs');
    const logPath = path.join(__dirname, '.integration-debug.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore
  }
}

describe('T2I generateImage()', () => {
  const sessionId = 'default';

  beforeAll(async () => {
    debugLog(`[T2I] RUN_INTEGRATION_TESTS=${runIntegration} TEST_API_PROVIDER=${process.env.TEST_API_PROVIDER ?? '(未设置)'}`);
    try {
      const config = await loadConfig();
      const apiKeys = config.apiKeys as { dashscope?: string; zhipu?: string };
      const provider = (testProvider ?? config.agent?.provider ?? 'dashscope') as 'dashscope' | 'zhipu';
      hasKey = !!(apiKeys[provider]?.trim());
      debugLog(`[T2I] 配置文件路径: ${lastLoadedConfigPath ?? '(未使用文件)'}`);
      debugLog(`[T2I] config.agent.provider=${config.agent?.provider} -> 使用 provider=${provider} hasKey=${hasKey} | ${logKeyStatus(apiKeys)}`);
    } catch (err) {
      hasKey = false;
      debugLog(`[T2I] loadConfig 失败: ${(err as Error).message}`);
    }
    if (!hasKey) {
      debugLog(`[T2I] Skipping (provider=${testProvider ?? 'config'}): 请在应用设置中配置对应 API Key`);
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

  it('should generate an image file', async (ctx) => {
    if (!hasKey || !runIntegration) {
      ctx.skip();
    }
    const result = await generateImage({ 
      prompt: 'A cute cartoon cat', 
      size: '1024*1024', 
      model: 'wanx-v1',
      sessionId 
    });

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

  it('should generate an image from prompt file', async (ctx) => {
    if (!hasKey || !runIntegration) {
      ctx.skip();
    }
    // Use promptFile parameter to read from file
    const result = await generateImage({ 
      promptFile: 'image_prompt.txt',
      size: '1024*1024', 
      model: 'wan2.6-t2i',
      sessionId 
    });

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
