# Agent 加载系统 Skill-First 重构设计

## 1. 背景与目�?

当前 agent 加载仍以 `backend/config/agent_cases/*.yaml` 为主，案例通过 `system_prompt`（内联或 path）驱动，`skill_path` 只是可选增强。此次重构目标是把加载方式统一为：

- 案例加载 = `Skill 文档 + 案例配置`
- Agent 统一�?`backend/config/skills/<skill_name>/` 加载
- 不再依赖 case yaml �?`system_prompt`
- skill 目录除标�?`SKILL.md/reference` 外，新增项目专属�?
	- `config.yaml`（承载原 `story_book.yaml` 的业务配置，去掉 `skill_path`�?
	- 封面图文件（用于 welcome 案例卡片�?
- `config.yaml` 中新增中间件加载声明（例如按案例禁用 subagent�?

## 2. 现状痛点

基于现有代码（`AgentFactory/ConfigLoader/config IPC`）的主要问题�?

1. Prompt 来源分裂：`skill_path/SKILL.md` �?`agent.system_prompt` 并存，优先级硬编码在 `AgentFactory`�?
2. 案例元数据来源与运行时来源分离：welcome 页面�?`agent_cases/*.yaml` 读取，但运行时又�?`AGENT_CASE_ID` + `AgentFactory` 二次解析�?
3. `system_prompt` 仍是校验必填：`ConfigLoader.validateConfig` �?skill-first 目标冲突�?
4. 封面受限�?`src/assets` 编译资源：`CaseList` 仅支�?`import.meta.glob('@/assets/*')`�?
5. 缺少统一的中间件装载声明：是否加�?subagent 当前通过 `sub_agents` 是否为空隐式决定�?

## 3. 目标目录模型

### 3.1 目录结构

```text
backend/config/
	skill/
		index.yaml
		encyclopedia/
			SKILL.md
			config.yaml
			cover.png
			reference/
		story_book/
			SKILL.md
			config.yaml
			cover.png
			reference/
		behavior_correction/
			SKILL.md
			config.yaml
			cover.jpg
			reference/
```

说明�?

- `skills/<skill_name>/` 是唯一配置根�?
- `index.yaml` 负责 `caseId -> skill_name` 映射和默认案例�?
- `config.yaml` 承接�?case yaml 的业务配置，不再包含 `skill_path`�?

### 3.2 案例索引（新增）

`backend/config/skills/index.yaml`（建议）�?

```yaml
default_case_id: encyclopedia
cases:
	encyclopedia:
		skill_name: encyclopedia
	story_book:
		skill_name: story_book
	behavior_correction:
		skill_name: behavior_correction
```

说明�?

- 保留 `caseId` 作为会话稳定标识，不改变现有 session 元数据协议�?
- 通过索引支持 `caseId` �?`skill_name` 解耦（便于目录重命名）�?

## 4. Skill �?config.yaml 设计

## 4.1 字段设计

```yaml
name: story_book_agent
version: 1.2.0
description: 绘本故事生成系统

case:
	id: story_book
	title: 绘本故事
	description: 大纲确认后生成结构化分镜，固定四角色四宫�?
	order: 2
	cover: cover.png

agent:
	name: story_book_agent
	version: 1.2.0
	type: main_agent

runtime:
	prompt:
		source: skill_md
	middlewares:
		deepagent_skill:
			enabled: true
		checkpoint:
			enabled: true
		subagent:
			enabled: false

tools:
	finalize_workflow: {}
	annotate_image_with_numbers: {}
	generate_image:
		enable: true
		config_path: ./tools/t2i.yaml

sub_agents: {}

ui:
	welcome:
		title: 欢迎使用绘本故事生成助手
		subtitle: 我可以帮您生成完整的多页绘本故事
	quick_options: []
```

## 4.2 与旧结构映射关系

- 删除：`skill_path`
- 删除：`agent.system_prompt`
- 保留：`case`、`agent`、`tools`、`sub_agents`、`ui`、`workflow`
- 新增：`runtime.middlewares.*`（显式声明加载策略）

## 4.3 中间件声明规�?

- `runtime.middlewares.subagent.enabled = false` 时，不加载任�?subagent�?
- `runtime.middlewares.deepagent_skill.enabled = true` 时，�?`createDeepAgent` �?`skills: [skillDir]`�?
- `runtime.middlewares.checkpoint.enabled = false` 时，不初始化 `WorkspaceCheckpointSaver`�?

## 5. 加载流程改�?

## 5.1 新流程（目标�?

1. `session/create` �?`session/get` 继续缓存 `caseId`（现状不变）�?
2. `agent:sendMessage` 继续注入 `AGENT_CASE_ID`（现状不变）�?
3. `AgentFactory` 读取 `AGENT_CASE_ID` 后，不再�?`agent_cases/{caseId}.yaml`，改为：
	 - 读取 `skills/index.yaml` 找到 `skill_name`
	 - 解析 `skillDir = backend/config/skills/<skill_name>`
	 - 加载 `skillDir/config.yaml`
	 - 加载 `skillDir/SKILL.md` 正文作为�?system prompt
4. `AgentFactory` 根据 `runtime.middlewares` 组装�?
	 - 是否加载 subagents
	 - 是否传入 `skills`
	 - 是否启用 checkpoint

## 5.2 关键改造点

### A. `backend/agent/case-config-resolver.ts`

