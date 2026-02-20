# 行为纠正绘本案例设计方案

> **案例名称**：behavior_correction（行为纠正）  
> **目标用户**：2–8 岁儿童的家长  
> **用途**：正向引导 / 积极引导、规则建立 / 立规矩、针对反复出现的坏习惯，建立家庭规则、安全规则

---

## 1. 与百科绘本 (encyclopedia) 的对比

| 维度 | 百科绘本 (encyclopedia) | 行为纠正 (behavior_correction) |
|------|------------------------|-------------------------------|
| 图片内容 | 单一全景特征分解图 | **双分镜**：分镜1=不良行为，分镜2=行为后果 |
| 图片提示词生成 | 委托 sub_agent `prompt_generator` | **main_agent 直接生成**（提示词短，无需子代理） |
| 台词生成 | 调用 VL 模型 `generate_script_from_image` | **main_agent 直接输出 2 句台词**（分镜1台词 + 分镜2台词） |
| 台词位置 | VL 模型返回 x/y 坐标 | **固定位置**（分镜上/下各一句，无需坐标） |
| 数字标注 | `annotate_image_numbers` 画编号 | **不需要**（只有 2 个分镜，位置固定） |
| 语音合成 | `synthesize_speech` | **同样使用** `synthesize_speech` |
| 完成检查 | `finalize_workflow` | **同样使用** `finalize_workflow` |
| sub_agents | `prompt_generator` | **无**（不需要子代理） |

---

## 2. 工作流设计（4 步）

行为纠正案例精简为 **4 个步骤**（对比百科的 6 步）：

| 步骤 | Todo content（前端识别用，不可改写） | 操作说明 |
|------|--------------------------------------|----------|
| 第 1 步 | 生成双分镜图片 | main_agent 根据用户输入的坏习惯，构造双分镜提示词，直接调用 `generate_image(prompt: "...", size: "1472*1104")` |
| 第 2 步 | 生成台词 | main_agent 直接输出 2 句台词：分镜1台词（描述不良行为）、分镜2台词（描述行为后果） |
| 第 3 步 | 将台词合成语音 | 调用 `synthesize_speech(texts: [分镜1台词, 分镜2台词], voice: "chinese_female", format: "mp3")` |
| 第 4 步 | 完成工作流并返回结果 | 调用 `finalize_workflow(imagePath, audioPath, scriptText)` |

---

## 3. System Prompt 设计

```
你是行为纠正绘本制作助手：根据用户描述的儿童不良行为，生成一张双分镜绘本图片与配套音频，帮助家长通过正向引导建立规则。

## 双分镜规则
- 一张图片包含两个分镜，左右排列（或上下排列）
- **分镜1（左/上）**：展示宝宝的不良行为场景（如：爬餐桌上，用手抓饭、在墙上乱画）
- **分镜2（右/下）**：展示该不良行为可能导致的后果或正确行为的对比（如：从餐桌上摔下来，手上沾满油腻弄脏衣服、用画纸画出漂亮的画）

## Todo 列表（固定 4 项，与下方步骤一一对应）
开始时用 write_todos 创建 4 项，每项的 content **必须严格使用**下面之一（不要改写、不要加入用户主题）：
第1项 content: 「生成双分镜图片」；第2项: 「生成台词」；第3项: 「将台词合成语音」；第4项: 「完成工作流并返回结果」。
后续只按「第 n 项」更新 status 为 completed，不要修改 content；这样前端能正确识别每一步进度。

## 工作流程（与上述 4 项一一对应，每步完成后立即 write_todos 将对应项标 completed）

1. **图片**（第 1 项）：
   - 根据用户描述的不良行为，直接构造文生图提示词
   - 提示词要求：一张图包含两个分镜，分镜1展示不良行为，分镜2展示行为后果
   - 提示词格式示例：「儿童绘本插画，卡通风格，明亮色彩，一张图分为左右两个场景。左边场景：一个[年龄]的宝宝正在[不良行为描述]，表情[相关表情]。右边场景：[不良行为的后果描述]，宝宝表情[相关表情]。背景简洁温馨，适合幼儿观看。」
   - 调用 generate_image(prompt: "构造的提示词", size: "1472*1104")

2. **台词**（第 2 项）：
   - 根据用户描述，直接生成 2 句台词：
     - 分镜1台词：用急促，慌张的语言描述不良行为（如"宝宝爬餐桌上啦，宝宝用手抓饭，手上油油的"）
     - 分镜2台词：描述严重后果，展现危害，用正向引导语言描述后果或正确做法，（如"宝宝摔下来啦，好痛痛，以后再也不爬高了。用勺子吃饭，干干净净真棒！"）
   - 台词风格：简短（10-20字）、口语化、正向引导、必要时候加一些语气词。

3. **语音**（第 3 项）：synthesize_speech(texts: [分镜1台词, 分镜2台词], voice: "chinese_female", format: "mp3")

4. **收尾**（第 4 项）：① 调用 finalize_workflow(imagePath, audioPath, scriptText)；② 调用 write_todos 将第 4 项标为 completed；③ 向用户展示完成摘要

## 提示词构造规范
生成图片的提示词应包含以下元素：
- 画风：儿童绘本插画，卡通风格，色彩明亮温暖
- 构图：一张图分为左右（或上下）两个场景，中间有明显分隔
- 分镜1（左/上）：宝宝做出不良行为的场景，表情自然
- 分镜2（右/下）：不良行为的后果场景，或正确行为的对比
- 背景：温馨家庭环境，简洁干净
- 禁止元素：不含文字、不含恐怖元素、不含暴力场景

## 台词规范
- 每句 10-20 个字
- 使用温和、正向的语气
- 分镜1台词：客观描述行为，不批评
- 分镜2台词：强调正确做法或自然后果，给出正向引导
- 语言适合 2-8 岁儿童理解

## 要求
- 严格按 1→4 顺序执行。
- **每步完成后必须立即调用 write_todos**：完成步骤 1 → 立即 write_todos 将第 1 项标 completed → 再执行步骤 2；依此类推。
- 第 4 步：finalize_workflow 成功后立即 write_todos 将第 4 项标为 completed，再回复用户。
- 4 步 todos 的 content 必须与上述 Todo 列表一致，最后给出清晰摘要。

## 重新打开会话或从某步重做
- 当用户**重新打开已有会话**或在对话中说「重新生成图片」「从第 2 步开始」等时，应先理解已完成到哪一步，再用 write_todos 调整状态，只执行需要的步骤。
```

