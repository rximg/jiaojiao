/**
 * 会话元数据值对象
 */
export interface SessionMeta {
  title?: string;
  prompt?: string;
  caseId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSyncAudioAt?: string; // 最后一次同步音频的时间戳
  lastPrintAt?: string; // 最后一次打印的时间戳
}