- 新增 `resolveSkillBundleByCaseId(configDir, caseId)`
- 输出：`{ caseId, skillName, skillDir, configYamlPath, skillMdPath }`
- 保留�?`resolveMainAgentConfigPath()` 作为兼容 fallback（过渡期�?

### B. `backend/agent/ConfigLoader.ts`

- 新增 `loadSkillConfig(configYamlPath)`
- 新增 `loadSkillPrompt(skillMdPath)`（移�?frontmatter 后正文）
- 校验变更�?
	- 移除�?`system_prompt` 必填校验
	- 新增 `runtime.middlewares` 合法性校�?
	- �?`subagent.enabled=true` �?`sub_agents` 为空时发警告

### C. `backend/agent/AgentFactory.ts`

- 构造函数改为加�?`SkillBundle` 而非 `AgentCaseYaml`
- `createMainAgent()` 改为�?
	- `mainSystemPrompt` 仅来�?`SKILL.md`
	- `skills` �?`runtime.middlewares.deepagent_skill.enabled` 决定
	- `createSubAgents()` �?`runtime.middlewares.subagent.enabled` 决定
	- `checkpoint` �?`runtime.middlewares.checkpoint.enabled` 决定

### D. `electron/ipc/config.ts`

- `loadCaseMetas()` 改为遍历 `skills/index.yaml` + `skills/<name>/config.yaml`
- `loadUIConfigFromYaml(caseId)` 改为 `loadUIConfigFromSkill(caseId)`
- `getCases` 返回增强字段�?
	- `cover`（兼容字段）
	- `coverUrl`（`local-file://` 绝对路径�?

### E. `src/app/components/CaseList.tsx`

- 优先使用后端返回 `coverUrl`
- `coverUrl` 为空时，fallback �?`src/assets` 匹配（保障过渡期兼容�?

## 6. 文件改动清单

## 6.1 新增文件

- `backend/config/skills/index.yaml`
- `backend/config/skills/encyclopedia/config.yaml`
- `backend/config/skills/story_book/config.yaml`
- `backend/config/skills/behavior_correction/config.yaml`
- `backend/config/skills/*/cover.*`
- `docs/plans/agent-skill-first-refactor-design.md`（本文档�?

## 6.2 主要修改文件

- `backend/agent/case-config-resolver.ts`
- `backend/agent/ConfigLoader.ts`
- `backend/agent/AgentFactory.ts`
- `electron/ipc/config.ts`
- `electron/preload.ts`
- `electron/preload.cjs`
- `src/app/components/CaseList.tsx`
- `src/types/types.ts`（若统一 CaseMeta 类型�?
- `AGENTS.md`（目录说明从 `agent_cases/` 补充�?`skill/`�?

## 6.3 兼容保留文件（过渡期�?

- `backend/config/agent_cases/*.yaml` 暂保留只�?fallback，待全量迁移完成后移除�?

## 7. 迁移策略

## 7.1 分阶段发�?

### Phase 1: 双读兼容

- 新实现优先读 `skills/index.yaml`�?
- 若案例不存在�?fallback 到旧 `agent_cases/{caseId}.yaml`�?
- 日志输出 deprecate 警告，提示迁移�?

### Phase 2: 全量迁移

- �?3 个已有案例迁移到 `backend/config/skills/*`�?
- 校验 `getCases`、`config:get(caseId)`、`agent:sendMessage` 全链路通过�?

### Phase 3: 移除旧入�?

- 删除 `agent_cases` 读取逻辑�?
- 删除 `skill_path` �?`agent.system_prompt` 相关兼容代码�?

## 7.2 历史案例迁移规则

- �?case yaml 顶层配置整体迁移�?`config.yaml`�?
- �?`skill_path` 删除�?
- �?`agent.system_prompt` 内容迁移到同目录 `SKILL.md`（正文区）�?
- `case.cover` 改为 skill 目录内文件名（建议统一 `cover.png/jpg`）�?

## 8. 测试与验�?

## 8.1 单元测试

- `case-config-resolver`�?
	- `caseId -> skillName` 映射
	- default case 回退
	- 目录不存在错�?
- `ConfigLoader`�?
	- `config.yaml` 校验
	- `SKILL.md` frontmatter 解析
	- middlewares 字段合法�?

## 8.2 集成测试

- `config:getCases`：返�?case 列表 + `coverUrl`�?
- `config:get(caseId)`：返回目标案�?UI 配置�?
- `agent:sendMessage`�?
	- `story_book`（无 subagent）正常执�?
	- `encyclopedia`（有 subagent）正常执�?

## 8.3 前端验收

- welcome 页面三类案例封面显示正常（均来自 skill 目录）�?
- �?`src/assets` 封面 fallback 在过渡期仍可工作�?

## 9. 风险与规�?

1. 封面加载失败（打包路径差异）
	 - 规避：统一由后端返�?`local-file://` 绝对路径，前端不自行拼路径�?
2. 旧案例未迁移导致运行失败
	 - 规避：双读兼�?+ fallback + deprecate 日志�?
3. subagent 误加�?
	 - 规避：以 `runtime.middlewares.subagent.enabled` 为唯一开关�?
4. 线上配置混乱
	 - 规避：在 `skills/index.yaml` 做唯一映射，禁止隐式目录扫描作为运行时主逻辑�?

## 10. 推荐实施顺序

1. 先改解析器与 Loader（不改前端）�?
2. 再改 `AgentFactory`（切 skill-first，保�?fallback）�?
3. 再改 `config IPC + CaseList`（封面迁移）�?
4. 最后迁移三个历史案例并回归测试�?