---

## 4. Tools 配置

行为纠正案例只需 3 个工具（对比百科的 6 个）：

```yaml
tools:
  finalize_workflow: {}        # 检查文件并完成流程
  delete_artifacts: {}         # 删除 session 下产物，重新生成前需先删除
  generate_image:
    enable: true
    config_path: ./tools/t2i.yaml
  synthesize_speech:
    enable: true
    config_path: ./tools/tts.yaml
```

**不需要的工具**：
- ~~`annotate_image_numbers`~~：双分镜位置固定，无需数字标注
- ~~`generate_script_from_image`~~：台词由 main_agent 直接生成，无需 VL 模型

---

## 5. Sub Agents 配置

```yaml
# 无 sub_agents — 提示词足够短，main_agent 直接在 prompt 中构造
```

**不需要 `prompt_generator` 子代理的原因**：
- 百科绘本的提示词需要复杂的特征分解、布局规范，提示词很长
- 行为纠正的图片提示词简短直接：只需描述"左边不良行为 + 右边后果"，main_agent 完全能胜任

---

## 6. Workflow 配置

```yaml
workflow:
  steps:
    - id: 1
      name: 生成双分镜图片
      tool: generate_image
      required: true
    
    - id: 2
      name: 生成台词
      tool: null  # main_agent 直接生成，不调用外部工具
      required: true
    
    - id: 3
      name: 将台词合成语音
      tool: synthesize_speech
      required: true
    
    - id: 4
      name: 完成工作流并返回结果
      tool: finalize_workflow
      required: true
```

---

## 7. UI 配置

### 7.1 Welcome

```yaml
ui:
  welcome:
    title: 欢迎使用行为纠正绘本生成助手
    subtitle: 我可以帮您生成正向引导绘本，帮助宝宝建立良好的行为习惯
    
    instructions:
      title: 请告诉我
      items:
        - 行为：宝宝的不良习惯（如：用手抓饭、打人、乱扔玩具）
        - 年龄：宝宝的年龄（如：2岁、4岁）
        - 场景：行为发生的场景（可选，如：吃饭时、在幼儿园）
    
    footer: 或者直接点击下方的快捷选项开始！
```

### 7.2 Quick Options

```yaml
  quick_options:
    - label: 宝宝用手抓饭
      description: 培养使用餐具的好习惯
      prompt: 2岁宝宝总是用手抓饭，不肯用勺子

    - label: 宝宝打人咬人
      description: 学会温柔表达情绪
      prompt: 3岁宝宝生气时会打人咬人

    - label: 宝宝不刷牙
      description: 建立口腔卫生习惯
      prompt: 3岁宝宝不愿意刷牙

    - label: 宝宝乱扔玩具
      description: 学会收拾整理
      prompt: 4岁宝宝玩完玩具不收拾，到处乱扔

    - label: 宝宝喜欢爬高
      description: 引导孩子不要爬高
      prompt: 3岁宝宝喜欢爬桌子上

    - label: 宝宝不肯睡觉
      description: 建立良好作息规律
      prompt: 2岁宝宝晚上不肯按时睡觉
```

---

## 8. 完整 YAML 文件结构

文件路径：`backend/config/agent_cases/behavior_correction.yaml`

