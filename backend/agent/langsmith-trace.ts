/**
 * LangSmith 自定义 Run 记录：MCP/AI 层调用（除 LLM 外）的输入/输出写入 LangSmith，
 * 与当前 LangChain Run 形成父子链。Blob 数据仅记录描述信息（路径、格式、条数等），不记录原始内容。
 */
import { randomUUID } from 'crypto';
import { isLangSmithEnabled } from './langsmith.js';

const MAX_PROMPT_CHARS = 500;
const DEFAULT_PROJECT = 'deepagentui';

function truncate(str: string, max = MAX_PROMPT_CHARS): string {
  if (typeof str !== 'string') return String(str);
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

/**
 * 对写入 LangSmith 的 inputs 做精简：长文本截断、不包含 base64/大 buffer。
 */
export function sanitizeInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputs)) {
    if (v === undefined) continue;
    if (typeof v === 'string' && (v.startsWith('data:') || v.length > 2000)) {
      out[k] = k === 'prompt' ? truncate(v) : '[omitted blob or long string]';
      continue;
    }
    if (typeof v === 'string') out[k] = truncate(v, 1000);
    else if (Array.isArray(v)) out[k] = v.length;
    else out[k] = v;
  }
  return out;
}

type RunLike = { id?: string };

/**
 * 执行异步函数并（在启用 LangSmith 时）将本次调用记为当前 Run 的子 Run，记录精简的 inputs/outputs。
 * 不记录 blob 原始数据，仅记录描述信息（路径、格式、条数等）。
 * LangSmith Client.createRun 返回 void，故自生成 id 用于后续 updateRun。
 */
export async function traceAiRun<T>(
  name: string,
  runType: string,
  inputs: Record<string, unknown>,
  fn: () => Promise<T>,
  sanitizeOutput: (result: T) => Record<string, unknown>
): Promise<T> {
  if (!isLangSmithEnabled()) {
    return fn();
  }

  let getCurrentRunTree: (() => RunLike | undefined) | null = null;
  let client: { createRun: (run: unknown) => Promise<void>; updateRun: (id: string, run: unknown) => Promise<void> };
  try {
    const traceable = await import('langsmith/traceable');
    const clientModule = await import('langsmith/client');
    getCurrentRunTree = () => {
      try {
        return traceable.getCurrentRunTree(true) as RunLike | undefined;
      } catch {
        return undefined;
      }
    };
    client = new clientModule.Client() as typeof client;
  } catch {
    return fn();
  }

  const parentRun = getCurrentRunTree?.();
  const projectName = process.env.LANGCHAIN_PROJECT ?? DEFAULT_PROJECT;
  const runId = randomUUID();

  await client.createRun({
    id: runId,
    name,
    run_type: runType,
    inputs: sanitizeInputs(inputs),
    parent_run_id: parentRun?.id ?? undefined,
    project_name: projectName,
    tags: ['mcp', runType],
  });

  try {
    const result = await fn();
    await client.updateRun(runId, {
      outputs: sanitizeOutput(result),
      status: 'success',
    });
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await client.updateRun(runId, {
      outputs: { error: errMsg },
      status: 'error',
      error: errMsg,
    }).catch(() => {});
    throw error;
  }
}
