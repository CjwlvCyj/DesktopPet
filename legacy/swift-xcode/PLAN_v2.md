# Gemini 实施 Prompt Pack：macOS 桌面宠物 Beta (V2 优化版)

## 使用方式
- 不要一次性让 Gemini 做完整 app；每次只发“全局约束 + 当前阶段 Prompt”。
- 每个阶段都要求它：先检查现有文件，再修改；完成后必须说明改了什么、如何运行、哪些没做。
- 每阶段通过后再进入下一阶段；如果编译失败，下一轮只让它修复编译和最小相关问题。
- 编译失败时使用故障恢复 Prompt（见附录 A）。

## 全局约束
- 项目：原生 macOS app，SwiftUI app lifecycle + AppKit 窗口 + SpriteKit 渲染。
- 支持：macOS 13+，Universal 目标；无 Apple Developer 账号时只做本机运行和未签名内测包。
- 禁止：App 内 AI 生成、联网、遥测、Live2D、自动更新、完整养成系统、云同步。
- 素材：运行时只加载离线生成好的 `PetPack`；原始宠物照片不进入 app。
- 渲染：Beta 使用透明 PNG 序列帧；SpriteKit 负责播放、循环、缓存和动作切换。
- 每次实现后运行 build；scheme 固定为 `DesktopPet`。

### 项目构建方式（必须遵守）
- 使用 **XcodeGen** 管理项目。AI 编写源码 + `project.yml`，然后运行 `xcodegen generate` 生成 `.xcodeproj`。
- **禁止**手写 `.xcodeproj` / `.pbxproj` 文件。
- **禁止**使用已废弃的 `swift package generate-xcodeproj`。
- 构建命令：`xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build`
- 测试命令：`xcodebuild test -project DesktopPet.xcodeproj -scheme DesktopPet -destination 'platform=macOS'`

### 初始 project.yml 模板（Prompt 1 必须使用）
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

### 源码目录结构（必须遵守）
```
DesktopPet/
├── project.yml                         # XcodeGen 配置
├── Sources/
│   ├── App/
│   │   └── DesktopPetApp.swift         # @main SwiftUI App 入口
│   ├── Window/
│   │   ├── PetPanel.swift              # NSPanel 子类
│   │   └── PetWindowManager.swift      # 窗口创建、显示、隐藏管理
│   ├── Rendering/
│   │   ├── PetRendererAdapter.swift     # 协议定义
│   │   └── SpriteKitRenderer.swift     # SpriteKit 实现
│   ├── Model/
│   │   ├── PetPack.swift               # PetPack / PetAction / PetCanvas 数据模型
│   │   └── PetPackValidator.swift      # 校验逻辑
│   ├── Behavior/
│   │   └── PetBehaviorEngine.swift     # 纯状态机
│   ├── Assets/
│   │   ├── PetAssetLibrary.swift       # 资产库管理
│   │   └── PetPackImporter.swift       # 导入逻辑
│   ├── UI/
│   │   ├── BubbleView.swift            # 气泡 UI
│   │   ├── MenuBarManager.swift        # 菜单栏 / 系统托盘
│   │   └── SettingsWindow.swift        # 设置窗口
│   └── Preferences/
│       └── PetPreferencesStore.swift   # 偏好持久化
├── Resources/
│   └── DefaultPetPack/                 # 占位宠物包
│       ├── manifest.json
│       ├── preview.png
│       ├── license.txt
│       ├── bubbles.json
│       └── actions/
│           ├── idle/
│           ├── walk/
│           ├── tap_happy/
│           ├── dragged/
│           └── rest/
└── Tests/
    ├── PetPackValidatorTests.swift
    └── PetBehaviorEngineTests.swift
```

