/**
 * 同步推理端口：一次请求直接返回结果（仅 endpoint，无 taskEndpoint）
 */
export interface SyncInferencePort<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
