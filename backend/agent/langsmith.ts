/**
 * LangSmith 追踪环境初始化
 * LangChain JS 会读取 process.env 中的 LANGCHAIN_* 变量自动上报 trace。
 * 本模块在应用启动时补全默认值，便于仅配置 API Key 即可开启追踪。
 */

const DEFAULT_PROJECT = 'deepagentui';

/**
 * 是否已启用 LangSmith 追踪（已设置 LANGCHAIN_TRACING_V2=true 且有 API Key）
 */
export function isLangSmithEnabled(): boolean {
  return (
    process.env.LANGCHAIN_TRACING_V2 === 'true' &&
    !!process.env.LANGCHAIN_API_KEY
  );
}

/**
 * 初始化 LangSmith 相关环境变量。
 * - 若已设置 LANGCHAIN_API_KEY 但未设置 LANGCHAIN_TRACING_V2，则自动设为 "true"
 * - 若已启用追踪但未设置 LANGCHAIN_PROJECT，则使用默认项目名
 * 应在应用启动时调用一次（如 service-initializer 中）。
 */
export function initLangSmithEnv(): void {
  if (!process.env.LANGCHAIN_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[LangSmith] Tracing disabled (no LANGCHAIN_API_KEY in .env). See docs/langsmith.md to enable.');
    }
    return;
  }
  if (process.env.LANGCHAIN_TRACING_V2 === undefined) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
  }
  if (
    process.env.LANGCHAIN_TRACING_V2 === 'true' &&
    !process.env.LANGCHAIN_PROJECT
  ) {
    process.env.LANGCHAIN_PROJECT = DEFAULT_PROJECT;
  }
  if (isLangSmithEnabled()) {
    console.log(
      `[LangSmith] Tracing enabled, project: ${process.env.LANGCHAIN_PROJECT}`
    );
  }
}