## 核心接口合同
- `PetPack`：Codable 数据模型，包含 `id/displayName/species/style/version/canvas/defaultScale/actions`。
- `PetAction`：包含 `name/path/fps/loop/required/fallback`。
- `PetRendererAdapter`：协议，方法 `load(pack:)`、`play(action:)`、`stop()`、`setScale(_:)`、`onActionComplete` 回调。
- `PetAssetLibrary`：扫描、导入、删除、切换宠物包；导入后复制到 Application Support。
- `PetPackValidator`：校验 manifest、必需动作、PNG 帧、尺寸一致性、license。
- `PetBehaviorEngine`：纯状态机；输入事件，输出命令，不直接读文件或操作窗口。
- 状态固定：`idle / walking / tapped / dragging / resting / hidden / error`。
- 事件固定：`appStarted / petClicked / dragStarted / dragEnded / idleTimerFired / restRequested / hideRequested / showRequested / actionCompleted / packChanged / errorOccurred`
- 命令固定：`playAction / showBubble / moveWindow / savePosition / showWindow / hideWindow / setError`。

## PetPack 规格
- 文件结构固定：`manifest.json`、`preview.png`、`license.txt`、`bubbles.json`、`actions/<action>/frame_000.png`。
- 必需动作：`idle`；Beta 推荐动作：`idle/walk/tap_happy/dragged/rest`。
- 所有帧必须透明 PNG、同画布尺寸、同视觉锚点；主体默认约 512px。
- `manifest.json` 完整示例：
```json
{
  "schemaVersion": 1,
  "id": "default-cat",
  "displayName": "Default Cat",
  "species": "cat",
  "style": "placeholder",
  "version": "1.0.0",
  "canvas": { "width": 512, "height": 512, "anchorX": 0.5, "anchorY": 0.0 },
  "defaultScale": 0.25,
  "actions": {
    "idle":      { "path": "actions/idle",      "fps": 8,  "loop": true,  "required": true,  "fallback": null },
    "walk":      { "path": "actions/walk",      "fps": 10, "loop": true,  "required": false, "fallback": "idle" },
    "tap_happy": { "path": "actions/tap_happy", "fps": 12, "loop": false, "required": false, "fallback": "idle" },
    "dragged":   { "path": "actions/dragged",   "fps": 8,  "loop": true,  "required": false, "fallback": "idle" },
    "rest":      { "path": "actions/rest",      "fps": 4,  "loop": true,  "required": false, "fallback": "idle" }
  }
}
```
- 缺少 `idle` 拒绝导入；缺少其他动作允许导入，但运行时 fallback 到 `idle`。
- `bubbles.json` 按动作分类，每类是短句数组；没有文案时不显示气泡，不报错。

---

## Prompt 1：项目骨架与窗口

**本阶段创建/修改的文件：**
- [NEW] `project.yml` — 复制上方"初始 project.yml 模板"
- [NEW] `Sources/App/DesktopPetApp.swift`
- [NEW] `Sources/Window/PetPanel.swift`
- [NEW] `Sources/Window/PetWindowManager.swift`
- [NEW] `Sources/UI/MenuBarManager.swift`

**指令：**

创建 `DesktopPet` macOS app。首先创建 `project.yml`（使用全局约束中的模板），然后运行 `xcodegen generate` 生成项目。

实现以下组件：

1. **DesktopPetApp.swift**：`@main` SwiftUI App 入口。使用空的 `WindowGroup` 加 `.defaultSize(width: 0, height: 0)` 避免显示主窗口（或使用 `Settings` scene），在 `.onAppear` 或 `init` 中启动 `PetWindowManager`。

2. **PetPanel.swift**：`NSPanel` 子类，必须包含以下所有属性：
```swift
styleMask: [.borderless, .nonactivatingPanel]
isOpaque = false
backgroundColor = .clear
hasShadow = false
level = .floating
collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
isMovableByWindowBackground = true
```
使用 `setFrameAutosaveName("PetWindowPosition")` 实现位置自动持久化（调用时机必须在 `orderFront` 之前）。

3. **PetWindowManager.swift**：管理 PetPanel 的生命周期，提供 `showPet()`、`hidePet()`、`resetPosition()`（重置到当前主屏幕 `visibleFrame` 的底部中央）、`toggleClickThrough()`。

