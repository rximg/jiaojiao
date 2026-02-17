/**
 * 仓储工厂：创建并返回各仓储实例，供后续依赖注入使用
 */
import { getWorkspaceFilesystem } from '../services/fs.js';
import { SessionFsRepository } from './persistence/session/session-fs-repository.js';
import { ArtifactFsRepository } from './persistence/workspace/artifact-fs-repository.js';
import { ConfigElectronStoreRepository } from './persistence/configuration/config-electron-store-repository.js';
import type { SessionRepository } from '../domain/session/repositories/session-repository.js';
import type { ArtifactRepository } from '../domain/workspace/repositories/artifact-repository.js';
import type { ConfigRepository } from '../domain/configuration/repositories/config-repository.js';

let _sessionRepo: SessionRepository | null = null;
let _artifactRepo: ArtifactRepository | null = null;
let _configRepo: ConfigRepository | null = null;

/**
 * 获取会话仓储（单例）
 */
export function getSessionRepository(): SessionRepository {
  if (!_sessionRepo) {
    _sessionRepo = new SessionFsRepository(getWorkspaceFilesystem());
  }
  return _sessionRepo;
}

/**
 * 获取产物仓储（单例）
 */
export function getArtifactRepository(): ArtifactRepository {
  if (!_artifactRepo) {
    _artifactRepo = new ArtifactFsRepository(getWorkspaceFilesystem());
  }
  return _artifactRepo;
}

/**
 * 获取配置仓储（单例）
 */
export function getConfigRepository(): ConfigRepository {
  if (!_configRepo) {
    _configRepo = new ConfigElectronStoreRepository();
  }
  return _configRepo;
}
