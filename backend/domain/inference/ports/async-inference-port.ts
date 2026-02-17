/**
 * 异步推理端口：submit + poll 模式
 */
export interface AsyncInferencePort<TInput, TTaskId, TOutput> {
  submit(input: TInput): Promise<TTaskId>;
  poll(taskId: TTaskId): Promise<TOutput>;
}
