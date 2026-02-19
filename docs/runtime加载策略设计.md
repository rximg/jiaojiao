# Runtime 加载策略设计（Session Runtime 常驻 + Execution Runtime 按需）

## 1. 目标与范围

本策略用于统一以下链路的运行时行为：

1. 欢迎页案例新建会话
2. History 恢复会话
3. 聊天消息发送（流式执行）
4. HITL 人工确认
5. Checkpoint 恢复与续跑
6. Runtime 回收与重建

核心目标：
- 保证会话状态一致性（sessionId 唯一键）
- 保证 HITL/pending 请求可控
- 保证 checkpoint 恢复确定性
- 降低 sendMessage 路径的重复初始化成本

---

## 2. 分层模型

### 2.1 Session Runtime（常驻，按 sessionId）

包含：
- `sessionId`
- `caseId`（会话阶段确定）
- `HITLService`
- `PersistenceService` 句柄（或可获取入口）
- `WorkspaceFilesystem` 上下文
- 运行元数据（lastActiveAt / counters）

职责：
- 维持跨消息状态（HITL pending、活跃时间、诊断信息）
- 作为 Execution Runtime 的唯一状态来源

### 2.2 Execution Runtime（按需创建）

包含：
- 一次性 `Agent` 执行器实例
- 当前 `AbortController`
- 流式回调绑定

职责：
- 执行本次消息推理
- 结束后释放
- 不承载长期状态

> 结论：长期状态进入 Session Runtime；执行计算进入 Execution Runtime。

---

## 3. 生命周期状态机（session 维度）

状态：
- `UNINITIALIZED`
- `READY`
- `RUNNING`
- `WAITING_HITL`
- `IDLE`
- `CLOSED`

状态迁移：
- `session:create` / `session:get` -> `READY`
- `agent:sendMessage` 开始 -> `RUNNING`
- 命中 HITL 等待 -> `WAITING_HITL`
- HITL 继续并恢复执行 -> `RUNNING`
- 本轮完成 -> `IDLE`
- `session:delete` 或超时回收 -> `CLOSED`

约束：
- 同一 `sessionId` 同时最多一个 `RUNNING`（串行）
- `WAITING_HITL` 期间允许 `hitl:respond`，拒绝并发新 run（或显式取消后重开）

---

## 4. 触发点与加载策略

### 4.1 案例新建会话（`session:create`）

加载动作：
- 创建/获取 Session Runtime
- 持久化 `session.meta.caseId`
- 写入 `currentSessionId = sessionId`, `currentCaseId = caseId`
- 状态置为 `READY`

不做：
- 不提前创建重型 Agent 执行器

### 4.2 History 恢复（`session:get`）

加载动作：
- 读取 `session.meta.caseId`
- 更新 `sessionCaseCache`
- 若 Session Runtime 不存在则创建
- 状态置为 `READY`

### 4.3 消息发送（`agent:sendMessage`）

加载动作：
- 读取 Session Runtime（不存在则按 `sessionId` 懒创建）
- 从 Session Runtime 获取 `caseId`
- 设置执行上下文（`AGENT_SESSION_ID`、`AGENT_CASE_ID`）
- 按需创建 Execution Runtime（`createMainAgent(sessionId)`）并执行

不做：
- 不在 sendMessage 阶段反查 sessionRepo 确认 caseId（避免重复确认）

### 4.4 停止执行（`agent:stopStream`）

动作：
- 只终止当前 Execution Runtime
- Session Runtime 保持不销毁，状态回到 `IDLE` 或 `WAITING_HITL` 视场景决定

### 4.5 退出 chatbot（`session:closeRuntime`）

**单 session 模式下的显式关闭**：
- 前端退出 chatbot 界面时，调用 `resetSession()`
- `resetSession()` 调用 `window.electronAPI.session.closeRuntime(sessionId)`
- 后端 IPC handler 调用 `RuntimeManager.closeRuntime(sessionId)`
- 关闭动作：
  - 清理 HITLService 待处理请求
  - 关闭 checkpoint saver
  - 从内存中移除 runtime
  - 清空 `currentSessionId` 和 `currentCaseId` 缓存
- 状态: `IDLE` -> `CLOSED`

