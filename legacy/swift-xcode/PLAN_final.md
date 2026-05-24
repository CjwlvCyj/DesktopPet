# 双 Agent 并行实施计划 Final：自包含详版

## Summary
- 以一份自包含计划为唯一主文档。
- 先冻结 `PetPack v1`，再并行启动 Agent A 和 Agent B。
- Agent A 负责 macOS app；Agent B 负责宠物资源包。
- Beta 主路径：SwiftUI + AppKit `NSPanel` + SpriteKit + PNG 序列帧。
- 禁止：App 内 AI、联网、遥测、Live2D、自动更新、签名公证。

## Shared Contract：PetPack v1
固定结构：

```text
PetName.petpack/
  manifest.json
  preview.png
  license.txt
  bubbles.json
  actions/
    idle/frame_000.png
    walk/frame_000.png
    tap_happy/frame_000.png
    dragged/frame_000.png
    rest/frame_000.png
```

`manifest.json` 固定示例：

```json
{
  "schemaVersion": 1,
  "id": "mimi-cat",
  "displayName": "Mimi",
  "species": "cat",
  "style": "soft_storybook",
  "version": "0.1.0",
  "canvas": { "width": 768, "height": 768, "anchorX": 0.5, "anchorY": 0.0 },
  "defaultScale": 0.67,
  "actions": {
    "idle": { "path": "actions/idle", "fps": 8, "loop": true, "required": true, "fallback": null },
    "walk": { "path": "actions/walk", "fps": 10, "loop": true, "required": false, "fallback": "idle" },
    "tap_happy": { "path": "actions/tap_happy", "fps": 12, "loop": false, "required": false, "fallback": "idle" },
    "dragged": { "path": "actions/dragged", "fps": 8, "loop": true, "required": false, "fallback": "idle" },
    "rest": { "path": "actions/rest", "fps": 4, "loop": true, "required": false, "fallback": "idle" }
  }
}
```

关键约束：
- 统一画布为 `768x768`，主体约 `512px`。
- `actions` 在 Swift 中解码为 `[String: PetAction]`；`PetAction` 不在 JSON value 里重复 `name`，动作名来自 dictionary key。
- `idle` 必须存在且 `required == true`，否则拒绝导入。
- 所有 PNG 必须透明、同画布尺寸、同视觉锚点。
- 原始宠物照片不得进入 `.petpack`。
- `license.txt` 必须说明照片来源、AI/制作流程、beta 分发限制。

## Agent A：App Engineer 全局规则
技术栈：
- SwiftUI app lifecycle
- AppKit `NSPanel`
- SpriteKit
- XcodeGen
- macOS 13+

必须使用 XcodeGen：
- 创建 `project.yml`
- 禁止手写 `.xcodeproj/.pbxproj`
- 禁止 `swift package generate-xcodeproj`

构建命令：
```bash
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
xcodebuild test -project DesktopPet.xcodeproj -scheme DesktopPet -destination 'platform=macOS'
```

固定目录：
```text
Sources/App
Sources/Window
Sources/Rendering
Sources/Model
Sources/Behavior
Sources/Assets
Sources/UI
Sources/Preferences
Resources/DefaultPetPack
Tests
scripts
docs
```

`project.yml` 必须包含：
```yaml
name: DesktopPet
options:
  bundleIdPrefix: com.desktoppet
  deploymentTarget:
    macOS: "13.0"
  xcodeVersion: "15.0"

targets:
  DesktopPet:
    type: application
    platform: macOS
    sources:
      - path: Sources
    resources:
      - path: Resources
    settings:
      base:
        PRODUCT_NAME: DesktopPet
        PRODUCT_BUNDLE_IDENTIFIER: com.desktoppet.app
        MACOSX_DEPLOYMENT_TARGET: "13.0"
        GENERATE_INFOPLIST_FILE: true
        INFOPLIST_KEY_LSUIElement: true
        INFOPLIST_KEY_CFBundleDisplayName: "Desktop Pet"
    dependencies:
      - sdk: SpriteKit.framework
      - sdk: ServiceManagement.framework

  DesktopPetTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - path: Tests
    dependencies:
      - target: DesktopPet
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.desktoppet.tests
```