4. **MenuBarManager.swift**：使用 `NSStatusBar` 在菜单栏创建图标（使用 SF Symbol `"pawprint.fill"`），菜单项包含：显示/隐藏宠物、重置位置、退出。

5. **占位视图**：在 PetPanel 的 contentView 中放一个 128x128 的彩色 NSView 作为占位符（如半透明蓝色圆形），用于验证透明和拖拽。不要做 SpriteKit 渲染。

**验收：**
```bash
xcodegen generate  # 无报错
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build  # 编译通过
# 手动验证：启动后无 Dock 图标，菜单栏有 pawprint 图标，蓝色圆形可拖拽，重启后位置恢复
```

---

## Prompt 2：PetPack 数据模型与校验

**本阶段创建/修改的文件：**
- [NEW] `Sources/Model/PetPack.swift`
- [NEW] `Sources/Model/PetPackValidator.swift`
- [NEW] `Tests/PetPackValidatorTests.swift`

**指令：**

实现 `PetPack`、`PetAction`、`PetCanvas` 数据模型（均为 Codable struct）。实现 `PetPackValidator`，输入一个文件夹路径，校验：
1. `manifest.json` 存在且能正确解码为 `PetPack`
2. `schemaVersion` 为 1
3. `actions` 中包含 `idle` 且 `idle.required == true`
4. 每个 action 的 `path` 目录存在，且目录下包含至少 1 个 `frame_XXX.png` 文件
5. 每个 action 的所有 PNG 帧像素尺寸一致（使用 `NSImage(contentsOfFile:)` 读取尺寸）
6. `license.txt` 文件存在

校验结果用 `Result<PetPack, PetPackValidationError>`，`PetPackValidationError` 是一个 enum，包含 `.manifestNotFound`、`.manifestDecodingFailed(Error)`、`.missingRequiredAction(String)`、`.actionDirectoryNotFound(String)`、`.noFramesFound(String)`、`.inconsistentFrameSize(action: String, expected: CGSize, got: CGSize)`、`.licenseMissing` 等 case。

加入 XCTest 覆盖：有效包、缺 manifest、缺 idle、尺寸不一致。测试使用临时目录创建测试用的 PetPack 文件结构。

不要做 UI 导入。

**验收：**
```bash
xcodegen generate
xcodebuild test -project DesktopPet.xcodeproj -scheme DesktopPetTests -destination 'platform=macOS'
# 所有测试通过，错误信息可读
```

---

## Prompt 3：默认占位资产包

**本阶段创建/修改的文件：**
- [NEW] `scripts/generate_placeholder_assets.py` — Python 脚本生成占位帧
- [NEW] `Resources/DefaultPetPack/manifest.json`
- [NEW] `Resources/DefaultPetPack/preview.png`
- [NEW] `Resources/DefaultPetPack/license.txt`
- [NEW] `Resources/DefaultPetPack/bubbles.json`
- [NEW] `Resources/DefaultPetPack/actions/idle/frame_000.png` ... `frame_007.png`
- [NEW] `Resources/DefaultPetPack/actions/walk/frame_000.png` ... `frame_007.png`
- [NEW] `Resources/DefaultPetPack/actions/tap_happy/frame_000.png` ... `frame_005.png`
- [NEW] `Resources/DefaultPetPack/actions/dragged/frame_000.png` ... `frame_003.png`
- [NEW] `Resources/DefaultPetPack/actions/rest/frame_000.png` ... `frame_003.png`

**指令：**

编写一个 Python 脚本 `scripts/generate_placeholder_assets.py`，使用 Pillow (PIL) 库生成占位宠物帧。要求：
- 每帧为 512x512 透明 PNG
- 画一个简单的圆形"宠物"（直径约 200px，居中偏下），不同动作用不同颜色区分：
  - `idle`：蓝色圆 + 轻微大小脉动（帧间缩放 ±5%），8 帧
  - `walk`：绿色圆 + 水平位移动画，8 帧
  - `tap_happy`：黄色圆 + 跳跃动画（Y 方向偏移），6 帧
  - `dragged`：红色圆 + 拉伸变形，4 帧
  - `rest`：灰色圆 + 半透明 + "Zzz" 文字，4 帧
