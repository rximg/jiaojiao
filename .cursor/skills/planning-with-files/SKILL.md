---
name: planning-with-files
version: "2.11.0"
description: Implements Manus-style file-based planning for complex tasks. Creates .planning/task_plan.md, findings.md, progress.md. Use when starting complex multi-step tasks, research projects, or any task requiring >5 tool calls. Now with automatic session recovery after /clear. Planning files live in .planning/ and are removed when task is complete.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - WebFetch
  - WebSearch
hooks:
  PreToolUse:
    - matcher: "Write|Edit|Bash|Read|Glob|Grep"
      hooks:
        - type: command
          command: "cat .planning/task_plan.md 2>/dev/null | head -30 || true"
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "echo '[planning-with-files] File updated. If this completes a phase, update .planning/task_plan.md status.'"
  Stop:
    - hooks:
        - type: command
          command: |
            SCRIPT_DIR="${CURSOR_SKILL_ROOT:-.cursor/skills/planning-with-files}/scripts"

            IS_WINDOWS=0
            if [ "${OS-}" = "Windows_NT" ]; then
              IS_WINDOWS=1
            else
              UNAME_S="$(uname -s 2>/dev/null || echo '')"
              case "$UNAME_S" in
                CYGWIN*|MINGW*|MSYS*) IS_WINDOWS=1 ;;
              esac
            fi

            if [ "$IS_WINDOWS" -eq 1 ]; then
              if command -v pwsh >/dev/null 2>&1; then
                pwsh -ExecutionPolicy Bypass -File "$SCRIPT_DIR/check-complete.ps1" 2>/dev/null ||
                powershell -ExecutionPolicy Bypass -File "$SCRIPT_DIR/check-complete.ps1" 2>/dev/null ||
                sh "$SCRIPT_DIR/check-complete.sh"
              else
                powershell -ExecutionPolicy Bypass -File "$SCRIPT_DIR/check-complete.ps1" 2>/dev/null ||
                sh "$SCRIPT_DIR/check-complete.sh"
              fi
            else
              sh "$SCRIPT_DIR/check-complete.sh"
            fi
---

# Planning with Files

Work like Manus: Use persistent markdown files as your "working memory on disk."

## FIRST: Check for Previous Session (v2.2.0)

**Before starting work**, check for unsynced context from a previous session:

```bash
# Linux/macOS (auto-detects python3 or python)
$(command -v python3 || command -v python) .cursor/skills/planning-with-files/scripts/session-catchup.py "$(pwd)"
```

```powershell
# Windows PowerShell
python "$env:USERPROFILE\.cursor\skills\planning-with-files\scripts\session-catchup.py" (Get-Location)
```

If catchup report shows unsynced context:
1. Run `git diff --stat` to see actual code changes
2. Read current planning files
3. Update planning files based on catchup + git diff
4. Then proceed with task

## Important: Where Files Go

- **Templates** are in `.cursor/skills/planning-with-files/templates/`
- **Your planning files** go in **one folder**: `.planning/` in the project root (create it if missing)

| Location | What Goes There |
|----------|-----------------|
| Skill directory (`.cursor/skills/planning-with-files/`) | Templates, scripts, reference docs |
| Project `.planning/` folder | 当前任务的 `task_plan.md`, `findings.md`, `progress.md`（同一目录） |
| Project `.planning/recycle/<任务名>/` | 已完成任务的归档：将当次任务的 task_plan.md、progress.md、findings.md 移入此处（见下方「回收」） |

## Quick Start

Before ANY complex task:

1. **Create `.planning/`** in project root (if it does not exist).
2. **Create `.planning/task_plan.md`** — Use [templates/task_plan.md](templates/task_plan.md) as reference
3. **Create `.planning/findings.md`** — Use [templates/findings.md](templates/findings.md) as reference
4. **Create `.planning/progress.md`** — Use [templates/progress.md](templates/progress.md) as reference
5. **Re-read plan before decisions** — Refreshes goals in attention window
6. **Update after each phase** — Mark complete, log errors

> **Note:** All planning files live under `.planning/` so the project root stays clean. When all phases are complete, move them into `.planning/recycle/<任务名>/` (see "When All Phases Complete: Cleanup" below).

## The Core Pattern

```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Anything important gets written to disk.
```

## File Purposes

| File | Purpose | When to Update |
|------|---------|----------------|
| `.planning/task_plan.md` | Phases, progress, decisions | After each phase |
| `.planning/findings.md` | Research, discoveries | After ANY discovery |
| `.planning/progress.md` | Session log, test results | Throughout session |

## Critical Rules

### 1. Create Plan First
Never start a complex task without `.planning/task_plan.md`. Non-negotiable.

### 2. The 2-Action Rule
> "After every 2 view/browser/search operations, IMMEDIATELY save key findings to text files."

