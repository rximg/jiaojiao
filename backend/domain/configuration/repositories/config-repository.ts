/**
 * 配置仓储接口
 * AppConfig 类型由前端 types 定义，此处使用泛型或 unknown 避免循环依赖
 */
export interface ConfigRepository {
  getAppConfig(): Promise<unknown>;
  setAppConfig(config: Record<string, unknown>): Promise<void>;
}