## Agent A 阶段
### A1：项目骨架与透明窗口
创建：
- `project.yml`
- `.gitignore`
- `Sources/App/DesktopPetApp.swift`
- `Sources/Window/PetPanel.swift`
- `Sources/Window/PetWindowManager.swift`
- `Sources/UI/MenuBarManager.swift`

要求：
- `.gitignore` 忽略 `*.xcodeproj`、`DerivedData/`、`.build/`、`*.xcuserdata`。
- `LSUIElement = true`，不显示 Dock 主窗口。
- `PetPanel` 使用 `.borderless`、`.nonactivatingPanel`、透明背景、`.floating`、`.canJoinAllSpaces`、`.fullScreenAuxiliary`。
- 先用 128x128 半透明圆形 NSView 占位。
- 菜单栏用 `pawprint.fill`，包含显示/隐藏、重置位置、退出。
- `resetPosition()` 放到主屏幕 `visibleFrame` 底部中央。
- 使用 `setFrameAutosaveName("PetWindowPosition")` 保存位置（必须在 `orderFront` 之前调用）。

验收：
- `xcodegen generate` 无报错。
- `xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build` 编译通过。
- 启动后菜单栏有图标。
- 无普通主窗口，无 Dock 图标。
- 占位宠物可拖拽、隐藏、重置位置。
- 重启后窗口位置恢复。

### A2：PetPack 模型与 Validator
创建：
- `Sources/Model/PetPack.swift`
- `Sources/Model/PetPackValidator.swift`
- `Tests/PetPackValidatorTests.swift`

要求：
- `PetPack/PetAction/PetCanvas` 全部 `Codable`。
- `actions` 类型为 `[String: PetAction]`。
- Validator 校验 manifest、schemaVersion、`idle`、动作目录、PNG 帧存在、帧尺寸一致、`license.txt`。
- 错误 enum 可读，覆盖 manifest 缺失、解码失败、缺 idle、目录缺失、无帧、尺寸不一致、license 缺失。

验收：
- 有效包、缺 manifest、缺 idle、尺寸不一致的 XCTest 全过。
- 错误信息可读。

### A3：默认占位资源包
创建：
- `scripts/generate_placeholder_assets.py`
- `Resources/DefaultPetPack/manifest.json`
- `Resources/DefaultPetPack/preview.png`
- `Resources/DefaultPetPack/bubbles.json`
- `Resources/DefaultPetPack/license.txt`
- `Resources/DefaultPetPack/actions/idle/frame_000.png` ... `frame_007.png`
- `Resources/DefaultPetPack/actions/walk/frame_000.png` ... `frame_007.png`
- `Resources/DefaultPetPack/actions/tap_happy/frame_000.png` ... `frame_005.png`
- `Resources/DefaultPetPack/actions/dragged/frame_000.png` ... `frame_003.png`
- `Resources/DefaultPetPack/actions/rest/frame_000.png` ... `frame_003.png`

要求：
- 用 Pillow 生成 `768x768` 透明 PNG。
- `idle` 8 帧、`walk` 8 帧、`tap_happy` 6 帧、`dragged` 4 帧、`rest` 4 帧。
- 占位素材用简单彩色圆形，不同动作用不同颜色和简单动画区分（如脉动、位移、跳跃）。
- 主体约 512px，位置和锚点与真实资源规范一致。
- 同时生成 `manifest.json`（字段与 Shared Contract 一致）、`preview.png`（复用 idle/frame_000.png）、`bubbles.json`、`license.txt`。
- 脚本可重复运行（先清空输出目录再生成）。

验收：
- `python3 scripts/generate_placeholder_assets.py` 成功运行。
- `ls Resources/DefaultPetPack/actions/idle/` 有 frame_000.png 到 frame_007.png。
- 默认包通过 Validator 的 XCTest。