This prevents visual/multimodal information from being lost.

### 3. Read Before Decide
Before major decisions, read the plan file. This keeps goals in your attention window.

### 4. Update After Act
After completing any phase:
- Mark phase status in `.planning/task_plan.md`: `in_progress` → `complete`
- Log any errors encountered
- Note files created/modified

### 5. Log ALL Errors
Every error goes in the plan file. This builds knowledge and prevents repetition.

```markdown
## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| FileNotFoundError | 1 | Created default config |
| API timeout | 2 | Added retry logic |
```

### 6. Never Repeat Failures
```
if action_failed:
    next_action != same_action
```
Track what you tried. Mutate the approach.

## The 3-Strike Error Protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

## Read vs Write Decision Matrix

| Situation | Action | Reason |
|-----------|--------|--------|
| Just wrote a file | DON'T read | Content still in context |
| Viewed image/PDF | Write findings NOW | Multimodal → text before lost |
| Browser returned data | Write to file | Screenshots don't persist |
| Starting new phase | Read plan/findings | Re-orient if context stale |
| Error occurred | Read relevant file | Need current state to fix |
| Resuming after gap | Read all planning files | Recover state |

## The 5-Question Reboot Test

If you can answer these, your context management is solid:

| Question | Answer Source |
|----------|---------------|
| Where am I? | Current phase in `.planning/task_plan.md` |
| Where am I going? | Remaining phases |
| What's the goal? | Goal statement in plan |
| What have I learned? | `.planning/findings.md` |
| What have I done? | `.planning/progress.md` |

## When All Phases Complete: Cleanup（回收）

**当 `.planning/task_plan.md` 中所有 phase 均标记为 `complete` 时，执行回收：**

1. **确保 `.planning/recycle/` 存在**  
   若不存在，先创建目录 `.planning/recycle/`。

2. **确定任务名**  
   从 `.planning/task_plan.md` 的 **Goal** 取简短名称（或使用日期），格式为：
   - `planning-<任务简述>-YYYY-MM-DD`  
   - 例如：`planning-hitl-chat-2026-02-10`、`planning-hitl-enhance-2026-02-13`  
   - 名称中避免空格和特殊字符，用 `-` 连接。

3. **在 recycle 下按任务名建子文件夹**  
   创建 `.planning/recycle/<任务名>/`（如 `.planning/recycle/planning-hitl-chat-2026-02-10/`）。

4. **移动规划文件到该子文件夹**  
   将以下文件从 `.planning/` 根下**移动**到 `.planning/recycle/<任务名>/`：
   - `task_plan.md`
   - `progress.md`
   - `findings.md`（若存在）

5. **验证**  
   用 `Glob` 或 `list_dir` 查看：
   - `.planning/` 下应只剩 `recycle` 目录（当前任务的 task_plan、progress、findings 已移走）；
   - `.planning/recycle/<任务名>/` 下应包含 `task_plan.md`、`progress.md`，以及若有则 `findings.md`。

6. **结果**  
   完成后，`.planning/` 可空或仅含 `recycle`，便于下次任务在 `.planning/` 根下新建 `task_plan.md`、`progress.md`、`findings.md`。历史规划均按任务名归档在 `.planning/recycle/<任务名>/` 下，便于恢复或查阅。

## When to Use This Pattern

**Use for:**
- Multi-step tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls
- Anything requiring organization

**Skip for:**
- Simple questions
- Single-file edits
- Quick lookups

## Templates

Copy these templates into `.planning/` to start:

- [templates/task_plan.md](templates/task_plan.md) → `.planning/task_plan.md` — Phase tracking
- [templates/findings.md](templates/findings.md) → `.planning/findings.md` — Research storage
- [templates/progress.md](templates/progress.md) → `.planning/progress.md` — Session logging

## Scripts

Helper scripts for automation:

- `scripts/init-session.sh` — Initialize all planning files
- `scripts/check-complete.sh` — Verify all phases complete
- `scripts/session-catchup.py` — Recover context from previous session (v2.2.0)

## Advanced Topics

- **Manus Principles:** See [reference.md](reference.md)
- **Real Examples:** See [examples.md](examples.md)

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Use TodoWrite for persistence | Create `.planning/task_plan.md` |
| State goals once and forget | Re-read plan before decisions |
| Hide errors and retry silently | Log errors to plan file |
| Stuff everything in context | Store large content in files |
| Start executing immediately | Create plan file FIRST in `.planning/` |
| Repeat failed actions | Track attempts, mutate approach |
| Create files in skill directory | Create files in `.planning/` in your project |
| Leave `.planning/` after task is complete | Move `task_plan.md`, `progress.md`, `findings.md` to `.planning/recycle/<任务名>/` when all phases complete |