- 每帧左上角标注帧编号（如 "idle/0"）
- 脚本运行后自动输出到 `Resources/DefaultPetPack/actions/` 目录

同时创建对应的 `manifest.json`（使用 PetPack 规格中的完整示例）、`bubbles.json`、空的 `license.txt`、`preview.png`（复用 idle/frame_000.png）。

运行脚本前先 `pip install Pillow`（如果未安装）。

**验收：**
```bash
python3 scripts/generate_placeholder_assets.py  # 生成所有帧文件
# 验证文件存在：
ls Resources/DefaultPetPack/actions/idle/  # 应有 frame_000.png 到 frame_007.png
# 用 Prompt 2 的 Validator 验证：
xcodebuild test -project DesktopPet.xcodeproj -scheme DesktopPetTests -destination 'platform=macOS'
```

---

## Prompt 4：SpriteKit 渲染适配器

**本阶段创建/修改的文件：**
- [NEW] `Sources/Rendering/PetRendererAdapter.swift` — 协议定义
- [NEW] `Sources/Rendering/SpriteKitRenderer.swift` — SpriteKit 实现
- [MODIFY] `Sources/Window/PetPanel.swift` — 替换占位视图为 SKView
- [MODIFY] `Sources/Window/PetWindowManager.swift` — 接入渲染器

**指令：**

实现 `PetRendererAdapter` 协议和 `SpriteKitRenderer` 实现类。

⚠️ **关键：SpriteKit 透明渲染必须同时配置以下四项，缺任何一项都会导致灰色/烟雾色背景：**

```swift
// 1. NSPanel（已在 Prompt 1 配置）
panel.isOpaque = false
panel.backgroundColor = .clear

// 2. SKView — 这是最容易遗漏的！
let skView = SKView(frame: bounds)
skView.allowsTransparency = true  // ← 没有这一行就会有灰色背景

// 3. SKScene
let scene = SKScene(size: skView.bounds.size)
scene.backgroundColor = .clear
scene.scaleMode = .resizeFill
```

`SpriteKitRenderer` 功能：
- `load(pack: PetPack, baseURL: URL)` — 预加载所有动作 of PNG 帧为 `[SKTexture]`，每个动作缓存为 `SKAction.animate(with:timePerFrame:)` 
- `play(action: String)` — 播放指定动作；如果动作是 `loop`，用 `SKAction.repeatForever`；如果非 loop，播放完成后调用 `onActionComplete` 回调
- `stop()` — 停止当前动作
- `setScale(_ scale: CGFloat)` — 调整 sprite 缩放
- 如果请求播放的 action 在 PetPack 中不存在，自动 fallback 到该 action 定义的 `fallback`（通常是 `idle`）
- 隐藏时调用 `skView.isPaused = true` 停止渲染循环以节省 CPU/GPU

修改 PetPanel，将占位的蓝色 NSView 替换为 SKView。修改 PetWindowManager，在启动时加载 DefaultPetPack 并播放 idle。

**验收：**
```bash
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
# 手动验证：启动后显示占位宠物动画（蓝色圆形脉动），背景完全透明，可拖拽
```

---

## Prompt 5：行为状态机与交互

**本阶段创建/修改的文件：**
- [NEW] `Sources/Behavior/PetBehaviorEngine.swift`
- [NEW] `Tests/PetBehaviorEngineTests.swift`
- [MODIFY] `Sources/Window/PetWindowManager.swift` — 接入状态机，处理鼠标事件
- [MODIFY] `Sources/Window/PetPanel.swift` — 转发鼠标事件

**指令：**

