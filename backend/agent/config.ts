/**
 * Agent 模块配置入口。
 * loadConfig 已下沉到 backend/app-config，此处仅 re-export 以保持既有调用方兼容。
 */
export { loadConfig } from '../app-config.js';
