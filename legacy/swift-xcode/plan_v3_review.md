# PLAN.md V3（双 Agent 并行版）审查报告

## 总体评价

V3 做了两个非常聪明的改进：
1. **压缩了 Agent A 的阶段数**（9→7），把气泡/菜单/设置/导入合并到 A6，偏好/启动/文档合并到 A7。这减少了人工介入的轮次。
2. **引入了 Agent B（Asset Producer）**，与 Agent A 并行工作，通过冻结的 PetPack v1 协议解耦。

但也引入了一些**新问题**，需要注意。

---

## 🔴 A类：结构性缺陷 — 会导致执行失败

### A1. PLAN.md 与 PLAN_v2.md 的关系未定义

**问题**：PLAN.md（V3）是高层概要，每个 Prompt 仅 3-5 行描述。但 PLAN_v2.md 有每个 Prompt 的详细展开（含代码片段、文件清单、验收命令）。

**你的使用方式可能是**：给 Gemini 发送 "全局约束 + A1 的详细内容"。但目前 PLAN.md 里的 A1 只有 5 行，**不包含** V2 中那些关键的代码片段（`NSPanel` 属性列表、`project.yml` 模板等）。

**问题在于**：如果你只把 PLAN.md 的 A1 发给 Gemini Flash，它拿到的信息量不够。如果你把 PLAN_v2.md 的对应 Prompt 发给它，那 PLAN.md 中 A6、A7 的合并版又和 V2 的分离版（Prompt 6/7/8/9）对不上。

**建议**：二选一——
- **方案 A**：将 PLAN.md 作为"主控人的导航图"（你自己看），PLAN_v2.md 作为"实际喂给 AI 的 Prompt 库"，但需要按 V3 的合并逻辑重写 V2 中的 Prompt 6-9 → 合并为两个 Prompt（对应 A6、A7）
- **方案 B**：把 PLAN.md 升级为自包含的完整文档，每个 Prompt 内联所有技术细节（像 V2 那样），废弃 V2

### A2. Agent A 阶段合并后，单个 Prompt 的负载过重

**问题**：A6 把原来的 4 个功能域（气泡、菜单、设置窗口、资产库/导入）压缩成了一个 Prompt。对于 Flash 级别的模型，**一次性要求它写 5 个新文件 + 修改 3 个现有文件 + 实现 4 个独立功能域**，极易出现：
- 漏掉某个功能
- 某个功能写了一半就开始写下一个
- 文件间的接线（wiring）不正确

| Prompt | 新建文件 | 修改文件 | 功能域数量 | 风险评估 |
|---|---|---|---|---|
| A1 | 5 | 0 | 2 (窗口+菜单) | ✅ 安全 |
| A2 | 3 | 0 | 1 (数据模型) | ✅ 安全 |
| A3 | 6+ | 0 | 1 (素材生成) | ✅ 安全 |
| A4 | 2 | 2 | 1 (渲染) | ✅ 安全 |
| A5 | 2 | 2 | 1 (状态机) | ✅ 安全 |
| **A6** | **5** | **3** | **4 (气泡+菜单+设置+导入)** | **🔴 过重** |
| A7 | 3 | 2 | 3 (偏好+启动+文档) | 🟡 临界 |

**建议**：把 A6 拆回两步——
- **A6a**：气泡 + 菜单补齐（对应 V2 的 Prompt 6）
- **A6b**：资产库 + 导入 + 设置窗口（对应 V2 的 Prompt 7）

这样 Flash 在每一步的复杂度和 V2 一致，更不容易偏离。

---

## 🟡 B类：数据合同不一致

### B1. 画布尺寸冲突：768 vs 512

**问题**：PLAN.md 中存在两套画布尺寸：

| 位置 | 画布尺寸 | 主体 | defaultScale |
|---|---|---|---|
| Shared Contract（第 35 行）| **768×768** | ~512px | 0.67 |
| PLAN_v2.md manifest 示例（第 133 行）| **512×512** | — | 0.25 |
| PLAN.md 硬规则（第 50 行）| "建议 768×768" | ~512px | — |

Agent A 的 Validator 和 Agent B 的素材生成用的是同一份合同。如果合同里写 768，但 V2 里的代码示例和 A3 的占位脚本用的是 512，**Validator 能通过但视觉效果会不一致**——占位宠物在 512px 画布上是小圆，真实宠物在 768px 画布上是大图，切换时会跳。

**建议**：**统一为一个尺寸**。既然 Shared Contract 已经写了 768，那就全部统一为 768，包括 A3 的占位脚本也用 768×768。

### B2. `PetAction` 的 `name` 字段来源不明

**问题**：核心接口合同中说 `PetAction` 包含 `name` 字段，但 `manifest.json` 示例中 action 是作为 dictionary 的 key（如 `"idle": {...}`），value 中没有 `name` 字段。

