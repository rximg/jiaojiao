import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/** 默认案例 ID（未指定 caseId 时使用） */
export const DEFAULT_CASE_ID = 'encyclopedia';

/** Skill-First 解析结果：caseId 对应的 skill 目录与文件路径 */
export interface SkillBundle {
  caseId: string;
  skillName: string;
  skillDir: string;
  configYamlPath: string;
  skillMdPath: string;
}

/** skill/index.yaml 结构 */
interface SkillIndex {
  default_case_id?: string;
  cases?: Record<string, { skill_name: string }>;
}

/**
 * 优先从 skill/index.yaml 解析 caseId → skill 目录；不存在或失败时返回 null（调用方 fallback 到 agent_cases）
 */
export function resolveSkillBundleByCaseId(configDir: string, caseId?: string): SkillBundle | null {
  const effectiveCaseId = caseId?.trim() || DEFAULT_CASE_ID;
  const skillDirRoot = path.join(configDir, 'skill');
  const indexPath = path.join(skillDirRoot, 'index.yaml');

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    const index = yaml.load(content) as SkillIndex | undefined;
    if (!index?.cases) {
      return null;
    }

    const caseEntry = index.cases[effectiveCaseId];
    if (!caseEntry?.skill_name) {
      return null;
    }

    const skillName = caseEntry.skill_name;
    const skillDir = path.join(skillDirRoot, skillName);
    if (!fs.existsSync(skillDir)) {
      console.warn(`[case-config-resolver] skill 目录不存在: ${skillDir}`);
      return null;
    }

    const configYamlPath = path.join(skillDir, 'config.yaml');
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(configYamlPath)) {
      console.warn(`[case-config-resolver] skill config.yaml 不存在: ${configYamlPath}`);
      return null;
    }

    return {
      caseId: effectiveCaseId,
      skillName,
      skillDir,
      configYamlPath,
      skillMdPath,
    };
  } catch (err) {
    console.warn('[case-config-resolver] 解析 skill/index.yaml 失败:', err);
    return null;
  }
}

/**
 * 解析案例配置路径：agent_cases/{caseId}.yaml（兼容 fallback）
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
