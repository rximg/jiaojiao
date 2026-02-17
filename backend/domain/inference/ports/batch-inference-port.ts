/**
 * 批量推理端口：一次处理多个输入
 */
export interface BatchInferencePort<TInput, TOutput> {
  executeBatch(inputs: TInput[]): Promise<TOutput[]>;
}
