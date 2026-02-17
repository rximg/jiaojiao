# LogManager 涉及文件及清理说明

> 梳理 LogManager 相关调用点，列出涉及的文件与行号，并说明需要进行的清理项。

---

## 一、涉及文件及行号

### 1. LogManager 本体

| 文件 | 行号 | 说明 |
|------|------|------|
| `backend/services/log-manager.ts` | 23-45 | `LogManager` 类、`ensureLogDir` |
| | 50-65 | `logAudit`：写入 `logs/audit/{date}/{sessionId}_audit.jsonl` |
| | 71-79 | `logHITL`：写入 `logs/hitl/{date}/{sessionId}_hitl.jsonl` |
| | 86-111 | `logSystem`：写入 `logs/system/app.log` 或 `error.log`，**并输出到 console** |
| | 118-165 | `queryLogs`：按 sessionId、type、filter 查询 |
| | 172-194 | `exportLogs`：导出为 json/csv |
| | 199-226 | `cleanupOldLogs`：清理超过 N 天的 audit/hitl/llm，**每删一个目录输出 console.log** |
| | 249-268 | 单例 `logManagerInstance`、`setDefaultLogRoot`、`getLogManager` |

### 2. 调用方

| 文件 | 行号 | 调用 | 说明 |
|------|------|------|------|
| `backend/agent/session-routes.ts` | 51-56 | `logAudit` | 创建会话时记录 `session_created` |
| | 195-198 | `logAudit` | 删除会话时记录 `session_deleted` |
| `electron/ipc/session.ts` | 80-85 | `logAudit` | IPC 创建会话时记录 `session_created` |
| | 315-318 | `logAudit` | IPC 删除会话时记录 `session_deleted` |
| `backend/agent/AgentFactory.ts` | 618-623 | `logAudit` | 主 Agent 创建时记录 `agent_created` |
| `backend/services/hitl-service.ts` | 86-87 | `logHITL` | HITL 请求发出时记录 |
| | 103-106 | `logHITL` | HITL 响应（approved/rejected）时记录 |
| | 123-126 | `logHITL` | HITL 异常时记录 |
| `backend/services/workspace-service.ts` | 125-133 | `logAudit` | workspace 操作（read/write 等）记录 `workspace.{type}` |
| `backend/services/runtime-manager.ts` | 73 | `logSystem` | Agent runtime 创建 |
| | 131 | `logSystem` | Agent runtime 关闭 |
| | 144 | `logSystem` | 所有 runtime 关闭 |
| | 182 | `logSystem` | 清理不活跃 runtime |
| `backend/services/service-initializer.ts` | 41-42 | `getLogManager` | 初始化 LogManager |
| | 49 | `logSystem` | 服务初始化完成 |
| | 71-74 | `logSystem` | 服务关闭 |
| `electron/main.ts` | 27 | `setDefaultLogRoot` | import |
| | 68 | `setDefaultLogRoot` | 设置日志根目录（打包后 exe 同目录） |

### 3. 未被调用的 API

| 方法 | 说明 |
|------|------|
| `queryLogs` | 无调用方 |
| `exportLogs` | 无调用方 |

---

## 二、需要进行的清理

### 2.1 冗余 console 输出（与 LangSmith 无关，但可减少刷屏）

| 位置 | 当前行为 | 建议 |
|------|----------|------|
| `log-manager.ts:100-108` | `logSystem` 每次写入都会 `console.log` / `console.warn` / `console.error` | **info 级别**：仅写文件，不输出 console；**warn/error**：保留 console 输出 |
| `log-manager.ts:218` | `cleanupOldLogs` 每删除一个日期目录就 `console.log` | 改为汇总或使用 `logSystem('info', 汇总信息)`，或删除（仅写文件即可） |

### 2.2  dead code 与遗留类型

| 类型 | 说明 | 建议 |
|------|------|------|
| `LogType` 中的 `'llm'` | 文档提到「从 llm_logs 迁移到 logs/」，但当前无 `logAudit`/`logHITL`/`logSystem` 写入 llm 类型 | 若确认不再使用 llm 日志，可从 `LogType`、`ensureLogDir`、`cleanupOldLogs` 中移除 `llm` |
| `queryLogs` | 无调用方 | 若近期无前端/API 需要，可标记为待用或移除 |
| `exportLogs` | 无调用方 | 同上 |

### 2.3 审计日志重复

| 场景 | 说明 | 建议 |
|------|------|------|
| session 创建/删除 | `session-routes.ts`（REST）与 `electron/ipc/session.ts`（IPC）均有 `logAudit` | 两套入口，非重复调用；若实际只走 IPC，可考虑移除 session-routes 的 audit 或统一入口 |
| session 创建 | REST 与 IPC 都可能创建 session | 保留两处，审计覆盖不同入口 |

### 2.4 错误日志保留

以下 `console.error` 应保留，用于排查 LogManager 自身问题：

| 位置 | 说明 |
|------|------|
| `log-manager.ts:64` | `logAudit` 写入失败 |
| `log-manager.ts:79` | `logHITL` 写入失败 |
| `log-manager.ts:111` | `logSystem` 写入失败 |
| `log-manager.ts:164` | `queryLogs` 失败 |
| `log-manager.ts:226` | `cleanupOldLogs` 失败 |

---

## 三、实施清单（按优先级）

1. **logSystem 的 info 级别**：仅写文件，不输出 console（减少刷屏）
2. **cleanupOldLogs 的 console.log**：改为 `logSystem` 或删除
3. **llm 类型**：确认无使用后，从 `LogType`、`cleanupOldLogs` 中移除
4. **queryLogs / exportLogs**：若确定无需求，可标记 `@deprecated` 或移除

---

## 四、附录：目录结构

```
logs/
├── system/           # logSystem 写入
│   ├── app.log
│   └── error.log
├── audit/{date}/      # logAudit 写入
│   └── {sessionId}_audit.jsonl
├── hitl/{date}/       # logHITL 写入
│   └── {sessionId}_hitl.jsonl
└── llm/{date}/        # 当前未使用（cleanup 会清理）
```
