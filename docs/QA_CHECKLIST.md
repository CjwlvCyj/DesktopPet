# DesktopPet Electron Beta QA Checklist

## 环境与启动

- `node -v` 输出版本号。
- `npm -v` 输出版本号。
- `npm install` 成功安装 Electron。
- `npm run check` 通过。
- `npm run validate` 通过。
- `npm start` 启动后出现桌面宠物和菜单栏图标。
- 不出现普通 Dock 主窗口。
- 菜单栏“退出”能结束 app。

## 宠物窗口

- 宠物窗口透明，无灰色背景。
- 窗口尺寸匹配当前 PetPack 的 canvas 和当前缩放。
- 拖拽后位置稳定。
- “重置位置”能回到当前屏幕可见区域。
- 向屏幕顶部拖拽后松手不会被强制弹回中间偏上区域。
- 拖到近乎全屏边界或部分遮挡后，“重置位置”仍能找回宠物。

## 交互

- 左键点击宠物播放 `tap_happy` 并显示气泡。
- 右键点击宠物触发较明显的 `walk` 位移，且不弹出系统右键菜单。
- 向左 walk 播放 `walk_left`；向右 walk 播放 `walk_right`，两者不应是同一套镜像帧。
- 拖拽时播放 `dragged`，松手回到 `idle`。
- 左键拖拽到顶部菜单栏附近时，可见宠物轮廓能继续贴近顶部，不应被透明 canvas 上边距提前卡住。
- 自动 walk 不跑出当前屏幕。
- 气泡跟随宠物实际可见 bbox 顶部，不悬在画布顶部。

## 大小设置

- 菜单栏“大小...”能打开托盘附近的小型滑块面板。
- 滑块范围为 35% 到 110%，拖动时宠物实时缩放。
- 调整大小时宠物底部中心基本保持稳定，不明显跳位。
- 元宝和默认宠物的缩放互不影响。
- 重启后恢复每个宠物各自的缩放。

## 点击穿透

- 鼠标移动到透明空白区域时，下方 app 可正常接收点击。
- 鼠标回到宠物可见区域时，宠物恢复点击和拖拽。
- 开启菜单栏“鼠标穿透”后，鼠标事件整体落到下面的 app。
- 菜单栏仍可关闭“鼠标穿透”。

## 宠物包

- 可切换到 `Yuanbao.petpack`。
- 可切换到 `Resources/DefaultPetPack`。
- “导入 PetPack...” 会把有效包复制到 Electron `userData/PetPacks/`。
- 导入无效包时显示错误详情。
- 重启后恢复上次选择的宠物。
- “显示当前资源包”能打开当前包所在位置。

## 资源包质量

- `node scripts/validate_petpack.mjs Yuanbao.petpack` 通过。
- `node scripts/analyze_petpack_assets.mjs Yuanbao.petpack` 显示 `walk_left` 和 `walk_right` 都为 12 帧，`tap_happy` 为 8 帧、`dragged` 为 6 帧、`rest` 为 8 帧。
- `node scripts/validate_petpack.mjs Resources/DefaultPetPack` 通过。
- `python3 scripts/validate_petpack.py Yuanbao.petpack` 通过且无高优先级 warning。
- 资源包内不包含原始照片或 `.DS_Store`。
- `license.txt` 说明来源、流程、用途和分发限制。

## 多屏与系统状态

- 外接屏连接/断开后，宠物仍在任一可见屏幕区域内。
- 睡眠唤醒后，菜单栏和宠物窗口仍可用。
- 隐藏宠物后动画暂停。
- 隐藏宠物后 walk timer 暂停。

## 稳定性

- Activity Monitor 中隐藏状态 CPU/GPU 占用明显下降。
- 连续运行 4 小时不崩溃。
- 多次切换宠物包后没有窗口错位、气泡错位或透明区域大面积拦截点击。
