/**
 * 同步推理适配器基类：封装 execute 契约
 * 子类实现 _execute 完成具体 provider 调用
 */
import type { SyncInferencePort } from '#backend/domain/inference/index.js';

export abstract class SyncInferenceBase<TInput, TOutput> implements SyncInferencePort<TInput, TOutput> {
  async execute(input: TInput): Promise<TOutput> {
    return this._execute(input);
  }

  protected abstract _execute(input: TInput): Promise<TOutput>;
}
