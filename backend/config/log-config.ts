/**
 * Log Configuration
 * 日志系统配置
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRotationConfig {
  enabled: boolean;
  maxSize: number;       // 单个日志文件最大大小（字节）
  maxFiles: number;      // 保留的日志文件数量
  compressOld: boolean;  // 是否压缩旧日志文件
}

export interface LogConfig {
  // 日志级别
  level: LogLevel;
  
  // 日志根目录
  logDir: string;
  
  // 各类日志的配置
  llm: {
    enabled: boolean;
    level: LogLevel;
    rotation: LogRotationConfig;
  };
  
  audit: {
    enabled: boolean;
    level: LogLevel;
    rotation: LogRotationConfig;
  };
  
  hitl: {
    enabled: boolean;
    level: LogLevel;
    rotation: LogRotationConfig;
  };
  
  system: {
    enabled: boolean;
    level: LogLevel;
    rotation: LogRotationConfig;
    consoleOutput: boolean;  // 是否同时输出到控制台
  };
  
  // 清理策略
  cleanup: {
    enabled: boolean;
    keepDays: number;         // 保留天数
    checkIntervalHours: number; // 检查间隔（小时）
  };
  
  // 性能配置
  performance: {
    asyncWrite: boolean;      // 异步写入
    bufferSize: number;       // 缓冲区大小
    flushInterval: number;    // 刷新间隔（毫秒）
  };
}

/**
 * 默认日志配置
 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  level: 'info',
  logDir: './logs',
  
  llm: {
    enabled: true,
    level: 'info',
    rotation: {
      enabled: true,
      maxSize: 50 * 1024 * 1024,  // 50MB
      maxFiles: 10,
      compressOld: true,
    },
  },
  
  audit: {
    enabled: true,
    level: 'info',
    rotation: {
      enabled: true,
      maxSize: 100 * 1024 * 1024,  // 100MB
      maxFiles: 30,
      compressOld: true,
    },
  },
  
  hitl: {
    enabled: true,
    level: 'info',
    rotation: {
      enabled: true,
      maxSize: 20 * 1024 * 1024,  // 20MB
      maxFiles: 10,
      compressOld: false,
    },
  },
  
  system: {
    enabled: true,
    level: 'info',
    rotation: {
      enabled: true,
      maxSize: 50 * 1024 * 1024,  // 50MB
      maxFiles: 7,
      compressOld: true,
    },
    consoleOutput: true,
  },
  
  cleanup: {
    enabled: true,
    keepDays: 30,
    checkIntervalHours: 24,
  },
  
  performance: {
    asyncWrite: true,
    bufferSize: 1024 * 1024,  // 1MB
    flushInterval: 5000,      // 5秒
  },
};

/**
 * 开发环境日志配置
 */
export const DEV_LOG_CONFIG: LogConfig = {
  ...DEFAULT_LOG_CONFIG,
  level: 'debug',
  system: {
    ...DEFAULT_LOG_CONFIG.system,
    level: 'debug',
    consoleOutput: true,
  },
  performance: {
    ...DEFAULT_LOG_CONFIG.performance,
    asyncWrite: false,  // 开发环境使用同步写入，便于调试
  },
};

/**
 * 生产环境日志配置
 */
export const PROD_LOG_CONFIG: LogConfig = {
  ...DEFAULT_LOG_CONFIG,
  level: 'warn',
  system: {
    ...DEFAULT_LOG_CONFIG.system,
    level: 'warn',
    consoleOutput: false,
  },
};

/**
 * 根据环境获取日志配置
 */
export function getLogConfig(): LogConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return PROD_LOG_CONFIG;
    case 'development':
    default:
      return DEV_LOG_CONFIG;
  }
}

/**
 * 检查日志级别是否应该记录
 */
export function shouldLog(
  messageLevel: LogLevel,
  configLevel: LogLevel = 'info'
): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const messageLevelIndex = levels.indexOf(messageLevel);
  const configLevelIndex = levels.indexOf(configLevel);
  
  return messageLevelIndex >= configLevelIndex;
}