```yaml
name: main_agent
version: 1.0.0
description: 行为纠正绘本制作系统

agent:
  name: behavior_correction_agent
  version: 1.0.0
  type: main_agent
  
  system_prompt: |
    （见第 3 节完整内容）
    
  llm:
    model: qwen3-plus
    temperature: 0.1
    max_tokens: 20000
  
  debug:
    log_llm_calls: false
    save_llm_calls: false

tools:
  finalize_workflow: {}
  delete_artifacts: {}
  generate_image:
    enable: true
    config_path: ./tools/t2i.yaml
  synthesize_speech:
    enable: true
    config_path: ./tools/tts.yaml

# 无 sub_agents

workflow:
  steps:
    - id: 1
      name: 生成双分镜图片
      tool: generate_image
      required: true
    - id: 2
      name: 生成台词
      required: true
    - id: 3
      name: 将台词合成语音
      tool: synthesize_speech
      required: true
    - id: 4
      name: 完成工作流并返回结果
      tool: finalize_workflow
      required: true

ui:
  welcome:
    title: 欢迎使用行为纠正绘本生成助手
    subtitle: 我可以帮您生成正向引导绘本，帮助宝宝建立良好的行为习惯
    instructions:
      title: 请告诉我
      items:
        - 行为：宝宝的不良习惯（如：用手抓饭、打人、乱扔玩具）
        - 年龄：宝宝的年龄（如：2岁、4岁）
        - 场景：行为发生的场景（可选，如：吃饭时、在幼儿园）
    footer: 或者直接点击下方的快捷选项开始！
  quick_options:
    - label: 宝宝用手抓饭
      description: 培养使用餐具的好习惯
      prompt: 2岁宝宝总是用手抓饭，不肯用勺子
    - label: 宝宝打人咬人
      description: 学会温柔表达情绪
      prompt: 3岁宝宝生气时会打人咬人
    - label: 宝宝不刷牙
      description: 建立口腔卫生习惯
      prompt: 3岁宝宝不愿意刷牙
    - label: 宝宝乱扔玩具
      description: 学会收拾整理
      prompt: 4岁宝宝玩完玩具不收拾，到处乱扔
    - label: 宝宝喜欢爬高
      description: 引导孩子不要爬高
      prompt: 3岁宝宝喜欢爬桌子上
    - label: 宝宝不肯睡觉
      description: 建立良好作息规律
      prompt: 2岁宝宝晚上不肯按时睡觉
```

---

## 9. 图片尺寸说明

使用 `1472*1104`（横版 4:3），适合左右双分镜布局。每个分镜约 736×1104 的空间。

也可以选用 `1104*1472`（竖版），适合上下双分镜布局，每个分镜约 1104×736。

建议默认使用横版 `1472*1104`，在 t2i.yaml 的 default_params 中已配置此尺寸。

---

## 10. 关键设计决策

| 决策 | 理由 |
|------|------|
| 4 步而非 6 步 | 去掉了子代理提示词生成和数字标注两步，流程更精简 |
| main_agent 直接生成提示词 | 行为纠正的提示词结构固定（左不良行为+右后果），无需复杂的特征分解 |
| main_agent 直接生成台词 | 只需 2 句台词，无需 VL 模型看图识别元素 |
| 无数字标注 | 双分镜位置固定（左/右），用户一目了然，无需编号 |
| 正向引导语气 | 分镜2台词强调正确做法而非批评，符合正面教育理念 |
| 横版 1472×1104 | 适合左右分镜布局，每个分镜有足够空间 |

---

## 11. 示例运行流程

**用户输入**：「3岁宝宝总是用手抓饭」

**步骤 1 — 生成双分镜图片**：
- main_agent 构造提示词：「儿童绘本插画，卡通风格，明亮温暖色彩，一张图分为左右两个场景，中间有虚线分隔。左边场景：一个3岁的可爱宝宝坐在餐椅上用手抓碗里的米饭，手上和脸上沾满饭粒，表情开心。右边场景：同一个宝宝的手和衣服上沾满油腻的饭菜污渍，碗里的饭洒在桌上，宝宝看着脏兮兮的手表情困惑。背景是温馨的家庭餐厅。」
- 调用 `generate_image(prompt: "...", size: "1472*1104")`

**步骤 2 — 生成台词**：
- 分镜1台词：「宝宝用手抓饭，饭粒粘满小手」
- 分镜2台词：「用勺子吃饭，小手干干净净真棒！」

**步骤 3 — 合成语音**：
- 调用 `synthesize_speech(texts: ["宝宝用手抓饭，饭粒粘满小手", "用勺子吃饭，小手干干净净真棒！"], voice: "chinese_female", format: "mp3")`

**步骤 4 — 完成工作流**：
- 调用 `finalize_workflow(imagePath, audioPath, scriptText)`
- 输出摘要

---

*文档创建于 2026-02-19*
