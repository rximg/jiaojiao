# Deepagents Upgrade And Skill Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the project to the latest stable deepagents version, document the project's deepagents usage and supported skill schema, and normalize all skills under `backend/config/skills/` to that schema.

**Architecture:** Keep the existing Skill-First runtime flow in `AgentFactory` and `ConfigLoader`, but align the project with the actual deepagents skill frontmatter contract. Treat `backend/config/skills/*/SKILL.md` as deepagents-facing assets, update their frontmatter to the supported schema, and add explicit project documentation so future skills do not drift back to the VS Code/Copilot schema.

**Tech Stack:** TypeScript, Electron, LangChain, deepagents, YAML frontmatter, Vitest, npm.

---

### Task 1: Add A Regression Test For Deepagents Skill Frontmatter

**Files:**
- Create: `tests/unit/agent/deepagents-skill-schema.test.ts`
- Reference: `backend/config/skills/story-book/SKILL.md`
- Reference: `backend/config/skills/encyclopedia/SKILL.md`
- Reference: `backend/config/skills/behavior-correction/SKILL.md`

**Step 1: Write the failing test**

Add a test that reads all three `SKILL.md` files and asserts:
- frontmatter contains `name`
- frontmatter contains `description`
- frontmatter does not contain `version`
- frontmatter does not contain `allowedTools`
- if tool restrictions are present, they use `allowed-tools`

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/agent/deepagents-skill-schema.test.ts`

Expected: FAIL because the current skills still contain `version` and `allowedTools`.

**Step 3: Keep the test as the migration guard**

Do not weaken the assertions. This test is the guardrail for the schema migration.

### Task 2: Upgrade Deepagents To Latest Stable

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `yarn.lock`

**Step 1: Update dependency spec**

Change `deepagents` in `package.json` from `^1.3.0` to `^1.8.4`.

**Step 2: Refresh lockfiles**

Run the package manager update so `package-lock.json` and `yarn.lock` reflect the new resolved version.

**Step 3: Check for type-level breakage**

Review the project's direct imports from `deepagents`, especially in:
- `backend/agent/AgentFactory.ts`
- `backend/tools/registry.ts`

If the upgrade introduces typing changes, apply the smallest compatible fix.

### Task 3: Document Deepagents Usage In This Project

**Files:**
- Create: `docs/deepagents-usage.md`
- Reference: `backend/agent/AgentFactory.ts`
- Reference: `backend/agent/ConfigLoader.ts`

**Step 1: Write the project-level usage guide**

Document:
- where deepagents is used in this repo
- how `AgentFactory` passes `skills` into `createDeepAgent`
- how `ConfigLoader` strips frontmatter and loads only the `SKILL.md` body as prompt content

**Step 2: Add a dedicated schema section**

Explain the supported deepagents skill frontmatter schema used by this project:
- required: `name`, `description`
- optional: `license`, `compatibility`, `metadata`, `allowed-tools`
- unsupported for this project contract: `version`, `allowedTools`, VS Code/Copilot-only fields

**Step 3: Add examples**

Include one minimal valid frontmatter example and one project example with `allowed-tools`.

### Task 4: Normalize Skill Frontmatter Under `backend/config/skills`

**Files:**
- Modify: `backend/config/skills/story-book/SKILL.md`
- Modify: `backend/config/skills/encyclopedia/SKILL.md`
- Modify: `backend/config/skills/behavior-correction/SKILL.md`

**Step 1: Remove unsupported fields**

Delete `version` from all three files.

**Step 2: Convert tool restrictions**

Where tool restrictions are needed, replace YAML `allowedTools:` arrays with a single `allowed-tools:` field using a space-delimited tool list.

**Step 3: Keep body content intact**

Do not rewrite the workflow body unless needed to preserve meaning. This task is schema normalization, not a workflow redesign.

**Step 4: Validate naming**

Check whether each frontmatter `name` follows the deepagents naming convention used by the installed version. If a warning-level mismatch remains, document it in the final report.

### Task 5: Verify Upgrade And Schema Migration

**Files:**
- Test: `tests/unit/agent/deepagents-skill-schema.test.ts`
- Validate: `backend/agent/AgentFactory.ts`
- Validate: `docs/deepagents-usage.md`

**Step 1: Run the new unit test**

Run: `npm run test:run -- tests/unit/agent/deepagents-skill-schema.test.ts`

Expected: PASS.

**Step 2: Run a targeted type/build verification**

Run a validation command that exercises the upgraded dependency surface. Prefer the narrowest command that proves the repo still compiles against the new deepagents version.

**Step 3: Report any environment blockers honestly**

If external services prevent a full verification run, record the exact failing command and the external dependency that blocked it.