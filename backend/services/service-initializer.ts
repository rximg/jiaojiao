/**
 * Service Initializer - 初始化所有核心服务
 * 应用启动时调用。不依赖 agent 模块，由调用方传入 outputPath 并自行完成 LangSmith 等初始化。
 */

import { WorkspaceFilesystem, resolveWorkspaceRoot } from './fs.js';
import { PersistenceService } from './persistence-service.js';
import { getLogManager } from './log-manager.js';
import { initRuntimeManager } from './runtime-manager.js';

let initialized = false;

export interface InitializeServicesOptions {
  /** 存储根路径（如 ./outputs），不传则使用 process.cwd() + outputs */
  outputPath?: string;
}

/**
 * 初始化所有服务
 * 应在应用启动时调用一次。调用方需自行执行 initLangSmithEnv()、loadConfig() 等，再将 config.storage.outputPath 传入。
 */
export async function initializeServices(options?: InitializeServicesOptions): Promise<void> {
  if (initialized) {
    console.log('[ServiceInit] Services already initialized');
    return;
  }

  console.log('[ServiceInit] Initializing core services...');

  try {
    // 由调用方传入 outputPath，避免 services 依赖 agent/config
    const rootDir = resolveWorkspaceRoot(options?.outputPath);
    const workspaceService = new WorkspaceFilesystem(rootDir);
    console.log('[ServiceInit] ✓ WorkspaceFilesystem initialized');

    // 初始化 PersistenceService
    const persistenceService = new PersistenceService(workspaceService);
    console.log('[ServiceInit] ✓ PersistenceService initialized');

    // 初始化 LogManager
    const logManager = getLogManager();
    console.log('[ServiceInit] ✓ LogManager initialized');

    // 初始化 RuntimeManager
    initRuntimeManager(workspaceService, persistenceService, logManager);
    console.log('[ServiceInit] ✓ RuntimeManager initialized');

    // 记录系统启动日志
    await logManager.logSystem('info', 'DeepAgentUI services initialized successfully');

    initialized = true;
    console.log('[ServiceInit] ✅ All services initialized successfully');
  } catch (error) {
    console.error('[ServiceInit] ❌ Failed to initialize services:', error);
    throw error;
  }
}

/**
 * 清理所有服务
 * 应在应用关闭时调用
 */
export async function shutdownServices(): Promise<void> {
  if (!initialized) {
    return;
  }

  console.log('[ServiceInit] Shutting down services...');

  try {
    const logManager = getLogManager();
    
    // 记录系统关闭日志
    await logManager.logSystem('info', 'DeepAgentUI shutting down');

    // RuntimeManager 会自动清理
    console.log('[ServiceInit] ✓ Services shutdown complete');
    
    initialized = false;
  } catch (error) {
    console.error('[ServiceInit] Error during shutdown:', error);
  }
}
