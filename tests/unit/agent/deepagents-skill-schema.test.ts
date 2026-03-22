import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const skillFiles = [
  'backend/config/skills/story-book/SKILL.md',
  'backend/config/skills/encyclopedia/SKILL.md',
  'backend/config/skills/behavior-correction/SKILL.md',
];

function parseFrontmatter(relativePath: string): Record<string, unknown> {
  const absolutePath = path.join(projectRoot, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (!match) {
    throw new Error(`Missing frontmatter: ${relativePath}`);
  }

  const parsed = yaml.load(match[1]);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid frontmatter: ${relativePath}`);
  }

  return parsed as Record<string, unknown>;
}

function getSkillDirectoryName(relativePath: string): string {
  return path.basename(path.dirname(path.join(projectRoot, relativePath)));
}

describe('deepagents skill schema', () => {
  it.each(skillFiles)('%s uses the deepagents-compatible frontmatter fields', (relativePath) => {
    const frontmatter = parseFrontmatter(relativePath);

    expect(frontmatter.name).toBeTypeOf('string');
    expect(frontmatter.description).toBeTypeOf('string');
    expect(frontmatter.name).toBe(getSkillDirectoryName(relativePath));
    expect(frontmatter).not.toHaveProperty('version');
    expect(frontmatter).not.toHaveProperty('allowedTools');

    if (Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools')) {
      const allowedTools = frontmatter['allowed-tools'];
      const isValidString = typeof allowedTools === 'string' && allowedTools.trim().length > 0;
      const isValidArray = Array.isArray(allowedTools) && allowedTools.length > 0;
      expect(isValidString || isValidArray).toBe(true);
    }
  });
});