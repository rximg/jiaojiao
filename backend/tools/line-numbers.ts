import { getWorkspaceFilesystem } from '../services/fs.js';

export interface LineNumberEntry {
  number: number;
  sessionId: string;
  relativePath: string;
  text: string;
}

export interface LineNumbersData {
  nextNumber: number;
  entries: LineNumberEntry[];
}

/** 全局文件：位于 workspaces 根下，与 session 无关 */
const AUDIO_RECORD_FILENAME = 'audio_record.json';

/**
 * 读取 workspaces 根下的 audio_record.json（全局路径）；若不存在或为空，则初始化并返回默认值。
 * 懒初始化：若文件不存在，自动创建初始结构，避免后续 appendEntries 写入失败。
 */
export async function readLineNumbers(ttsStartNumber: number = 6000): Promise<LineNumbersData> {
  const workspace = getWorkspaceFilesystem();
  try {
    const raw = await workspace.readFile(null, AUDIO_RECORD_FILENAME, 'utf-8');
    const data = JSON.parse(raw as string) as Partial<LineNumbersData>;
    const fileNext = typeof data.nextNumber === 'number' ? data.nextNumber : ttsStartNumber;
    const nextNumber = Math.max(fileNext, ttsStartNumber);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return { nextNumber, entries };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      // 懒初始化：文件不存在时，直接创建初始结构（避免后续追加时失败）
      const initial: LineNumbersData = { nextNumber: ttsStartNumber, entries: [] };
      try {
        await workspace.writeFileAtomic(null, AUDIO_RECORD_FILENAME, JSON.stringify(initial, null, 2), 'utf-8');
      } catch {
        // 如果初始化写入失败（权限、目录问题等），仍然返回内存对象，让调用方继续
      }
      return initial;
    }
    if (typeof (err as Error).message === 'string' && (err as Error).message.includes('JSON')) {
      return { nextNumber: ttsStartNumber, entries: [] };
    }
    throw err;
  }
}

/**
 * 原子写入 workspaces 根下的 audio_record.json（全局路径）。
 */
export async function writeLineNumbers(data: LineNumbersData): Promise<void> {
  const workspace = getWorkspaceFilesystem();
  await workspace.writeFileAtomic(null, AUDIO_RECORD_FILENAME, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 预留下一段连续编号 [start, start+count)，并返回这些编号；不写文件。
 * 调用方在 TTS 全部成功后应调用 appendEntries 写回。
 */
export async function getNextNumbers(
  count: number,
  ttsStartNumber: number = 6000
): Promise<{ start: number; numbers: number[] }> {
  const { nextNumber } = await readLineNumbers(ttsStartNumber);
  const numbers = Array.from({ length: count }, (_, i) => nextNumber + i);
  return { start: nextNumber, numbers };
}

/**
 * 追加 entries 并更新 nextNumber（nextNumber += entries.length），原子写回。
 */
export async function appendEntries(
  newEntries: LineNumberEntry[],
  ttsStartNumber: number = 6000
): Promise<void> {
  const current = await readLineNumbers(ttsStartNumber);
  const nextNumber = current.nextNumber + newEntries.length;
  const entries = [...current.entries, ...newEntries];
  await writeLineNumbers({ nextNumber, entries });
}
