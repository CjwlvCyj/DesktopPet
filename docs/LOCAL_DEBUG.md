# Local Debug Mode

This mode lets you inspect PetPack assets without starting Electron. It is for checking animation frames, transparent backgrounds, bounding boxes, bubbles, scale, and manifest data.

## Requirements

- Python 3
- Pillow

Install Pillow if needed:

```bash
python3 -m pip install Pillow
```

## Validate PetPacks

Node-only validator:

```bash
cd /Users/snowball/Documents/Pet
node scripts/validate_petpack.mjs Yuanbao.petpack
node scripts/validate_petpack.mjs Resources/DefaultPetPack
```

Python validator:

```bash
cd /Users/snowball/Documents/Pet
python3 scripts/validate_petpack.py Yuanbao.petpack
python3 scripts/validate_petpack.py Resources/DefaultPetPack
```

## Generate HTML Preview

Preview Yuanbao:

```bash
cd /Users/snowball/Documents/Pet
python3 scripts/debug_petpack_preview.py Yuanbao.petpack
```

Preview the default placeholder pet:

```bash
python3 scripts/debug_petpack_preview.py Resources/DefaultPetPack
```

The script writes HTML files to:

```text
debug_previews/
```

Open the generated HTML in your browser, for example:

```bash
open debug_previews/yuanbao-cat.html
```

If `open` launches Finder instead of a browser, drag the HTML file into Safari, Chrome, or Edge.

## What You Can Debug Here

- Play each action: `idle`, `walk`, `tap_happy`, `dragged`, `rest`.
- Pause and step frame by frame.
- Toggle checkerboard background to inspect transparency.
- Toggle bounding box overlay to inspect the clickable/visible area.
- Toggle bubble preview.
- Adjust scale.
- Inspect manifest and action metadata.

## What This Does Not Test

- Real Electron transparent desktop window.
- Menu bar behavior.
- Click-through behavior.
- Multi-monitor window recovery.
- Electron dependency install/startup.

Those require running the Electron app with `npm start`.
