import * as fs from 'fs';
import * as path from 'path';

export function resolveMainAgentConfigPath(configDir: string, caseId?: string): string {
  const defaultMainConfigPath = path.join(configDir, 'main_agent_config.yaml');
  const normalizedCaseId = caseId?.trim();

  if (!normalizedCaseId) {
    return defaultMainConfigPath;
  }

  const caseConfigPath = path.join(configDir, 'agent_cases', `${normalizedCaseId}.yaml`);
  if (fs.existsSync(caseConfigPath)) {
    return caseConfigPath;
  }

  return defaultMainConfigPath;
}