实现 `PetBehaviorEngine`，这是一个纯逻辑状态机，**不得 import AppKit/SpriteKit/SwiftUI**。

输入：`func handle(event: PetEvent) -> [PetCommand]`
- 接收事件，返回零或多个命令
- 调用者（PetWindowManager）负责执行命令

状态转换规则：
- `idle` + `petClicked` → `tapped`，发出 `[playAction("tap_happy"), showBubble]`
- `idle` + `dragStarted` → `dragging`，发出 `[playAction("dragged")]`
- `dragging` + `dragEnded` → `idle`，发出 `[savePosition, playAction("idle")]`
- `idle` + `idleTimerFired` → `walking`，发出 `[playAction("walk"), moveWindow(dx, dy)]`（dx/dy 在 80-220px 随机，方向随机）
- `walking` + `actionCompleted` → `idle`，发出 `[playAction("idle")]`
- `tapped` + `actionCompleted` → `idle`，发出 `[playAction("idle")]`
- 任意状态 + `hideRequested` → `hidden`，发出 `[hideWindow]`
- `hidden` + `showRequested` → `idle`，发出 `[showWindow, playAction("idle")]`
- 任意状态 + `errorOccurred` → `error`，发出 `[setError]`

在 PetWindowManager 中：
- 设置一个 Timer，每 20-45 秒（随机）触发 `idleTimerFired`
- 重写 PetPanel 的 `mouseDown` / `mouseUp` / `mouseDragged` 方法，转发为 `petClicked` / `dragStarted` / `dragEnded` 事件
- 执行 `moveWindow` 命令时，使用 `NSAnimationContext` 平滑移动窗口，并确保目标位置在当前屏幕的 `visibleFrame` 内

XCTest 验证状态转换：测试所有上述状态转换规则，验证输出的命令是否正确。

**验收：**
```bash
xcodegen generate
xcodebuild test -project DesktopPet.xcodeproj -scheme DesktopPetTests -destination 'platform=macOS'
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
# 手动验证：点击宠物有反应，拖拽时播放 dragged，松手回 idle，宠物会自动散步
```

---

## Prompt 6：气泡与基础菜单

**本阶段创建/修改的文件：**
- [NEW] `Sources/UI/BubbleView.swift`
- [MODIFY] `Sources/UI/MenuBarManager.swift` — 补齐菜单项
- [MODIFY] `Sources/Window/PetWindowManager.swift` — 接入气泡显示、菜单操作
- [MODIFY] `Sources/Window/PetPanel.swift` — 气泡跟随

**指令：**

1. **BubbleView**：SwiftUI 视图，显示为宠物头顶的圆角气泡，带尾巴箭头。从 `bubbles.json` 按当前动作随机选一条。2-4 秒后自动消失（用 `withAnimation` 淡出）。同时最多显示一个气泡。气泡用一个独立的小 `NSPanel`（同样透明无边框，`level` 比宠物窗口高 1），跟随宠物窗口位置（偏移到宠物上方）。

2. **菜单栏补齐**：
- 显示/隐藏宠物（标题根据当前状态切换："隐藏宠物" / "显示宠物"）
- 分隔线
- 点击穿透开关（勾选项）— 开启时 `PetPanel.ignoresMouseEvents = true`，必须能通过菜单栏关闭穿透以恢复交互
- 置顶开关（勾选项）— 切换 `level` 为 `.floating` / `.normal`
- 重置位置
- 分隔线
- 休息 — 触发 `restRequested` 事件
- 宠物管理...（暂时禁用，Prompt 7 实现）
- 分隔线
- 开机启动（暂时禁用，Prompt 8 实现）
- 退出

**验收：**
```bash
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
# 手动验证：点击宠物弹出气泡后自动消失；穿透模式下鼠标事件穿透到下面的窗口；通过菜单可恢复交互
```

---

## Prompt 7：宠物资产库与导入 UI

