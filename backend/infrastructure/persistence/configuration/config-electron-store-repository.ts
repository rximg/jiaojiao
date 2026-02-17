/**
 * 配置仓储实现：基于 electron-store（app-config）
 */
import { loadConfig, saveConfig } from '#backend/app-config.js';
import type { ConfigRepository } from '#backend/domain/configuration/repositories/config-repository.js';

export class ConfigElectronStoreRepository implements ConfigRepository {
  async getAppConfig(): Promise<unknown> {
    return loadConfig();
  }

  async setAppConfig(config: Record<string, unknown>): Promise<void> {
    await saveConfig(config as Parameters<typeof saveConfig>[0]);
  }
}
