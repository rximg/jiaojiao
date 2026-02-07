/**
 * LLM 回调：仅保留简短关键信息，详细追踪由 LangSmith 负责。
 */
export interface DebugConfig {
  log_llm_calls?: boolean;
  save_llm_calls?: boolean;
}

export function createLLMCallbacks(_debugConfig?: DebugConfig) {
  return {
    handleLLMStart({ name }: any) {
      console.log('[LLM] start', name ?? 'llm');
    },

    handleLLMEnd(_output: any, runId?: string) {
      if (runId) console.log('[LLM] end', runId);
    },

    handleLLMError(err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[LLM] error', msg);
    },
  };
}