### A4：SpriteKit 渲染器
创建：
- `Sources/Rendering/PetRendererAdapter.swift`
- `Sources/Rendering/SpriteKitRenderer.swift`

修改：
- `Sources/Window/PetPanel.swift` — 将占位 NSView 替换为 SKView
- `Sources/Window/PetWindowManager.swift` — 启动时加载 DefaultPetPack 并播放 idle

要求：
- 协议暴露 `load(pack:baseURL:)`、`play(action:)`、`stop()`、`setScale(_:)`、`onActionComplete`。
- 预加载 PNG 为 `SKTexture`。
- loop 动作用 `repeatForever`，非 loop 完成后回调。
- fallback 顺序：请求动作 -> manifest fallback -> `idle`。
- 透明链路必须完整（缺任何一项都会导致灰色/烟雾色背景）：
  - `panel.isOpaque = false`
  - `panel.backgroundColor = .clear`
  - `skView.allowsTransparency = true` ← 最容易遗漏
  - `scene.backgroundColor = .clear`
- 隐藏时 `skView.isPaused = true`，显示时恢复。

验收：
- build 通过。
- 启动播放默认 `idle` 动画。
- 背景完全透明（不是灰色/烟雾色）。
- 拖拽正常。

### A5：行为状态机
创建：
- `Sources/Behavior/PetBehaviorEngine.swift`
- `Tests/PetBehaviorEngineTests.swift`

要求：
- 纯逻辑，不得 import AppKit/SpriteKit/SwiftUI。
- 输入：`func handle(event: PetEvent) -> [PetCommand]`。
- 状态：`idle/walking/tapped/dragging/resting/hidden/error`。
- 事件：`appStarted/petClicked/dragStarted/dragEnded/idleTimerFired/restRequested/hideRequested/showRequested/actionCompleted/packChanged/errorOccurred`。
- 命令：`playAction/showBubble/moveWindow/savePosition/showWindow/hideWindow/setError`。
- 主要转换规则：
  - `idle` + `petClicked` → `tapped`，发出 `[playAction("tap_happy"), showBubble]`
  - `idle` + `dragStarted` → `dragging`，发出 `[playAction("dragged")]`
  - `dragging` + `dragEnded` → `idle`，发出 `[savePosition, playAction("idle")]`
  - `idle` + `idleTimerFired` → `walking`，发出 `[playAction("walk"), moveWindow(dx, dy)]`
  - `walking` + `actionCompleted` → `idle`，发出 `[playAction("idle")]`
  - `tapped` + `actionCompleted` → `idle`，发出 `[playAction("idle")]`
  - 任意状态 + `hideRequested` → `hidden`，发出 `[hideWindow]`
  - `hidden` + `showRequested` → `idle`，发出 `[showWindow, playAction("idle")]`
  - 任意状态 + `errorOccurred` → `error`，发出 `[setError]`
- 本阶段只创建纯状态机和测试，不接入窗口。接入在 A6 完成。

验收：
- 状态转换 XCTest 全过。
- 所有状态转换规则都有测试覆盖。

### A6：交互接入、气泡、菜单补齐
创建：
- `Sources/UI/BubbleView.swift`

修改：
- `Sources/Window/PetPanel.swift` — 重写 `mouseDown`/`mouseDragged`/`mouseUp`，通过回调通知 PetWindowManager
- `Sources/Window/PetWindowManager.swift` — 接入 BehaviorEngine，执行命令，管理 idle timer 和气泡
- `Sources/UI/MenuBarManager.swift` — 补齐所有菜单项

要求：

**接入状态机（最重要）：**
- 在 `PetWindowManager` 中持有 `PetBehaviorEngine` 实例。
- `PetPanel` 的 `mouseDown` 通过回调通知 `PetWindowManager`，由 `PetWindowManager` 判断是点击还是拖拽，转化为 `PetEvent`（`petClicked` / `dragStarted` / `dragEnded`），调用 `engine.handle(event:)` 获取 `[PetCommand]`。
- `PetWindowManager` 逐个执行返回的命令：
  - `playAction(name)` → 调用 `SpriteKitRenderer.play(action:)`
  - `showBubble` → 显示气泡
  - `moveWindow(dx, dy)` → 用 `NSAnimationContext` 平滑移动窗口
  - `savePosition` → 位置已由 `setFrameAutosaveName` 自动处理
  - `showWindow` / `hideWindow` → 调用 `showPet()` / `hidePet()`
