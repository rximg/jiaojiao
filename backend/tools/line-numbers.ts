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
 * 读取 workspaces 根下的 audio_record.json（全局路径）；若不存在或为空，则 nextNumber = ttsStartNumber ?? 6000，entries = []。
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
      return { nextNumber: ttsStartNumber, entries: [] };
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