**问题是**：解码时 `name` 从哪里来？是从 dictionary key 赋值，还是 JSON 中显式包含？

**建议**：明确说明 "action 的 name 由 manifest 的 dictionary key 决定，不在 JSON value 中重复"，并在 PetPack 的 Swift 数据模型说明中指出 `actions` 字段应该是 `[String: PetAction]` 而非 `[PetAction]`。

---

## 🟢 C类：Agent B 的 Prompt 不够"防呆"

### C1. Agent B 没有构建/验证工具

**问题**：Agent B（Asset Producer）的 B5（自检）说 "运行或请求 Agent A 运行 validator"。但如果 Agent B 是一个独立的 AI 对话，它**没有 Xcode 环境**，也没有 Agent A 的 Validator 代码。它如何自检？

**建议**：为 Agent B 提供一个**独立的 Python 校验脚本**（`scripts/validate_petpack.py`），用 Python 实现与 Swift Validator 相同的校验逻辑（检查目录结构、帧尺寸一致性、manifest 字段完整性）。这样 Agent B 可以在没有 Xcode 的情况下自检。

### C2. Agent B 缺少具体的图片生成工具指引

**问题**：B2 说"生成全身、透明背景、居中、软萌绘本风主形象"，B3 说"生成 5 个动作帧"，但没有说明**用什么工具/API 生成**。如果 Agent B 是 Gemini Flash，它自身没有图片生成能力。如果是使用外部工具（如 Midjourney、Stable Diffusion、DALL-E），需要明确指出。

**建议**：在 Agent B 的全局约束中明确：
- "使用 [具体工具名] 生成图片"
- "每张图片必须先生成 1024×1024，然后用 Python PIL 裁切/缩放到 768×768"
- "透明背景通过 [rembg / 手动抠图] 实现"

### C3. Agent B 的帧动画一致性没有可量化的标准

**问题**：B3 说"所有动作保持同画布、同视觉锚点，切动作时脚底/身体中心不明显跳位"。但"不明显"是主观标准。对于 AI 生成的图片，帧间一致性极难保证。

**建议**：增加一条量化约束：
- "同一动作的所有帧，主体的外接矩形中心点偏移不得超过 ±20px"
- "可用 Python 脚本检测每帧主体的非透明区域 bounding box，验证中心漂移"

---

## 🔵 D类：锦上添花的改进

### D1. Parallel Workflow 缺少时间线

Step 0-5 没有说明预期的时间节奏。建议加上：
```
Step 0 (Day 0):  主控冻结 PetPack v1
Step 1 (Day 1-2): Agent A: A1-A3 | Agent B: B1-B2
Step 2 (Day 2-3): Agent A: A4-A5 | Agent B: B3-B4
Step 3 (Day 3):   首次集成测试
Step 4 (Day 3-4): Bug 修复轮
Step 5 (Day 4):   A6-A7 + 最终验收
```

### D2. project.yml 模板从 PLAN.md 中消失了

V3 的 A1 说"创建 XcodeGen project.yml，macOS deployment target 13.0，LSUIElement = true"，但没有提供完整模板。V2 中有完整的 YAML 模板。

如果你打算直接用 PLAN.md 的 A1 内容作为 Prompt，Flash 需要自己"发明"一个 project.yml 结构。**建议把 V2 中的 project.yml 模板引用到 PLAN.md 的全局约束或 A1 中。**

### D3. 缺少 `.gitignore`

整个计划中没有提到 `.gitignore`。XcodeGen 项目会在项目根目录生成 `.xcodeproj`，这个文件不应该提交到 Git（因为可以随时从 `project.yml` 重新生成）。

建议在 A1 中加一条："创建 `.gitignore`，忽略 `*.xcodeproj`、`.build/`、`DerivedData/`"。

---

## 总结：关键行动项

| 优先级 | 问题 | 建议 |
|---|---|---|
| 🔴 | PLAN.md vs PLAN_v2.md 的关系未定义 | 选定一个为主文档，确保 Agent 拿到的 Prompt 是自包含的 |
| 🔴 | A6 负载过重（4 个功能域） | 拆分为 A6a（气泡+菜单）和 A6b（资产库+设置） |
| 🟡 | 画布尺寸 768 vs 512 冲突 | 统一为 768 |
| 🟡 | `PetAction.name` 来源不明 | 明确 `actions` 是 `[String: PetAction]`，name 来自 key |
| 🟢 | Agent B 无法自检 | 提供独立的 Python 校验脚本 |
| 🟢 | Agent B 图片生成工具未指定 | 明确使用哪个生成工具和后处理流程 |
| 🔵 | 缺少 project.yml 模板（已在 V2 中有） | 内联或引用 |
| 🔵 | 缺少 .gitignore | 加到 A1 |
