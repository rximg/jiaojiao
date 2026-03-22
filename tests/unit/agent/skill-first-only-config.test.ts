import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..');

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf-8');
}

describe('skill-first config architecture', () => {
  it('does not keep the legacy main-config loader APIs', () => {
    const configLoader = readProjectFile('backend/agent/ConfigLoader.ts');
    const resolver = readProjectFile('backend/agent/case-config-resolver.ts');

    expect(configLoader).not.toContain('loadMainConfig(');
    expect(resolver).not.toContain('resolveMainAgentConfigPath(');
  });

  it('does not keep runtime fallback reads from agent_cases', () => {
    const configIpc = readProjectFile('electron/ipc/config.ts');

    expect(configIpc).not.toContain('agent_cases');
  });

  it('removes the legacy agent_cases config directory', () => {
    const legacyDir = path.join(projectRoot, 'backend', 'config', 'agent_cases');

    expect(fs.existsSync(legacyDir)).toBe(false);
  });
});