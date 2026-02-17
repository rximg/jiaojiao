/**
 * LLM 回调：详细追踪由 LangSmith 负责，此处不再输出冗余日志。
 * 仅保留 handleLLMError 用于未接入 LangSmith 时的错误提示。
 */
export interface DebugConfig {
  log_llm_calls?: boolean;
  save_llm_calls?: boolean;
}

export function createLLMCallbacks(_debugConfig?: DebugConfig) {
  return {
    handleLLMStart(_opts: any) {
      // LangSmith 已覆盖 LLM trace，不输出
    },

    handleLLMEnd(_output: any, _runId?: string) {
      // LangSmith 已覆盖 LLM trace，不输出
    },

    handleLLMError(err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[LLM] error', msg);
    },
  };
}
