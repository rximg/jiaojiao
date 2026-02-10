/**
 * VL 统一入口：路径解析、读图、调用适配器、解析 lines、写 workspace
 */
import path from 'path';
import { promises as fs } from 'fs';
import { getAIConfig } from '../config.js';
import { getWorkspaceFilesystem } from '../../services/fs.js';
import type {
  GenerateScriptFromImageParams,
  GenerateScriptFromImageResult,
  ScriptLine,
  VLAIConfig,
} from '../types.js';
import { callVLDashScope } from './dashscope.js';
import { callVLZhipu } from './zhipu.js';

const DEFAULT_SESSION_ID = 'default';

function resolveImageAbsolutePath(
  imagePath: string,
  sessionId: string,
  workspaceRoot: string
): string {
  const normalized = imagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const workspacesMatch = normalized.match(/outputs\/workspaces\/([^/]+)\/(.+)$/);
  if (workspacesMatch) {
    const sid = workspacesMatch[1];
    const rel = workspacesMatch[2];
    const targetSessionId = sid === sessionId ? sessionId : sid;
    return path.join(workspaceRoot, targetSessionId, rel);
  }
  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }
  return path.join(workspaceRoot, sessionId, normalized);
}

async function readImageAsBase64(absolutePath: string): Promise<{ base64: string; mime: string }> {
  const ext = path.extname(absolutePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  const buffer = await fs.readFile(absolutePath);
  return { base64: buffer.toString('base64'), mime };
}

function parseAndValidateLines(content: string): ScriptLine[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('VL script response is not valid JSON');
  }
  if (!Array.isArray(raw)) {
    throw new Error('VL script response must be a JSON array');
  }
  const lines: ScriptLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item == null || typeof item !== 'object') {
      throw new Error(`VL script item at index ${i} must be an object`);
    }
    const text = typeof item.text === 'string' ? item.text : String(item.text ?? '');
    const x = typeof item.x === 'number' ? item.x : Number(item.x) || 0;
    const y = typeof item.y === 'number' ? item.y : Number(item.y) || 0;
    lines.push({ text, x, y });
  }
  return lines;
}

export type { GenerateScriptFromImageParams, GenerateScriptFromImageResult, ScriptLine };

/**
 * 根据配置的 provider 调用 VL，返回台词列表与可选的 scriptPath
 */
export async function generateScriptFromImage(
  params: GenerateScriptFromImageParams
): Promise<GenerateScriptFromImageResult> {
  const cfg = (await getAIConfig('vl')) as VLAIConfig;
  const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
  const { loadConfig } = await import('../../agent/config.js');
  const appConfig = await loadConfig();
  const workspaceFs2 = getWorkspaceFilesystem({ outputPath: appConfig.storage.outputPath });
  const workspaceRoot = workspaceFs2.root;

  if (!cfg.apiKey) {
    throw new Error(`VL script API key not configured (${cfg.provider})`);
  }

  const absolutePath = resolveImageAbsolutePath(params.imagePath, sessionId, workspaceRoot);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const { base64, mime } = await readImageAsBase64(absolutePath);
  const dataUrl = `data:${mime};base64,${base64}`;

  const content =
    cfg.provider === 'zhipu'
      ? await callVLZhipu({ cfg, dataUrl, prompt: cfg.prompt })
      : await callVLDashScope({ cfg, dataUrl, prompt: cfg.prompt });

  const lines = parseAndValidateLines(content);

  const imageBasename = path.basename(absolutePath, path.extname(absolutePath));
  const scriptPath = await workspaceFs2.writeFile(
    sessionId,
    `lines/${imageBasename}.json`,
    JSON.stringify(lines, null, 2),
    'utf-8'
  );

  return { lines, scriptPath, sessionId };
}
