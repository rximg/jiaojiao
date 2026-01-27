/**
 * Workspace Configuration
 * 定义工作空间资源配额和权限
 */

export interface ResourceQuota {
  maxFileSize: number;      // 单个文件最大大小（字节）
  maxTotalSize: number;     // 工作空间总大小限制（字节）
  maxFileCount: number;     // 最大文件数量
  maxDirectoryDepth: number; // 最大目录深度
}

export interface WorkspacePermissions {
  allowedPaths: string[];    // 允许访问的路径（白名单）
  blockedPaths: string[];    // 禁止访问的路径（黑名单）
  allowedExtensions: string[]; // 允许的文件扩展名
  blockedExtensions: string[]; // 禁止的文件扩展名
  
  // 操作权限
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExecute: boolean;
}

export interface WorkspaceConfig {
  quotas: ResourceQuota;
  permissions: WorkspacePermissions;
  
  // 清理策略
  cleanup: {
    enabled: boolean;
    keepDays: number;         // 保留天数
    checkIntervalHours: number; // 检查间隔（小时）
  };
}

/**
 * 默认工作空间配置
 */
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  quotas: {
    maxFileSize: 100 * 1024 * 1024,      // 100MB
    maxTotalSize: 1024 * 1024 * 1024,    // 1GB
    maxFileCount: 10000,
    maxDirectoryDepth: 10,
  },
  
  permissions: {
    allowedPaths: [
      // 默认允许工作空间内所有路径
      '**/*',
    ],
    blockedPaths: [
      // 禁止访问系统敏感路径
      '**/node_modules/**',
      '**/.git/**',
      '**/.*', // 隐藏文件
    ],
    allowedExtensions: [
      // 常见开发文件
      '.ts', '.tsx', '.js', '.jsx', '.json', '.md',
      '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h',
      '.html', '.css', '.scss', '.sass',
      '.yaml', '.yml', '.toml', '.xml',
      '.txt', '.log',
      // 数据文件
      '.csv', '.jsonl',
      // 配置文件
      '.env', '.config',
    ],
    blockedExtensions: [
      // 可执行文件
      '.exe', '.dll', '.so', '.dylib',
      '.sh', '.bat', '.cmd', '.ps1',
      // 压缩文件
      '.zip', '.tar', '.gz', '.rar',
      // 二进制文件
      '.bin', '.dat',
    ],
    
    canRead: true,
    canWrite: true,
    canDelete: true,
    canExecute: false,
  },
  
  cleanup: {
    enabled: true,
    keepDays: 30,
    checkIntervalHours: 24,
  },
};

/**
 * 检查文件路径是否允许访问
 */
export function isPathAllowed(filePath: string, config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG): boolean {
  const { allowedPaths, blockedPaths } = config.permissions;
  
  // 检查黑名单
  for (const pattern of blockedPaths) {
    if (matchPattern(filePath, pattern)) {
      return false;
    }
  }
  
  // 检查白名单
  for (const pattern of allowedPaths) {
    if (matchPattern(filePath, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查文件扩展名是否允许
 */
export function isExtensionAllowed(fileName: string, config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG): boolean {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  
  const { allowedExtensions, blockedExtensions } = config.permissions;
  
  // 检查黑名单
  if (blockedExtensions.includes(ext)) {
    return false;
  }
  
  // 检查白名单
  if (allowedExtensions.length === 0) {
    return true; // 没有白名单限制
  }
  
  return allowedExtensions.includes(ext);
}

/**
 * 简单的 glob 模式匹配
 */
function matchPattern(path: string, pattern: string): boolean {
  // 转换为正则表达式
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')  // ** 匹配任意路径
    .replace(/\*/g, '[^/]*') // * 匹配非 / 的字符
    .replace(/\./g, '\\.');  // 转义点号
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * 检查文件大小是否超过配额
 */
export function isFileSizeAllowed(size: number, config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG): boolean {
  return size <= config.quotas.maxFileSize;
}

/**
 * 检查工作空间总大小是否超过配额
 */
export function isTotalSizeAllowed(totalSize: number, config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG): boolean {
  return totalSize <= config.quotas.maxTotalSize;
}

/**
 * 检查文件数量是否超过配额
 */
export function isFileCountAllowed(count: number, config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG): boolean {
  return count <= config.quotas.maxFileCount;
}
