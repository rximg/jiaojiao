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
| Project `.planning/` folder | `task_plan.md`, `findings.md`, `progress.md` (all in one place) |

## Quick Start

Before ANY complex task:

1. **Create `.planning/`** in project root (if it does not exist).
2. **Create `.planning/task_plan.md`** — Use [templates/task_plan.md](templates/task_plan.md) as reference
3. **Create `.planning/findings.md`** — Use [templates/findings.md](templates/findings.md) as reference
4. **Create `.planning/progress.md`** — Use [templates/progress.md](templates/progress.md) as reference
5. **Re-read plan before decisions** — Refreshes goals in attention window
6. **Update after each phase** — Mark complete, log errors

> **Note:** All planning files live under `.planning/` so the project root stays clean. When all phases are complete, delete the `.planning/` folder (see "When All Phases Complete: Cleanup" below).

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

## When All Phases Complete: Cleanup

**When every phase in `.planning/task_plan.md` is marked `complete`:**

1. **按名称命名**：从 `.planning/task_plan.md` 的 Goal 取简短名称（或使用日期），将 `.planning` 重命名为可识别的文件夹名，例如：
   - `planning-<任务简述>-YYYY-MM-DD`（如 `planning-hitl-chat-2025-02-13`）
   - 名称中避免空格和特殊字符，用 `-` 连接。
2. **移动到回收站**（不要永久删除），便于需要时恢复：
   - **Windows (PowerShell)**：先重命名再移到回收站（文件夹用 `DeleteDirectory`）：
     ```powershell
     $name = "planning-你的任务名-$(Get-Date -Format 'yyyy-MM-dd')"
     Rename-Item -Path ".planning" -NewName $name -ErrorAction SilentlyContinue
     $fullPath = (Resolve-Path $name).Path
     Add-Type -AssemblyName Microsoft.VisualBasic
     [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($fullPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
     ```
   - **macOS**：`mv "$(pwd)/.planning" ~/.Trash/planning-任务名-$(date +%Y-%m-%d)`
   - **Linux**：先重命名后 `mv` 到 `~/.local/share/Trash/files/`。
3. 项目根目录下不再保留 `.planning/` 或未命名的规划文件夹。

Do not leave `.planning/` in the project root after the task is done; always rename and move to recycle bin (or Trash).

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
| Leave `.planning/` after task is complete | Delete `.planning/` when all phases are complete |
