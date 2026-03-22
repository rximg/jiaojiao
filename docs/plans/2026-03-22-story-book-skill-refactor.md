# Story Book Skill Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the story_book skill so a single confirmed Markdown planning document drives character generation, storyboard image generation, and narration audio generation without redundant JSON-first workflow steps.

**Architecture:** Replace the current multi-JSON pipeline with a single source of truth named 《绘本故事策划稿.md》 stored at the workspace root. Keep the fixed four-character setup and per-page prompt confirmation gates, but derive all downstream actions from the confirmed Markdown plan and simplify the skill instructions around that flow.

**Tech Stack:** Markdown skill prompt, YAML skill config, Electron HITL rendering assumptions, existing image and TTS tools.

**Status:** Implementation complete. Manual workflow testing pending.

**Implemented:**
- Rebuilt `story_book` skill around `《绘本故事策划稿.md》` as the single planning source.
- Updated skill config copy to match the planning-document-first flow.
- Added `split_grid_image` tool and wired it into the skill workflow.
- Corrected planning-file update guidance to use `edit_file` for existing files.

**Verified:**
- `npm run test:run -- tests/integration/tools/split-character-sheet.integration.test.ts`

**Pending Manual Test:**
- End-to-end HITL flow for planning draft creation, confirmation, character sheet splitting, page prompt confirmation, storyboard generation, and narration generation.

---

### Task 1: Rewrite The Skill Workflow

**Files:**
- Modify: `backend/config/skills/story-book/SKILL.md`

**Step 1: Replace the first-step contract**

- Define `《绘本故事策划稿.md》` as the first required artifact.
- Require it to be written to the workspace root on first display.
- State that the first display must be Markdown for HITL review and must ask the user to confirm or provide revisions.

**Step 2: Collapse redundant intermediate planning artifacts**

- Remove `story_outline.json` / `storyboard_plan.json` / `scene_prompt_plan.json` as primary workflow dependencies.
- Make the confirmed Markdown planning file the only required upstream planning context.

**Step 3: Reorder plan content specification**

- Require the planning document to contain:
  - story theme
  - story outline
  - four character definitions and visual descriptions
  - per-scene subsections ordered as: appearing characters, scene and visual description, narration

**Step 4: Preserve the two execution gates**

- Keep fixed four-character character-sheet generation.
- Keep per-page prompt confirmation before any storyboard image generation.

### Task 2: Simplify Execution Rules

**Files:**
- Modify: `backend/config/skills/story-book/SKILL.md`
- Modify: `backend/config/skills/story-book/config.yaml`

**Step 1: Rewrite tool usage sections**

- Character image generation depends on the character section of `《绘本故事策划稿.md》`.
- Scene generation depends on each scene subsection of `《绘本故事策划稿.md》` plus split character reference images.
- TTS generation depends only on each scene's narration subsection.

**Step 2: Remove unsupported wording**

- Do not require nonexistent tool parameters such as “章节引用”.
- Keep the guidance conceptual rather than inventing API fields.

**Step 3: Align short descriptions**

- Update the YAML description and welcome copy to match the planning-document-first workflow.

### Task 3: Verify Consistency

**Files:**
- Modify: `backend/config/skills/story-book/SKILL.md`
- Modify: `backend/config/skills/story-book/config.yaml`

**Step 1: Verify terminology**

- Use `《绘本故事策划稿.md》` consistently.
- Ensure all downstream steps depend on the confirmed Markdown plan.

**Step 2: Verify user interaction rules**

- Todo list starts immediately and includes planning-draft generation as the first item.
- User confirmation is still required before continuing to generation tasks.

**Step 3: Verify no redundant flow remains**

- Remove or rewrite any section that implies the old JSON-first workflow is still authoritative.