**本阶段创建/修改的文件：**
- [NEW] `Sources/Assets/PetAssetLibrary.swift`
- [NEW] `Sources/Assets/PetPackImporter.swift`
- [NEW] `Sources/UI/SettingsWindow.swift`
- [MODIFY] `Sources/UI/MenuBarManager.swift` — 启用"宠物管理"菜单项
- [MODIFY] `Sources/Window/PetWindowManager.swift` — 接入宠物切换

**指令：**

1. **PetAssetLibrary**：
- 管理 `~/Library/Application Support/DesktopPet/PetPacks/` 目录
- `scan() -> [PetPack]` — 扫描所有子目录，对每个运行 Validator，返回有效的 PetPack 列表
- `currentPetId` — 当前选中的宠物 ID，存储在 UserDefaults
- `switchTo(petId:)` — 切换当前宠物
- `delete(petId:)` — 删除宠物包；如果删除的是当前宠物，自动切换到默认宠物
- 默认宠物（DefaultPetPack）从 app bundle 的 Resources 读取，不可删除

2. **PetPackImporter**：
- `import(from sourceURL: URL) -> Result<PetPack, ImportError>`
- 流程：复制到临时 staging 目录 → 运行 Validator → 校验通过后移动到 PetPacks 目录 → 校验失败则删除 staging 并返回错误

3. **SettingsWindow**：SwiftUI 窗口，显示：
- 宠物列表（每行显示 preview 图标 + 名称 + 当前标记）
- "导入宠物包"按钮 — 打开 `NSOpenPanel` 选择文件夹
- "删除"按钮（默认宠物不可删除）
- 导入错误提示

⚠️ **关键：因为 LSUIElement = true，显示设置窗口时必须临时切换 activationPolicy：**
```swift
func showSettings() {
    NSApp.setActivationPolicy(.regular)
    settingsWindow.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
}
// 关闭设置窗口的回调中：
func settingsDidClose() {
    NSApp.setActivationPolicy(.accessory)
}
```

**验收：**
```bash
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
# 手动验证：能打开设置窗口，导入一个宠物包，在两只宠物间切换；重启后恢复上次选择；删除当前宠物后回默认
```

---

## Prompt 8：偏好、开机启动与稳定性

**本阶段创建/修改的文件：**
- [NEW] `Sources/Preferences/PetPreferencesStore.swift`
- [MODIFY] `Sources/UI/MenuBarManager.swift` — 启用"开机启动"菜单项
- [MODIFY] `Sources/Window/PetWindowManager.swift` — 接入偏好存储、屏幕变化检测

**指令：**

1. **PetPreferencesStore**：使用 `UserDefaults` 存储偏好（宠物 id、缩放、置顶、点击穿透、开机启动）。注意：窗口位置已由 `setFrameAutosaveName` 自动处理，不需要手动存储。

2. **开机启动**：使用 `SMAppService.mainApp`。
⚠️ **关键注意事项：**
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