- 设置一个 Timer，每 20-45 秒（随机间隔）触发 `idleTimerFired` 事件。
- walk 移动 80-220px，限制在当前屏幕 `visibleFrame` 内。

**气泡：**
- 气泡使用独立透明小 `NSPanel`（`.borderless`、`.nonactivatingPanel`、透明背景、`level` 比宠物窗口高 1），跟随宠物窗口位置（偏移到宠物上方）。
- 从 `bubbles.json` 按当前动作随机选一条显示。
- 2-4 秒后自动消失，同时最多一个。

**菜单补齐：**
- 显示/隐藏宠物（标题根据状态切换）
- 分隔线
- 点击穿透（勾选项）— `PetPanel.ignoresMouseEvents = true`，必须能从菜单栏关闭穿透恢复交互
- 置顶（勾选项）— 切换 `level` 为 `.floating` / `.normal`
- 重置位置
- 分隔线
- 休息 — 触发 `restRequested`
- 宠物管理...（**本阶段创建但设为 disabled，A7 启用**）
- 分隔线
- 开机启动（**本阶段创建但设为 disabled，A8 启用**）
- 退出

验收：
- build 通过。
- 点击宠物有动作和气泡。
- 拖拽期间播放 dragged，松手回 idle。
- 自动 walk 不出屏幕边界。
- 穿透后不挡下面窗口，菜单可恢复交互。
- 宠物管理和开机启动菜单项存在但灰色不可点击。

### A7：资产库、导入、设置窗口
创建：
- `Sources/Assets/PetAssetLibrary.swift`
- `Sources/Assets/PetPackImporter.swift`
- `Sources/UI/SettingsWindow.swift`

修改：
- `Sources/UI/MenuBarManager.swift` — 启用"宠物管理"菜单项，点击打开设置窗口
- `Sources/Window/PetWindowManager.swift` — 接入宠物切换逻辑

要求：
- 导入目录：`~/Library/Application Support/DesktopPet/PetPacks/`。
- 导入流程：用户通过 `NSOpenPanel` 选择文件夹 -> 复制到 staging 临时目录 -> 运行 Validator -> 通过则移动到正式目录；失败则删除 staging 并返回错误。
- 默认包来自 app bundle Resources，不可删除。
- 设置窗口（SwiftUI）显示宠物列表、preview 图标、名称、当前标记、导入按钮、删除按钮、导入错误提示。
- 删除当前宠物后自动切回默认包。
- 因为 `LSUIElement = true`，打开设置窗口时必须临时切换 activationPolicy，否则窗口无法正常显示在前台：
```swift
// 打开设置窗口时：
NSApp.setActivationPolicy(.regular)
settingsWindow.makeKeyAndOrderFront(nil)
NSApp.activate(ignoringOtherApps: true)

// 关闭设置窗口后恢复：
NSApp.setActivationPolicy(.accessory)
```

验收：
- 可导入 Agent B 产出的 `.petpack`。
- 可在多只宠物间切换，宠物立即更新。
- 重启恢复上次选择的宠物。
- 删除当前宠物后自动切回默认。
- 无效包导入时错误信息清楚。
- 设置窗口能正常弹出到前台，关闭后 Dock 图标消失。

### A8：偏好、开机启动、屏幕变化
创建：
- `Sources/Preferences/PetPreferencesStore.swift`

修改：
- `Sources/UI/MenuBarManager.swift` — 启用"开机启动"菜单项
- `Sources/Window/PetWindowManager.swift` — 接入偏好读写、屏幕变化检测

