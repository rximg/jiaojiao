/**
 * 异步推理适配器基类：封装 submit + poll 契约
 * 子类实现 _submit 与 _poll 完成具体 provider 调用
 */
import type { AsyncInferencePort } from '#backend/domain/inference/index.js';

export abstract class AsyncInferenceBase<TInput, TTaskId, TOutput>
  implements AsyncInferencePort<TInput, TTaskId, TOutput>
{
  async submit(input: TInput): Promise<TTaskId> {
    return this._submit(input);
  }

  async poll(taskId: TTaskId): Promise<TOutput> {
    return this._poll(taskId);
  }

  protected abstract _submit(input: TInput): Promise<TTaskId>;
  protected abstract _poll(taskId: TTaskId): Promise<TOutput>;
}
