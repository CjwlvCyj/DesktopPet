# PetPack v1 规范

PetPack 是 DesktopPet 的本地宠物资源包。它必须是一个文件夹，可以使用 `.petpack` 后缀。app 不读取原始宠物照片，只读取生成后的透明 PNG 动画帧和元数据。

## 目录结构

```text
PetName.petpack/
  manifest.json
  preview.png
  license.txt
  bubbles.json
  actions/
    idle/
      frame_000.png
      frame_001.png
    walk/
    walk_left/
    walk_right/
    tap_happy/
    dragged/
    rest/
```

必需文件：

- `manifest.json`
- `preview.png`
- `license.txt`
- `bubbles.json`
- `actions/idle/frame_000.png`

`walk`、`tap_happy`、`dragged`、`rest` 推荐提供；如果缺少，app 会尝试 fallback 到 `idle`。需要方向化行走时可额外提供 `walk_left` 和 `walk_right`，app 会按移动方向优先播放它们。

## manifest.json

```json
{
  "schemaVersion": 1,
  "id": "mimi-cat",
  "displayName": "咪咪",
  "species": "cat",
  "style": "soft_storybook",
  "version": "0.1.0",
  "canvas": {
    "width": 768,
    "height": 768,
    "anchorX": 0.5,
    "anchorY": 0.0
  },
  "defaultScale": 0.67,
  "actions": {
    "idle": {
      "path": "actions/idle",
      "fps": 8,
      "loop": true,
      "required": true,
      "fallback": null
    },
    "walk": {
      "path": "actions/walk",
      "fps": 10,
      "loop": true,
      "required": false,
      "fallback": "idle"
    },
    "walk_left": {
      "path": "actions/walk_left",
      "fps": 10,
      "loop": true,
      "required": false,
      "fallback": "walk"
    },
    "walk_right": {
      "path": "actions/walk_right",
      "fps": 10,
      "loop": true,
      "required": false,
      "fallback": "walk"
    },
    "tap_happy": {
      "path": "actions/tap_happy",
      "fps": 12,
      "loop": false,
      "required": false,
      "fallback": "idle"
    },
    "dragged": {
      "path": "actions/dragged",
      "fps": 8,
      "loop": true,
      "required": false,
      "fallback": "idle"
    },
    "rest": {
      "path": "actions/rest",
      "fps": 4,
      "loop": true,
      "required": false,
      "fallback": "idle"
    }
  }
}
```

字段要求：

- `schemaVersion` 固定为 `1`。
- `id` 必须唯一；`default-pet` 是内置包保留 ID，自定义包不能使用。
- `canvas.width` 和 `canvas.height` 目前固定推荐 `768`。
- `canvas.anchorX = 0.5`、`canvas.anchorY = 0.0`，表示以底部中心对齐。
- `defaultScale` 推荐 `0.5` 到 `0.75`。
- `actions` 是字典，动作名来自 key；action value 里不重复写 `name`。
- `walk_left`、`walk_right` 是可选方向动作；缺失时 app fallback 到 `walk`。
- `fps` 必须为 `1...60`。
- `fallback` 若不为 `null`，必须指向 manifest 中存在的动作。
- `idle` 必须存在且 `required` 必须为 `true`。

## PNG 帧要求

- 所有帧必须是带 alpha 通道的透明 PNG。
- `preview.png` 和所有动作帧尺寸必须与 canvas 完全一致。
- 帧命名必须连续，从 `frame_000.png` 开始。
- 同一动作内建议保持视觉锚点稳定；`idle`、`rest`、`dragged` 的非透明区域中心漂移建议不超过 20px。
- 不要把原始照片、参考图或生成中间图放入包内。

## bubbles.json

```json
{
  "idle": ["我在这里。", "今天也陪你。"],
  "walk": ["我去转一圈。"],
  "tap_happy": ["嘿嘿。", "再摸一下。"],
  "dragged": ["要去哪里呀？"],
  "rest": ["我先趴一会儿。"]
}
```

要求：

- 必须包含 `idle`。
- 每个 key 的值必须是字符串数组。
- 没有对应动作文案时，app 会 fallback 到 `idle` 文案。

## license.txt

必须说明：

- 参考照片来源。
- 使用的 AI 或人工制作流程。
- 原始照片是否包含在包内；beta 要求不包含。
- 使用范围，例如“仅用于 DesktopPet beta 测试”。
- 是否允许二次分发。

## 校验

```bash
node scripts/validate_petpack.mjs path/to/PetName.petpack
```

Electron app 内部 validator 与 Node 脚本保持一致。Python 脚本仍可用于更细的资源制作检查，它会输出 warning，例如 `.DS_Store`、疑似原始照片文件名、动作锚点漂移等。
