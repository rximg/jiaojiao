/**
 * WorkspaceCheckpointSaver - 基于 BaseCheckpointSaver，将 LangGraph checkpoint 按 thread_id（sessionId）存到 session/checkpoints/ 目录。
 * 复用了 LangGraph/deepagents 的 checkpoint 核心机制，持久化层使用项目现有的 WorkspaceFilesystem。
 */

import {
  BaseCheckpointSaver,
  copyCheckpoint,
  getCheckpointId,
  WRITES_IDX_MAP,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type ChannelVersions,
} from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { WorkspaceFilesystem } from './fs.js';

const CHECKPOINTS_DIR = 'checkpoints';

/** Windows 不允许在路径段中使用 : * ? " < > |，此处统一替换为 _，仅用于磁盘路径。 */
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[:*?"<>|]/g, '_');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(u8: Uint8Array): string {
  let out = '';
  const len = u8.length;
  for (let i = 0; i < len; i += 3) {
    const a = u8[i]!;
    const b = i + 1 < len ? u8[i + 1]! : 0;
    const c = i + 2 < len ? u8[i + 2]! : 0;
    out += B64[a >>> 2] + B64[((a & 3) << 4) | (b >>> 4)] + (i + 1 < len ? B64[((b & 15) << 2) | (c >>> 6)] : '=') + (i + 2 < len ? B64[c & 63] : '=');
  }
  return out;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const B = (globalThis as unknown as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B) return new Uint8Array(B.from(base64, 'base64'));
  const bin = atob(base64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

interface StoredCheckpoint {
  parentCheckpointId?: string;
  checkpointBase64: string;
  metadataBase64: string;
}

interface StoredWrite {
  taskId: string;
  channel: string;
  valueBase64: string;
}

/** 当 LangGraph 内部调用 putWrites 时可能只传 checkpoint_ns/checkpoint_id 不传 thread_id，用此映射回退 */
const threadIdByCheckpointKey = new Map<string, string>();
/** 首次 getTuple 会带上 thread_id，putWrites 可能不带，用此作回退（单 run 场景） */
let lastGetTupleThreadId: string | undefined;

function checkpointKey(ns: string, cid: string): string {
  return `${ns}:${cid}`;
}

export class WorkspaceCheckpointSaver extends BaseCheckpointSaver {
  /** 当 LangGraph 子节点未传 thread_id 时使用（与 createMainAgent(sessionId) 一致） */
  constructor(
    private workspace: WorkspaceFilesystem,
    serde?: InstanceType<typeof BaseCheckpointSaver>['serde'],
    private defaultThreadId?: string
  ) {
    super(serde);
  }

  private relPath(relativePath: string): string {
    return `${CHECKPOINTS_DIR}/${relativePath}`.replace(/\/+/g, '/');
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    if (threadId !== undefined) lastGetTupleThreadId = threadId;
    if (threadId === undefined) return undefined;

    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    let checkpointId = getCheckpointId(config);

    const readOne = async (cid: string): Promise<CheckpointTuple | undefined> => {
      const filePath = this.relPath(`${sanitizePathSegment(checkpointNs)}/${sanitizePathSegment(cid)}.json`);
      let raw: string;
      try {
        raw = (await this.workspace.readFile(threadId, filePath, 'utf-8')) as string;
      } catch {
        return undefined;
      }
      const stored: StoredCheckpoint = JSON.parse(raw);
      const checkpointBuf = base64ToUint8Array(stored.checkpointBase64);
      const metadataBuf = base64ToUint8Array(stored.metadataBase64);
      const deserializedCheckpoint = await this.serde.loadsTyped('json', checkpointBuf);
      const metadata = await this.serde.loadsTyped('json', metadataBuf);

      const writesPath = this.relPath(`${sanitizePathSegment(checkpointNs)}/${sanitizePathSegment(cid)}_writes.json`);
      let pendingWrites: CheckpointTuple['pendingWrites'] = [];
      try {
        const writesRaw = (await this.workspace.readFile(threadId, writesPath, 'utf-8')) as string;
        const writesMap: Record<string, StoredWrite> = JSON.parse(writesRaw);
        pendingWrites = await Promise.all(
          Object.values(writesMap).map(async (w) => [
            w.taskId,
            w.channel,
            await this.serde.loadsTyped('json', base64ToUint8Array(w.valueBase64)),
          ] as CheckpointTuple['pendingWrites'] extends (infer E)[] ? E : never)
        );
      } catch {
        // no writes file is ok
      }

      const checkpointTuple: CheckpointTuple = {
        config: { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: (deserializedCheckpoint as Checkpoint & { id?: string }).id ?? cid } },
        checkpoint: deserializedCheckpoint,
        metadata,
        pendingWrites: pendingWrites ?? [],
      };
      if (stored.parentCheckpointId !== undefined) {
        checkpointTuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: stored.parentCheckpointId,
          },
        };
      }
      return checkpointTuple;
    };

    if (checkpointId) {
      threadIdByCheckpointKey.set(checkpointKey(checkpointNs, checkpointId), threadId);
      return readOne(checkpointId);
    }

    // list latest: list files in checkpoints/{ns}/ and take latest by id (uuid sort)
    const listPath = this.relPath(sanitizePathSegment(checkpointNs));
    let entries: { name: string }[];
    try {
      entries = await this.workspace.ls(threadId, listPath);
    } catch {
      return undefined;
    }
    const ids = entries
      .filter((e) => e.name.endsWith('.json') && !e.name.endsWith('_writes.json'))
      .map((e) => e.name.replace(/\.json$/, ''));
    if (ids.length === 0) return undefined;
    ids.sort((a, b) => b.localeCompare(a));
    return readOne(ids[0]);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) return;

    const { before, limit, filter } = options ?? {};
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const listPath = this.relPath(sanitizePathSegment(checkpointNs));
    let entries: { name: string }[];
    try {
      entries = await this.workspace.ls(threadId, listPath);
    } catch {
      return;
    }
    let ids = entries
      .filter((e) => e.name.endsWith('.json') && !e.name.endsWith('_writes.json'))
      .map((e) => e.name.replace(/\.json$/, ''));
    ids.sort((a, b) => b.localeCompare(a));

    if (before?.configurable?.checkpoint_id) {
      const beforeId = before.configurable.checkpoint_id;
      ids = ids.filter((id) => id < beforeId);
    }
    let count = 0;
    for (const cid of ids) {
      if (limit !== undefined && count >= limit) break;
      const tuple = await this.getTuple({
        configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: cid },
      });
      if (!tuple) continue;
      if (filter && Object.entries(filter).some(([k, v]) => (tuple.metadata as Record<string, unknown>)?.[k] !== v))
        continue;
      count += 1;
      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    let threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const parentCheckpointId = config.configurable?.checkpoint_id;
    if (threadId === undefined && parentCheckpointId !== undefined) {
      threadId = threadIdByCheckpointKey.get(checkpointKey(checkpointNs, parentCheckpointId));
    }
    if (threadId === undefined) {
      threadId = lastGetTupleThreadId;
    }
    if (threadId === undefined) {
      threadId = this.defaultThreadId;
    }
    if (threadId === undefined) {
      throw new Error('Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.');
    }

    const prepared = copyCheckpoint(checkpoint);
    const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(prepared),
      this.serde.dumpsTyped(metadata),
    ]);

    const stored: StoredCheckpoint = {
      parentCheckpointId: config.configurable?.checkpoint_id,
      checkpointBase64: uint8ArrayToBase64(serializedCheckpoint as Uint8Array),
      metadataBase64: uint8ArrayToBase64(serializedMetadata as Uint8Array),
    };
    const filePath = this.relPath(`${sanitizePathSegment(checkpointNs)}/${sanitizePathSegment(checkpoint.id)}.json`);
    await this.workspace.writeFile(
      threadId,
      filePath,
      JSON.stringify(stored, null, 0),
      'utf-8'
    );
    threadIdByCheckpointKey.set(checkpointKey(checkpointNs, checkpoint.id), threadId);

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: [string, unknown][], taskId: string): Promise<void> {
    let threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    const checkpointId = config.configurable?.checkpoint_id;
    if (threadId === undefined && checkpointId !== undefined) {
      threadId = threadIdByCheckpointKey.get(checkpointKey(checkpointNs, checkpointId));
    }
    if (threadId === undefined) {
      threadId = lastGetTupleThreadId;
    }
    if (threadId === undefined) {
      threadId = this.defaultThreadId;
    }
    if (threadId === undefined) {
      throw new Error('Failed to put writes. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.');
    }
    if (checkpointId === undefined) {
      throw new Error('Failed to put writes. The passed RunnableConfig is missing a required "checkpoint_id" field in its "configurable" property.');
    }

    const writesPath = this.relPath(`${sanitizePathSegment(checkpointNs ?? '')}/${sanitizePathSegment(checkpointId)}_writes.json`);
    let existing: Record<string, StoredWrite> = {};
    try {
      const raw = (await this.workspace.readFile(threadId, writesPath, 'utf-8')) as string;
      existing = JSON.parse(raw);
    } catch {
      // new file
    }

    for (let idx = 0; idx < writes.length; idx++) {
      const [channel, value] = writes[idx];
      const innerKey = [taskId, WRITES_IDX_MAP[channel] ?? idx];
      const innerKeyStr = `${innerKey[0]},${innerKey[1]}`;
      if (Number(innerKey[1]) >= 0 && innerKeyStr in existing) continue;
      const [, serializedValue] = await this.serde.dumpsTyped(value);
      existing[innerKeyStr] = {
        taskId,
        channel,
        valueBase64: uint8ArrayToBase64(serializedValue as Uint8Array),
      };
    }

    await this.workspace.writeFile(
      threadId,
      writesPath,
      JSON.stringify(existing, null, 0),
      'utf-8'
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    try {
      await this.workspace.rm(threadId, CHECKPOINTS_DIR);
    } catch {
      // ignore if dir missing
    }
  }
}