> **设计理由**：桌面端应用同一时刻只有一个活跃 session，退出 chatbot 后显式关闭 runtime 可释放内存，避免资源泄漏。

---

## 5. HITL 一致性策略

### 5.1 必须常驻的状态

- `pendingRequests`（requestId -> request）
- request 与 `sessionId`、当前 run 的关联

### 5.2 恢复语义

- 用户取消：本轮 run 结束，但 Session Runtime 不销毁
- 用户继续：依赖 checkpoint + 同一 session runtime 继续
- 历史重开：先恢复 session，再进入下一轮 sendMessage

### 5.3 超时策略

建议分层：
- 前端倒计时：交互层超时
- 后端守护超时（可选增强）：避免请求永远挂起

---

## 6. Checkpoint 与线程键策略

统一键：
- `thread_id = sessionId`

规则：
- 每次 `invokeAgentUseCase` 传 `config.configurable.thread_id = sessionId`
- checkpoint 存储路径固定 `workspaces/{sessionId}/checkpoints/`
- 不引入独立 thread 映射，减少恢复复杂度

---

## 7. 缓存策略

**简化为单 session 模式变量**：
- `currentSessionId: string | null`
- `currentCaseId: string | null`
- `currentRuntime: SessionRuntime | null`

### 7.1 读取优先级

1. 内存变量 `currentCaseId`
2. Session Runtime 内 `caseId`
3.（可选）单次 repo 兜底查询并回填
4. 回退默认 `main_agent_config.yaml`

> 单 session 模式无需 Map 结构，切换 session 时直接覆盖当前变量。

---

## 8. 并发与隔离

**简化为单 session 模式**：
- 同一时刻只有一个 active session
- 不需要跨 session 并发控制
- 切换 session 时：
  - 当前 session runtime 可选保留（idle）或立即回收
  - 新 session 启动时不受干扰

---

## 9. 回收策略

分两级回收：

1. Execution Runtime：
- 每轮结束立即释放

2. Session Runtime：
- **显式关闭**：前端退出 chatbot 时调用 `session:closeRuntime`（单 session 模式下推荐）
- **进程退出**：Electron `before-quit` 事件调用 `shutdownServices()` -> `closeAllRuntimes()`
- **session 删除**：`session:delete` 时自动关闭对应 runtime
- （可选）空闲 TTL（如 30 分钟）回收（单 session 模式下不需要）

回收不删除：
- checkpoint 文件与会话持久化数据

---

## 10. 可观测性与诊断

建议最小日志集：
- `runtime.session.ready`（sessionId, caseId）
- `runtime.execution.start/end`（sessionId, duration, status）
- `runtime.hitl.pending/resolved`（requestId, actionType）
- `runtime.cache.miss`（sessionCase/runtime）
- `runtime.fallback.defaultConfig`（sessionId, reason）

建议指标：
- 活跃 session runtime 数
- sendMessage 平均构建耗时
- HITL 平均等待时长
- 缓存命中率

---

## 11. 渐进落地计划

### M1（当前可落地）
- 固化“session 阶段写 cache，send 阶段读 cache”
- sendMessage 不再传 caseId
- 统一日志与告警字段

### M2（稳定性增强）
- 缓存未命中 repo 单次兜底 + 回填
- HITL 后端守护超时
- 切换 session 时旧 runtime 优雅关闭

### M3（可运维增强）
- runtime 诊断面板（列出 active sessions、状态、pending HITL）
- 细粒度指标上报

---

## 12. 对当前代码的建议映射

- `electron/ipc/session.ts`
  - 保持 `session:create/session:get` 写入 `currentSessionId/currentCaseId`
- `electron/ipc/agent.ts`
  - `sendAgentMessage` 只接收 `(message, threadId, sessionId)`
  - 从 Session Runtime/Cache 读取 caseId
- `backend/services/runtime-manager.ts`
  - 增加状态字段（READY/RUNNING/WAITING_HITL/IDLE）
- `backend/services/hitl-service.ts`
  - 增加 pending 请求可观测接口

---

## 13. 最终建议

采用“**Session Runtime 常驻，Execution Runtime 按需**”的混合策略。

这套策略在 HITL 与 checkpoint 场景下最稳：
- 保证会话级状态连续
- 控制执行器资源成本
- 明确职责边界（会话阶段确定 case，消息阶段只执行）
