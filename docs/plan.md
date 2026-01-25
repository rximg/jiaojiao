GitHub Copilot

迁移计划（分阶段，可迭代实施）

阶段0：现状盘点与决策
- 确认统一根目录：例如 `outputs/workspaces/`，按会话/历史ID分子目录：`outputs/workspaces/{session_id}/`，子目录 `images/`、`audio/`、`llm_logs/`、`meta/`。
- 确认历史ID生成与传递：前端创建新会话时获取 `session_id`（UUID），全链路透传到后端与中间件。
- 确认需要改造的写入点：
  - T2I：t2i.ts
  - TTS：tts.ts
  - LLM日志：`local-deep-agent/outputs/llm_logs/*.log`（以及 Node 侧日志若有）

阶段1：引入 FilesystemMiddleware 基础设施
- 安装依赖：`@deepagents/core`（若未安装）。
- 建立统一后端：Node 侧创建 `NodeFilesystemBackend`，rootDir 指向 `outputs/workspaces/`，允许操作：`ls/readFile/writeFile/appendFile/glob/grep/rm`。
- 创建封装服务（建议新建）：`app/backend/services/fs.ts`（导出已配置好的 `FilesystemMiddleware` 单例，接收 sessionId 参数拼路径）。
- Python 侧：若需同源存储，采用同样的根目录，或先保持本地写入，后续迭代迁移到 Node 统一入口。

阶段2：改造产物写入链路到 FilesystemMiddleware
- T2I：在 `t2i.ts` 将 `fs.writeFile` 改为调用 `filesystemMiddleware.writeFile`，路径：`{sessionId}/images/{imageId}.png`；返回 URI 统一格式 `file://.../outputs/workspaces/{sessionId}/images/{imageId}.png`。
- TTS：在 `tts.ts` 将写入改为 `filesystemMiddleware.writeFile`，路径：`{sessionId}/audio/{timestamp}_{hash}.mp3`。
- LLM日志：将日志输出改为写入 `{sessionId}/llm_logs/{model}.log`，若需流式追加，用 `appendFile`。
- 元数据（可选）：在 `{sessionId}/meta/session.json` 保存简要结构（prompt 摘要、生成的文件列表、时间戳、模型信息），便于历史加载与 UI 展示。

阶段3：历史记录持久化与加载
- 定义历史记录清单：可通过 `glob("{sessionId}/**/*")` + 读取 `meta/session.json` 聚合，也可维护一个 `history/index.json` 列表（追加写）。
- 前端进入页面时：调用后端接口 `GET /history` 返回 session 列表（源自 `history/index.json` 或目录扫描）；选中 session 后调用 `GET /history/:id` 读取对应 meta 与文件清单。
- 会话恢复：前端将历史对话（若有）、文件清单、日志 URI、产物 URI 载入 UI；聊天继续使用同一个 sessionId，确保后续产物落在同一目录。

阶段4：前端工作区域文件管理（聊天框右侧）
- UI：在聊天文本框右侧增加“工作区”面板：
  - 显示当前 `sessionId`。
  - 文件树/列表：分组显示 images、audio、llm_logs、meta；支持点击预览图片/播放音频/查看日志。
  - 提供刷新按钮调用 `ls/glob`。
- 接口：后端暴露文件浏览 API（基于 FilesystemMiddleware）：`GET /fs/ls?sessionId=&path=`，`GET /fs/file?sessionId=&path=`（流式/下载），`GET /fs/glob?pattern=...`。
- 安全：仅允许操作 rootDir 下；对 path 做 normalize，禁止 `..`。

阶段5：后端接口与会话生命周期
- 新增会话接口：`POST /sessions` 生成 sessionId，初始化 meta，返回 root URI。
- 产物生成接口携带 sessionId；写文件时统一前缀 `sessionId/`。
- 可选：清理接口 `DELETE /sessions/:id`（递归 rm），需要后台保护。


阶段6：测试与验证
- 单测/集成测试：mock FilesystemMiddleware，验证 T2I/TTS/日志写入路径正确；验证历史加载接口返回的文件清单与 meta 对齐。
- UI 手测：新会话生成产物后，右侧工作区可即时看到图片/音频/日志；切换历史会话可正确加载。

落地顺序建议
1) 引入 FilesystemMiddleware + 封装服务；2) 改 T2I/TTS 写入；3) 改 LLM 日志写入；4) 增历史 index/meta；5) 提供后端 fs/history API；6) 前端工作区面板；7) Python 侧对齐（可选）。

若需要，我可以先在 backend 添加 `services/fs.ts`，并改造 `mcp/t2i.ts` 与 `mcp/tts.ts` 使用 FilesystemMiddleware，随后补充历史接口和前端面板示例。