要求：
- 用 `UserDefaults` 保存当前 pet id、缩放、置顶、点击穿透、开机启动偏好。
- 窗口位置只用 `setFrameAutosaveName`，不要手动存储位置。
- 开机启动使用 `SMAppService.mainApp`：
```swift
import ServiceManagement

// 注册
func enableLoginItem() {
    do { try SMAppService.mainApp.register() }
    catch { print("Failed: \(error)") }
}

// 注销
func disableLoginItem() {
    do { try SMAppService.mainApp.unregister() }
    catch { print("Failed: \(error)") }
}

// 检查状态 — 每次都必须重新读取，禁止缓存！
var isLoginItemEnabled: Bool {
    SMAppService.mainApp.status == .enabled
}
```
- 不需要任何 entitlement。
- `.requiresApproval` 时只提示状态，不反复调用 `.register()`。
- 调试时状态卡住可在终端运行 `sfltool resetbtm` 重置。
- 监听 `NSApplication.didChangeScreenParametersNotification`，屏幕变化后检查宠物窗口是否仍在任一屏幕的 `visibleFrame` 内，不在则移到主屏幕中央。
- 隐藏宠物时 `skView.isPaused = true`，显示时恢复。

验收：
- 设置重启后恢复。
- 开机启动切换后在系统设置 > 通用 > 登录项 中可见。
- 外接屏断开后宠物回可见区域。
- 隐藏后 CPU/GPU 占用明显下降。

### A9：文档、校验脚本、未签名内测包
创建：
- `README.md`
- `docs/PETPACK_SPEC.md`
- `scripts/build_beta.sh`
- `scripts/validate_petpack.py`

要求：
- 不做 Developer ID、不做 notarization。
- `build_beta.sh`：
```bash
#!/bin/bash
set -e
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet -configuration Release build
APP_PATH=$(xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet -configuration Release -showBuildSettings | grep "BUILT_PRODUCTS_DIR" | awk '{print $3}')/DesktopPet.app
ZIP_NAME="DesktopPet-beta-$(date +%Y%m%d).zip"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_NAME"
echo "Beta package created: $ZIP_NAME"
```
- README 写明：项目简介、开发环境要求（macOS 13+、Xcode 15+、XcodeGen）、构建和运行方式、如何导入 PetPack、未签名包分发限制、Gatekeeper 处理（右键打开 + `xattr -d com.apple.quarantine` 命令）。
- `PETPACK_SPEC.md` 写完整 PetPack v1 资源包规格（结构、manifest 字段、帧命名、尺寸要求、透明背景要求）。
- `validate_petpack.py` 用 Python 实现独立校验：检查 manifest 字段完整性、动作目录存在、PNG 文件存在、帧尺寸一致（用 Pillow 读取）、透明通道存在、license.txt 存在。供 Agent B 独立自检使用。

验收：
- `bash scripts/build_beta.sh` 生成 zip。
- `python3 scripts/validate_petpack.py path/to/PetName.petpack` 可独立校验资源包。
- README 和 PETPACK_SPEC 内容完整、格式正确。

## Agent B：Asset Producer 全局规则
职责：
- 只制作 `.petpack`，不写 app 代码。
- 输入为 3-5 张真实宠物照片。
- 输出不包含原始照片。
- 图片生成工具保持工具无关：Agent B 负责提示词、文件规格、后处理和校验；实际图片可由任何可用 AI 图像工具或人工流程生成。

硬要求：
- 默认风格 `soft_storybook`。
- 优先保留原宠物特征，其次可爱化。
- 最终运行资产必须是透明 PNG 序列帧，不交付视频作为 app 运行资源。
- 若生成工具无法直接透明背景，必须后处理抠图并用 PIL 规范化到 `768x768`。
- 最终必须通过 `scripts/validate_petpack.py` 或 Agent A Validator。

## Agent B 阶段
### B1：照片特征分析
输出：
- 物种、毛色、花纹、脸型、眼睛、耳朵、鼻口、体型、尾巴。
- 最重要的 3-5 个识别特征。
- 一段角色一致性描述，后续所有帧复用。
- 不确定特征明确标注。

