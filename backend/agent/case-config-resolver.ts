import * as fs from 'fs';
import * as path from 'path';

/** 默认案例 ID（未指定 caseId 时使用） */
export const DEFAULT_CASE_ID = 'encyclopedia';

/**
 * 解析案例配置路径：agent_cases/{caseId}.yaml
 * - 有 caseId → agent_cases/{caseId}.yaml（存在时）
 * - 无 caseId → agent_cases/encyclopedia.yaml（默认案例）
 */
export function resolveMainAgentConfigPath(configDir: string, caseId?: string): string {
  const effectiveCaseId = caseId?.trim() || DEFAULT_CASE_ID;
  const caseConfigPath = path.join(configDir, 'agent_cases', `${effectiveCaseId}.yaml`);

  if (fs.existsSync(caseConfigPath)) {
    return caseConfigPath;
  }

  // 回退到默认案例
  const defaultCasePath = path.join(configDir, 'agent_cases', `${DEFAULT_CASE_ID}.yaml`);
  if (fs.existsSync(defaultCasePath)) {
    return defaultCasePath;
  }

  // 最终回退（不应到达，保留防御性）
  throw new Error(`默认案例配置不存在: ${defaultCasePath}`);
}
