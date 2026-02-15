import path from 'path';
import { promises as fs } from 'fs';
import { getWorkspaceBase } from '../services/fs.js';

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

/** 工作目录固定为 userData/workspace，录音记录文件位于 workspaceBase/workspaces/audio_record.json */
const AUDIO_RECORD_FILENAME = 'audio_record.json';
const WORKSPACES_DIRNAME = 'workspaces';

function getAudioRecordPath(): string {
  const base = getWorkspaceBase();
  return path.join(base, WORKSPACES_DIRNAME, AUDIO_RECORD_FILENAME);
}

/**
 * 读取工作目录下的 audio_record.json；若不存在或为空，则 nextNumber = ttsStartNumber ?? 6000，entries = []。
 */
export async function readLineNumbers(ttsStartNumber: number = 6000): Promise<LineNumbersData> {
  const filePath = getAudioRecordPath();
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as Partial<LineNumbersData>;
    const fileNext = typeof data.nextNumber === 'number' ? data.nextNumber : ttsStartNumber;
    // 取 max，使界面调高「TTS 起始编号」后下次生成会从新起始值开始
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
 * 原子写入工作目录下的 audio_record.json（先写临时文件再重命名）。
 */
export async function writeLineNumbers(data: LineNumbersData): Promise<void> {
  const filePath = getAudioRecordPath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
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