### B2：主形象与 Preview
要求：
- 全身、透明背景、居中、软萌绘本风。
- 画布 `768x768`，主体约 `512px`。
- 不添加照片中没有的饰品。
- 输出 `preview.png`。

提示词模板：
```text
Create a cute 2D soft storybook style desktop pet based on the provided real pet references.
Preserve coat color, markings, face shape, ears, body type, and tail.
Transparent background. Full body. Centered composition.
Canvas 768x768. Pet body around 512px.
Consistent character design. No extra accessories.
```

### B3：五个动作帧
动作：
- `idle`：8 帧，呼吸/眨眼，循环。
- `walk`：8 帧，小步走，循环。
- `tap_happy`：6 帧，开心/跳跃/摇尾，非循环。
- `dragged`：4 帧，被拖拽或悬空感，循环。
- `rest`：4 帧，趴下或闭眼休息，循环。

要求：
- 每帧 `768x768` 透明 PNG。
- 命名从 `frame_000.png` 连续。
- 同角色比例、同花纹、同视觉锚点。
- 用非透明区域 bounding box 自检：同一动作中心点漂移建议不超过 ±20px。

### B4：后处理与对齐
要求：
- 清理背景残留和白边/黑边。
- 统一画布、主体位置、底部锚点。
- 检查循环动作首尾衔接。
- 若 AI 帧间变脸或花纹漂移，优先重生成该动作，不强行交付。

### B5：元数据与打包
创建：
- `manifest.json`
- `bubbles.json`
- `license.txt`

`bubbles.json` 示例：
```json
{
  "idle": ["我在这里。", "今天也陪你。"],
  "walk": ["我去转一圈。"],
  "tap_happy": ["嘿嘿。", "再摸一下。"],
  "dragged": ["要去哪里呀？"],
  "rest": ["我先趴一会儿。"]
}
```

`license.txt` 必须包含：
- 参考照片由用户提供。
- 使用的 AI/人工制作流程。
- 生成资产仅用于 beta 测试。
- 原始照片未包含在资源包中。
- 未经许可不得二次分发。

### B6：自检与交付
要求：
- 运行 `scripts/validate_petpack.py`，或请求 Agent A 运行 Validator。
- 若报错，只修资源包，不改协议。
- 交付 `.petpack` 文件夹。
- 附说明：宠物特征、动作覆盖、已知瑕疵、是否通过校验。

## Parallel Timeline
- Day 0：主控冻结 `PetPack v1`。
- Day 1：Agent A 做 A1-A2；Agent B 做 B1-B2。
- Day 2：Agent A 做 A3-A4；Agent B 做 B3。
- Day 3：Agent A 做 A5-A6；Agent B 做 B4-B5。
- Day 4：Agent A 做 A7；双方第一次集成真实 `.petpack`。
- Day 5：修 Validator 错误、动作跳位、透明边缘、导入问题。
- Day 6：Agent A 做 A8-A9，输出未签名 beta zip 和文档。
- Day 7：长时间运行、多屏、隐藏占用、最终验收。

## Failure Recovery Prompt
```text
全局约束保持不变。

上一步出现以下错误：
[粘贴完整错误输出]

请只修复这个错误，不要扩展功能，不要重构无关代码，不要修改共享 PetPack 协议。
修复后说明：
1. 修改了哪些文件
2. 错误原因
3. 如何验证
```

## Final Acceptance
- App 显示菜单栏图标和透明宠物窗口，无普通主窗口，无 Dock 图标。
- 默认包和真实 `.petpack` 都能通过 Validator。
- 可播放 `idle/tap_happy/dragged/walk/rest`，缺非核心动作时 fallback 到 `idle`。
- 支持导入、删除、切换多只宠物。
- 点击、拖拽、气泡、自动 walk、隐藏、置顶、点击穿透、重置位置可用。
- 外接屏变化后宠物不会丢到不可见区域。
- 隐藏后 CPU/GPU 占用明显下降。
- App 不联网、不采集数据、不包含原始宠物照片。
- 无 Apple Developer 账号时可生成未签名 zip。
- Developer ID 签名、公证、DMG、自动更新另开后续计划。
