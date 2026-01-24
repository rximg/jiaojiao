# 统一配置系统

参考Python版本的`factory.py`，TypeScript版本现在也支持完整的YAML配置化管理。

## 架构概览

```
app/backend/
├── config/                          # 配置目录
│   ├── main_agent_config.yaml      # 主配置文件
│   ├── mcp/                         # MCP服务配置
│   │   ├── t2i_config.yaml
│   │   └── tts_config.yaml
│   └── sub_agents/                  # SubAgent配置
│       ├── prompt_gen.yaml
│       └── script_gen.yaml
├── prompts/zh/                      # 提示词文件
│   ├── main_agent.yaml
│   ├── prompt_generator.yaml
│   ├── script_generator.yaml
│   └── parse_premise.yaml
└── agent/
    ├── AgentFactory.ts              # Agent工厂类
    ├── ConfigLoader.ts              # 配置加载器
    └── factory.ts                   # 兼容性接口
```

## 核心组件

### 1. ConfigLoader（配置加载器）

负责加载和验证所有YAML配置：

```typescript
import { ConfigLoader } from './agent/ConfigLoader.js';

const loader = new ConfigLoader('./backend/config');
const config = loader.loadMainConfig();
```

**功能：**
- 递归加载主配置及所有子配置
- 验证配置完整性
- 支持相对路径解析
- 自动加载提示词文件

### 2. AgentFactory（Agent工厂）

根据配置创建Agent：

```typescript
import { AgentFactory } from './agent/AgentFactory.js';

const factory = new AgentFactory();
const agent = await factory.createMainAgent();
```

**功能：**
- 自动创建LLM实例
- 动态加载MCP工具
- 注册SubAgents
- 配置验证和错误处理

## 配置文件说明

### 主配置文件 (main_agent_config.yaml)

```yaml
name: main_agent
version: 1.0.0

agent:
  system_prompt:
    path: ./backend/prompts/zh/main_agent.yaml
  
  storage:
    type: local
    path: ./outputs
  
  llm:
    model: qwen-plus
    temperature: 0.7
    max_tokens: 2048

mcp_services:
  t2i:
    enable: true
    type: t2i_mcp
    name: generate_image
    config_path: ./backend/config/mcp/t2i_config.yaml
  
  tts:
    enable: true
    type: tts_mcp
    name: synthesize_speech
    config_path: ./backend/config/mcp/tts_config.yaml

sub_agents:
  prompt_generator:
    enable: true
    name: prompt_generator
    description: 生成文生图提示词
    config_path: ./backend/config/sub_agents/prompt_gen.yaml
```

### MCP配置文件 (t2i_config.yaml)

```yaml
name: t2i_mcp
service:
  type: t2i
  provider: dashscope
  endpoint: https://dashscope.aliyuncs.com/...
  model: wanx-v1
  default_params:
    size: "1024*1024"
    count: 1
  output:
    directory: images
    format: png
```

### SubAgent配置文件 (prompt_gen.yaml)

```yaml
sub_agent:
  name: prompt_generator
  version: 1.0.0
  description: 生成文生图提示词
  system_prompt:
    path: ./backend/prompts/zh/prompt_generator.yaml
  capabilities:
    - 分析主题特征
    - 生成中文提示词
```

## 使用方式

### 1. 基本使用（向后兼容）

```typescript
import { createMainAgent } from './backend/agent/factory.js';

const agent = await createMainAgent();
```

### 2. 使用工厂类（推荐）

```typescript
import { AgentFactory } from './backend/agent/AgentFactory.js';

const factory = new AgentFactory();
const agent = await factory.createMainAgent();
```

### 3. 自定义配置路径

```typescript
const factory = new AgentFactory('/custom/path/config.yaml');
const agent = await factory.createMainAgent();
```

## 配置管理优势

✅ **完全配置化** - 所有组件通过YAML管理，无需修改代码  
✅ **易于扩展** - 添加新的MCP服务或SubAgent只需修改配置  
✅ **类型安全** - TypeScript接口提供完整的类型检查  
✅ **热重载** - 修改配置后重启即可生效  
✅ **版本控制** - 配置文件可独立版本化管理  
✅ **环境隔离** - 支持开发/生产环境不同配置  

## 与Python版本对比

| 功能 | Python版本 | TypeScript版本 |
|------|-----------|----------------|
| 配置加载 | ✅ config_loader.py | ✅ ConfigLoader.ts |
| Agent工厂 | ✅ factory.py | ✅ AgentFactory.ts |
| MCP动态加载 | ✅ | ✅ |
| SubAgent注册 | ✅ | ✅ |
| 提示词管理 | ✅ YAML | ✅ YAML |
| 存储管理 | ✅ StorageManager | ⚠️ 简化版 |
| 配置验证 | ✅ | ✅ |

## 迁移指南

### 从旧版本迁移

1. **保留现有代码** - `factory.ts`仍然可用，提供向后兼容
2. **逐步迁移** - 可以先使用新的配置系统，保持原有调用方式
3. **测试验证** - 新旧系统可以并存，确保功能正常

### 添加新的MCP服务

1. 创建MCP配置文件：`backend/config/mcp/my_service_config.yaml`
2. 在主配置中注册：
```yaml
mcp_services:
  my_service:
    enable: true
    type: my_service_mcp
    name: my_service_tool
    config_path: ./backend/config/mcp/my_service_config.yaml
```
3. 在AgentFactory中添加对应的工具创建逻辑

### 添加新的SubAgent

1. 创建SubAgent配置：`backend/config/sub_agents/my_agent.yaml`
2. 创建提示词文件：`backend/prompts/zh/my_agent.yaml`
3. 在主配置中注册：
```yaml
sub_agents:
  my_agent:
    enable: true
    name: my_agent
    description: 我的Agent
    config_path: ./backend/config/sub_agents/my_agent.yaml
```

## 最佳实践

1. **配置分离** - 将敏感信息（API Key）放在.env，其他放配置文件
2. **版本管理** - 配置文件加入Git，便于追踪变更
3. **文档同步** - 修改配置时更新相关文档
4. **错误处理** - 配置验证失败时提供清晰的错误信息
5. **测试覆盖** - 为配置加载和验证编写单元测试

## 故障排查

### 配置文件找不到

检查路径是否正确，相对路径基于项目根目录（app/）

### 提示词加载失败

确保YAML文件包含`system_prompt`字段

### MCP工具创建失败

检查MCP配置中的`type`字段和对应的实现是否匹配

### SubAgent注册失败

验证SubAgent配置中的`name`、`description`、`system_prompt`都已正确配置