// 检查状态 — 每次都必须重新读取，禁止缓存！用户可能随时在系统设置中修改
var isLoginItemEnabled: Bool {
    SMAppService.mainApp.status == .enabled
}
```
- **不需要** 任何 entitlement（仅 mainApp 不需要）
- 状态为 `.requiresApproval` 时**不要**反复调用 `.register()`，只显示状态提示
- 调试时如果状态卡住，在终端运行 `sfltool resetbtm` 重置
- 可通过 `SMAppService.openSystemSettingsLoginItems()` 引导用户到系统设置

3. **屏幕变化检测**：监听 `NSApplication.didChangeScreenParametersNotification`，在回调中检查宠物窗口是否仍在任意屏幕的 `visibleFrame` 内，如果不在则移到主屏幕中央。

4. **隐藏时暂停渲染**：隐藏宠物时调用 `skView.isPaused = true`，显示时恢复。

**验收：**
```bash
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet build
# 手动验证：
# - 重启后所有设置恢复
# - 开机启动切换后在系统设置 > 通用 > 登录项 中可见
# - 隐藏宠物后通过 Activity Monitor 确认 CPU 占用明显下降
# - （如有外接屏）拔掉外接屏后宠物自动回到主屏幕
```

---

## Prompt 9：无 Apple 账号内测包与文档

**本阶段创建/修改的文件：**
- [NEW] `README.md`
- [NEW] `scripts/build_beta.sh` — 构建脚本
- [NEW] `docs/PETPACK_SPEC.md` — PetPack 制作说明

**指令：**

不要做 Developer ID 签名、公证（Notarization）或自动更新。

1. **`scripts/build_beta.sh`**：
```bash
#!/bin/bash
set -e
xcodegen generate
xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet -configuration Release build
# 找到 .app 并创建 zip
APP_PATH=$(xcodebuild -project DesktopPet.xcodeproj -scheme DesktopPet -configuration Release -showBuildSettings | grep "BUILT_PRODUCTS_DIR" | awk '{print $3}')/DesktopPet.app
ZIP_NAME="DesktopPet-beta-$(date +%Y%m%d).zip"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_NAME"
echo "Beta package created: $ZIP_NAME"
```

2. **README.md** 包含：
- 项目简介
- 开发环境要求（macOS 13+、Xcode 15+、XcodeGen）
- 如何构建和运行（`xcodegen generate` → Xcode 打开 → Run）
- 如何导入 PetPack
- 如何制作 PetPack（指向 `docs/PETPACK_SPEC.md`）
- 如何分发未签名内测包
- 测试者遇到 Gatekeeper 拦截时的解决方法（右键打开 + `xattr -d com.apple.quarantine` 命令）

3. **docs/PETPACK_SPEC.md**：详细的 PetPack 制作说明，包含 manifest.json 完整字段说明、帧命名规则、尺寸要求。

**验收：**
```bash
bash scripts/build_beta.sh  # 成功生成 zip
# README 和文档内容完整、格式正确
```

---

## 最终验收清单
- [ ] App 启动后显示菜单栏图标和透明桌面宠物窗口，无 Dock 图标
- [ ] 默认占位宠物能播放 idle、点击播放 tap_happy、拖拽播放 dragged
- [ ] 宠物会自动散步（walk）并在屏幕范围内移动
- [ ] 用户能导入、删除、切换多个 PetPack
- [ ] 点击穿透开启后鼠标事件穿透到下面的窗口，菜单栏可恢复交互
- [ ] 置顶、隐藏、重置位置、拖拽保存位置都可用
- [ ] 开机启动可正确注册和注销
- [ ] 气泡显示正常，2-4 秒自动消失
- [ ] 原始宠物照片不进入 app；app 不联网、不采集数据
- [ ] 隐藏宠物后 CPU/GPU 占用明显下降
- [ ] 外接屏断开后宠物不会丢到不可见区域
- [ ] 连续运行 4 小时不崩溃
- [ ] 无 Apple Developer 账号时可交付未签名 zip 内测包
- [ ] XCTest 全部通过（Validator + BehaviorEngine）

---

## 附录 A：故障恢复 Prompt 模板

当编译或运行出现错误时，使用以下模板：

```
全局约束保持不变。

上一次的代码编译/运行出现了以下错误：

[粘贴完整的错误输出]

请只修复这个错误，不要改动其他功能。修复后说明：
1. 改了哪些文件的哪些代码
2. 为什么会出这个错误
3. 如何验证修复成功
```

## 附录 B：阶段间的依赖关系

```
Prompt 1 (骨架) ──→ Prompt 2 (数据模型) ──→ Prompt 3 (占位素材)
                                                     │
                                                     ↓
                    Prompt 4 (SpriteKit 渲染) ←──────┘
                         │
                         ↓
                    Prompt 5 (状态机) ──→ Prompt 6 (气泡+菜单)
                                              │
                                              ↓
                                         Prompt 7 (资产库)
                                              │
                                              ↓
                                         Prompt 8 (偏好+稳定性)
                                              │
                                              ↓
                                         Prompt 9 (文档+打包)
```
