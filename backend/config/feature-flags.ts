/**
 * Feature Flags - 功能开关配置
 * 用于灰度发布和功能开关管理
 */

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number; // 灰度发布百分比 (0-100)
}

export interface FeatureFlagsConfig {
  flags: Record<string, FeatureFlag>;
}

/**
 * 默认功能开关配置
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlagsConfig = {
  flags: {
    // Phase 1: 基础功能
    'unified-runtime': {
      key: 'unified-runtime',
      enabled: true,
      description: '统一的运行时管理',
    },
    'unified-logs': {
      key: 'unified-logs',
      enabled: true,
      description: '统一的日志管理',
    },
    'persistence-service': {
      key: 'persistence-service',
      enabled: true,
      description: '持久化服务',
    },
    
    // Phase 2: HITL 增强
    'hitl-enhanced': {
      key: 'hitl-enhanced',
      enabled: false,
      rolloutPercentage: 0,
      description: '增强的 HITL 系统',
    },
    'hitl-file-operations': {
      key: 'hitl-file-operations',
      enabled: false,
      description: 'HITL 文件操作确认',
    },
    'hitl-network-operations': {
      key: 'hitl-network-operations',
      enabled: false,
      description: 'HITL 网络操作确认',
    },
    
    // Phase 3: Workspace 增强
    'workspace-quotas': {
      key: 'workspace-quotas',
      enabled: false,
      description: '工作空间资源配额',
    },
    'workspace-permissions': {
      key: 'workspace-permissions',
      enabled: false,
      description: '工作空间权限管理',
    },
    
    // Phase 4: 审计与监控
    'audit-logging': {
      key: 'audit-logging',
      enabled: false,
      rolloutPercentage: 0,
      description: '审计日志',
    },
    'performance-monitoring': {
      key: 'performance-monitoring',
      enabled: false,
      description: '性能监控',
    },
    'resource-monitoring': {
      key: 'resource-monitoring',
      enabled: false,
      description: '资源监控',
    },
    
    // Phase 5: 高级功能
    'multi-session': {
      key: 'multi-session',
      enabled: false,
      description: '多会话管理',
    },
    'session-isolation': {
      key: 'session-isolation',
      enabled: false,
      description: '会话隔离增强',
    },
    
    // 实验性功能
    'experimental-ai-tools': {
      key: 'experimental-ai-tools',
      enabled: false,
      rolloutPercentage: 0,
      description: '实验性 AI 工具',
    },
    'experimental-parallel-execution': {
      key: 'experimental-parallel-execution',
      enabled: false,
      description: '实验性并行执行',
    },
  },
};

/**
 * 检查功能是否启用
 */
export function isFeatureEnabled(
  flagKey: string,
  config: FeatureFlagsConfig = DEFAULT_FEATURE_FLAGS
): boolean {
  const flag = config.flags[flagKey];
  
  if (!flag) {
    console.warn(`[FeatureFlags] Unknown flag: ${flagKey}`);
    return false;
  }
  
  // 如果完全启用，直接返回
  if (flag.enabled) {
    return true;
  }
  
  // 如果设置了灰度发布百分比
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage > 0) {
    const random = Math.random() * 100;
    return random < flag.rolloutPercentage;
  }
  
  return false;
}

/**
 * 批量检查多个功能是否启用
 */
export function areFeaturesEnabled(
  flagKeys: string[],
  config: FeatureFlagsConfig = DEFAULT_FEATURE_FLAGS
): boolean {
  return flagKeys.every(key => isFeatureEnabled(key, config));
}

/**
 * 获取所有启用的功能
 */
export function getEnabledFeatures(
  config: FeatureFlagsConfig = DEFAULT_FEATURE_FLAGS
): string[] {
  return Object.keys(config.flags).filter(key => isFeatureEnabled(key, config));
}

/**
 * 动态更新功能开关
 */
export function updateFeatureFlag(
  flagKey: string,
  updates: Partial<FeatureFlag>,
  config: FeatureFlagsConfig = DEFAULT_FEATURE_FLAGS
): void {
  if (!config.flags[flagKey]) {
    console.warn(`[FeatureFlags] Cannot update unknown flag: ${flagKey}`);
    return;
  }
  
  Object.assign(config.flags[flagKey], updates);
  console.log(`[FeatureFlags] Updated ${flagKey}:`, config.flags[flagKey]);
}
