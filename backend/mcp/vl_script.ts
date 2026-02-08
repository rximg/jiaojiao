import path from 'path';
import { promises as fs } from 'fs';
import jsyaml from 'js-yaml';
import { loadConfig } from '../agent/config';
import { DEFAULT_SESSION_ID, getWorkspaceFilesystem } from '../services/fs';

// ---------------------------------------------------------------------------
// 默认 prompt（从配置文件读取，若未配置则使用此默认值）
// ---------------------------------------------------------------------------

const FALLBACK_PROMPT = `
你是一个有声绘本台词设计师，找出图片中的元素，给每个元素设计一个台词。返回一个列表，列表里是台词和对应元素坐标，坐标原点为图片左上角。 格式为：[{"text": "台词", "x": "x坐标", "y": "y坐标"}]
例如：
[
    {"text": "一只小鸟在天上飞", "x": 100, "y": 100},
    {"text": "一只小鸟在天上飞", "x": 200, "y": 200},
]
`.trim();

// ---------------------------------------------------------------------------
// 入参 / 出参
// ---------------------------------------------------------------------------

export interface GenerateScriptFromImageParams {
  imagePath: string;
  sessionId?: string;
}

export interface ScriptLine {
  text: string;
  x: number;
  y: number;
}

export interface GenerateScriptFromImageResult {
  lines: ScriptLine[];
  scriptPath?: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// 路径解析：支持绝对路径或相对 workspace 的路径
// ---------------------------------------------------------------------------

function resolveImageAbsolutePath(
  imagePath: string,
  sessionId: string,
  workspaceRoot: string
): string {
  const normalized = imagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  
  // 形如 "outputs/workspaces/{sessionId}/..." 或 "/outputs/workspaces/..."（LLM/前端常返回）按 workspace 根解析为真实绝对路径
  const workspacesMatch = normalized.match(/outputs\/workspaces\/([^/]+)\/(.+)$/);
  if (workspacesMatch) {
    const sid = workspacesMatch[1];
    const rel = workspacesMatch[2];
    const targetSessionId = sid === sessionId ? sessionId : sid;
    return path.join(workspaceRoot, targetSessionId, rel);
  }
  
  // 已是真实绝对路径（如 C:\...\outputs\workspaces\...），直接返回（/outputs/... 已在上方按 workspace 处理）
  if (path.isAbsolute(imagePath)) {
    const normalizedAbs = imagePath.replace(/\\/g, '/');
    if (normalizedAbs.includes('workspaces/')) {
      const match = normalizedAbs.match(/workspaces\/([^/]+)\//);
      if (match && match[1] !== sessionId) {
        console.warn(`[VL script] SessionId mismatch: expected ${sessionId}, found ${match[1]} in path ${imagePath}`);
      }
    }
    return imagePath;
  }
  
  // 否则视为相对当前 session 的路径（如 images/xxx.png）
  return path.join(workspaceRoot, sessionId, normalized);
}

// ---------------------------------------------------------------------------
// 读图并转 Base64
// ---------------------------------------------------------------------------

async function readImageAsBase64(absolutePath: string): Promise<{ base64: string; mime: string }> {
  const ext = path.extname(absolutePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  const buffer = await fs.readFile(absolutePath);
  const base64 = buffer.toString('base64');
  return { base64, mime };
}

// ---------------------------------------------------------------------------
// 校验并规范化 VL 返回的 lines
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 主入口：解析配置 → 解析路径 → 读图 Base64 → 调 VL API → 解析并可选写回
// ---------------------------------------------------------------------------

export async function generateScriptFromImage(
  params: GenerateScriptFromImageParams
): Promise<GenerateScriptFromImageResult> {
  const config = await loadConfig();
  const sessionId = params.sessionId ?? DEFAULT_SESSION_ID;
  const workspaceFs = getWorkspaceFilesystem({ outputPath: config.storage.outputPath });
  const workspaceRoot = workspaceFs.root;

  // 加载 vl_script 专属配置
  let vlYaml: Record<string, unknown> = {};
  try {
    const yamlPath = path.join(process.cwd(), 'backend', 'config', 'mcp', 'vl_script_config.yaml');
    vlYaml = (jsyaml.load(await fs.readFile(yamlPath, 'utf-8')) as Record<string, unknown>) ?? {};
  } catch {
    // 使用默认
  }
  const service = vlYaml.service as Record<string, unknown> | undefined;
  const model =
    (process.env.DASHSCOPE_VL_MODEL as string) ||
    (service?.model as string) ||
    'qwen3-vl-plus';
  const baseUrl =
    (process.env.DASHSCOPE_VL_BASE_URL as string) ||
    (service?.base_url as string) ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  // 从配置文件读取 prompt，若未配置则使用默认值
  const promptFromConfig = service?.prompt as string | undefined;
  const prompt = (promptFromConfig && promptFromConfig.trim()) 
    ? promptFromConfig.trim() 
    : FALLBACK_PROMPT;

  const token = config.apiKeys.dashscope || '';
  if (!token) {
    throw new Error('VL script API key not configured (dashscope)');
  }

  const absolutePath = resolveImageAbsolutePath(params.imagePath, sessionId, workspaceRoot);
  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const { base64, mime } = await readImageAsBase64(absolutePath);
  const dataUrl = `data:${mime};base64,${base64}`;

  const chatUrl = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'image_url' as const, image_url: { url: dataUrl } },
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  };

  console.log('[VL script] calling', chatUrl, 'model:', model);

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`VL script API failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  if (content == null || typeof content !== 'string') {
    throw new Error('VL script API did not return message content');
  }

  const lines = parseAndValidateLines(content);

  // 可选：将 lines 写入 workspace 的 lines/{imageBasename}.json
  const imageBasename = path.basename(absolutePath, path.extname(absolutePath));
  const linesRelative = `lines/${imageBasename}.json`;
  const scriptPath = await workspaceFs.writeFile(
    sessionId,
    linesRelative,
    JSON.stringify(lines, null, 2),
    'utf-8'
  );

  return {
    lines,
    scriptPath,
    sessionId,
  };
}
