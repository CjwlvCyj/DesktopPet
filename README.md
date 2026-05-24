# Desktop Pet Electron Beta

这是一个 macOS 桌面电子宠物 beta 项目。当前主技术栈已经切换为 Electron：不依赖 Xcode、不依赖 Apple 账号，也不需要 Apple Developer Program。

## 当前状态

- Beta 阶段，只面向本地调试。
- 不联网，不做遥测，不在 app 内生成 AI 图片。
- 支持透明悬浮窗口、菜单栏控制、左键跳跃、右键 walk、拖拽互动、气泡、自动 walk、点击穿透、置顶、隐藏、大小滑块、PetPack 导入与切换。
- 暂不处理 DMG、签名、公证、自动更新和上架。

## 环境要求

- macOS 13.0+
- Node.js + npm
- Python 3，可选，用于资源包 HTML 预览和旧版 Python 校验脚本
- Pillow，可选，仅在运行 `scripts/debug_petpack_preview.py` 或图片生成脚本时需要

你现在这台机器的 Codex 内置 Node 可以运行校验脚本，但没有 `npm`，所以还不能直接安装并启动 Electron。最简单的本地方案是安装 Node.js 官方包，它会一起带上 `npm`，不需要 Apple 登录。

## 启动 Electron App

```bash
cd /Users/snowball/Documents/Pet
npm install
npm start
```

启动后会出现一个透明桌面宠物窗口和菜单栏图标。右键或点击菜单栏图标可以隐藏宠物、开启点击穿透、调出“大小...”滑块、重置位置、切换默认宠物/元宝示例、导入 PetPack、显示当前资源包位置或退出。

## 本地校验

只用当前已有的 Node 就可以校验资源包：

```bash
cd /Users/snowball/Documents/Pet
node scripts/validate_petpack.mjs Yuanbao.petpack
node scripts/validate_petpack.mjs Resources/DefaultPetPack
```

安装 npm 依赖后，也可以运行：

```bash
npm run check
npm run validate
```

## PetPack 预览

不启动 Electron 时，可以用 HTML 预览器检查动作帧、透明背景、bbox、气泡和缩放：

```bash
cd /Users/snowball/Documents/Pet
python3 scripts/debug_petpack_preview.py Yuanbao.petpack
```

生成文件在 `debug_previews/`。如果 `open debug_previews/yuanbao-cat.html` 打开的是 Finder，就把 HTML 文件拖进 Safari、Chrome 或 Edge。

## 资源包

- `Yuanbao.petpack` 是当前元宝示例包。
- `asset_sources/yuanbao_pose_sources/` 保存元宝 idle、tap、dragged、rest、idle_yawn、idle_spin 和 walk base 的照片花色版生成 sheet 与源图；其中 `generated_idle_spin_sheet_v4.png` 提供 10 张原地转圈关键姿态，`generated_dragged_rest_sheet_v1.png` 继续提供完整睡姿源图。
- `asset_sources/yuanbao_walk_keyposes/` 保存元宝左向 walk 的照片花色版生成 sheet 和 4 张 key pose 源图；左向可见侧保留元宝左眼黑灰斑，它们不进入 `.petpack` 运行包。
- `asset_sources/yuanbao_walk_right_keyposes/` 保存元宝右向 walk 的生成 sheet 和 4 张 key pose 源图；右向可见侧保持眼周干净。
- `legacy/backup/` 会保留被生成器覆盖前的旧元宝包备份。
- `Resources/DefaultPetPack` 是内置默认包。
- 原始宠物照片不应放入 `.petpack`。app 运行时只需要透明 PNG 动画帧、`manifest.json`、`bubbles.json`、`preview.png` 和 `license.txt`。
- 资源包规范见 [docs/PETPACK_SPEC.md](docs/PETPACK_SPEC.md)。

## Electron 架构

- 主进程：`electron/main.js`
  - 创建透明桌宠窗口和菜单栏图标。
  - 控制置顶、点击穿透、隐藏/显示、拖拽移动、大小设置、自动 walk。
  - 负责导入 PetPack，并把导入包复制到 Electron `userData/PetPacks/`。
- 预加载层：`electron/preload.js`
  - 暴露最小 IPC API，避免 renderer 直接访问 Node。
- 渲染层：`electron/renderer/renderer.js`
  - 播放 PNG 序列帧。
  - 根据当前帧 alpha 计算可见 bbox，用于气泡锚点和透明区域鼠标穿透。
- 资源校验：`electron/petpack.js` 与 `scripts/validate_petpack.mjs`
  - 校验 manifest、preview、license、bubbles、fps、fallback、帧命名、PNG 尺寸和 alpha。

## 已退役的 Swift/Xcode 路径

旧 Swift/AppKit/SpriteKit/XcodeGen 工程不再是官方路径。为了避免误用，旧代码会放在 `legacy/swift-xcode/`，后续实现和调试都以 Electron 为准。
