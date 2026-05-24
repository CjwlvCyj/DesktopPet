#!/usr/bin/env python3
import argparse
import base64
import html
import json
import os
import subprocess
from pathlib import Path

from PIL import Image


def read_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def image_data_uri(path):
    data = path.read_bytes()
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def alpha_bbox(path):
    with Image.open(path).convert("RGBA") as image:
        alpha = image.getchannel("A")
        box = alpha.getbbox()
        if not box:
            return None
        left, top, right, bottom = box
        return {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
            "centerX": (left + right) / 2,
            "centerY": (top + bottom) / 2,
        }


def action_summary(frames):
    boxes = [frame["bbox"] for frame in frames if frame["bbox"]]
    if not boxes:
        return {"driftX": 0, "driftY": 0}
    xs = [box["centerX"] for box in boxes]
    ys = [box["centerY"] for box in boxes]
    return {
        "driftX": round(max(xs) - min(xs), 2),
        "driftY": round(max(ys) - min(ys), 2),
    }


def load_petpack(pack_path):
    manifest = read_json(pack_path / "manifest.json")
    bubbles_path = pack_path / "bubbles.json"
    bubbles = read_json(bubbles_path) if bubbles_path.exists() else {}

    actions = {}
    for action_name, config in manifest["actions"].items():
        action_dir = pack_path / config["path"]
        files = sorted(action_dir.glob("*.png"))
        frames = []
        for file_path in files:
            frames.append({
                "name": file_path.name,
                "uri": image_data_uri(file_path),
                "bbox": alpha_bbox(file_path),
            })
        actions[action_name] = {
            "config": config,
            "frames": frames,
            "summary": action_summary(frames),
        }

    return {
        "packPath": str(pack_path),
        "manifest": manifest,
        "bubbles": bubbles,
        "actions": actions,
    }


def render_html(payload):
    title = f"DesktopPet Preview - {payload['manifest'].get('displayName', payload['manifest'].get('id', 'PetPack'))}"
    payload_json = json.dumps(payload, ensure_ascii=False)
    escaped_payload = payload_json.replace("</", "<\\/")
    action_buttons = "\n".join(
        f'<button class="action-button" data-action="{html.escape(name)}">{html.escape(name)}</button>'
        for name in payload["actions"].keys()
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111;
      color: #f5f5f5;
    }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      grid-template-columns: 320px 1fr;
      background: #171717;
    }}
    aside {{
      padding: 18px;
      border-right: 1px solid rgba(255,255,255,.12);
      background: #202020;
      overflow: auto;
    }}
    main {{
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-width: 0;
    }}
    h1 {{
      font-size: 18px;
      margin: 0 0 4px;
    }}
    .meta {{
      font-size: 12px;
      color: #aaa;
      line-height: 1.5;
      word-break: break-all;
    }}
    .section {{
      margin-top: 18px;
    }}
    .section-title {{
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #888;
      margin-bottom: 8px;
    }}
    button, input[type="range"], label {{
      cursor: pointer;
    }}
    .action-button {{
      width: 100%;
      display: block;
      margin: 6px 0;
      padding: 9px 10px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,.14);
      background: #2c2c2c;
      color: #f5f5f5;
      text-align: left;
    }}
    .action-button.active {{
      border-color: #6ea8ff;
      background: #17365f;
    }}
    .toolbar {{
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(255,255,255,.12);
      background: #1d1d1d;
      flex-wrap: wrap;
    }}
    .toolbar button {{
      padding: 7px 12px;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,.16);
      background: #2a2a2a;
      color: #f5f5f5;
    }}
    .stage-wrap {{
      display: grid;
      place-items: center;
      min-height: 0;
      overflow: auto;
      padding: 20px;
    }}
    .stage {{
      position: relative;
      width: 768px;
      height: 768px;
      transform-origin: center;
      border: 1px solid rgba(255,255,255,.16);
      background-color: #2b2b2b;
    }}
    .stage.checker {{
      background-image:
        linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,.15) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,.15) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.15) 75%);
      background-size: 32px 32px;
      background-position: 0 0, 0 16px, 16px -16px, -16px 0px;
    }}
    #petFrame {{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: auto;
    }}
    #bbox {{
      position: absolute;
      border: 2px solid #ff4d6d;
      box-sizing: border-box;
      pointer-events: none;
      display: none;
    }}
    #bubble {{
      position: absolute;
      max-width: 260px;
      transform: translate(-50%, -100%);
      padding: 9px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,.96);
      color: #111;
      box-shadow: 0 8px 24px rgba(0,0,0,.22);
      display: none;
      font-size: 14px;
      text-align: center;
    }}
    .footer {{
      padding: 12px 18px;
      border-top: 1px solid rgba(255,255,255,.12);
      color: #aaa;
      font-size: 12px;
      background: #1d1d1d;
    }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      background: #171717;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 7px;
      padding: 10px;
      font-size: 12px;
      max-height: 280px;
      overflow: auto;
    }}
  </style>
</head>
<body>
  <aside>
    <h1>{html.escape(title)}</h1>
    <div class="meta" id="packMeta"></div>
    <div class="section">
      <div class="section-title">Actions</div>
      {action_buttons}
    </div>
    <div class="section">
      <div class="section-title">Action Info</div>
      <pre id="actionInfo"></pre>
    </div>
    <div class="section">
      <div class="section-title">Manifest</div>
      <pre id="manifestText"></pre>
    </div>
  </aside>
  <main>
    <div class="toolbar">
      <button id="playPause">Pause</button>
      <button id="prevFrame">Prev</button>
      <button id="nextFrame">Next</button>
      <label><input type="checkbox" id="checker" checked> Checker</label>
      <label><input type="checkbox" id="showBBox" checked> BBox</label>
      <label><input type="checkbox" id="showBubble"> Bubble</label>
      <label>Scale <input type="range" id="scale" min="25" max="120" value="67"></label>
      <span id="frameLabel"></span>
    </div>
    <div class="stage-wrap">
      <div id="stage" class="stage checker">
        <img id="petFrame" alt="Pet animation frame">
        <div id="bbox"></div>
        <div id="bubble"></div>
      </div>
    </div>
    <div class="footer">
      This is a local PetPack preview. It does not run the Electron desktop window, tray menu, click-through, or multi-display behavior.
    </div>
  </main>
  <script>
    const payload = {escaped_payload};
    let currentAction = Object.keys(payload.actions)[0] || "idle";
    let frameIndex = 0;
    let playing = true;
    let timer = null;

    const stage = document.getElementById("stage");
    const img = document.getElementById("petFrame");
    const bbox = document.getElementById("bbox");
    const bubble = document.getElementById("bubble");
    const frameLabel = document.getElementById("frameLabel");
    const actionInfo = document.getElementById("actionInfo");

    function action() {{
      return payload.actions[currentAction];
    }}

    function frames() {{
      return action().frames;
    }}

    function draw() {{
      const actionData = action();
      const frame = frames()[frameIndex];
      if (!frame) return;
      img.src = frame.uri;
      frameLabel.textContent = `${{currentAction}} / ${{frame.name}}`;

      const box = frame.bbox;
      if (box && document.getElementById("showBBox").checked) {{
        bbox.style.display = "block";
        bbox.style.left = `${{box.x}}px`;
        bbox.style.top = `${{box.y}}px`;
        bbox.style.width = `${{box.width}}px`;
        bbox.style.height = `${{box.height}}px`;
        bubble.style.left = `${{box.x + box.width / 2}}px`;
        bubble.style.top = `${{Math.max(0, box.y - 8)}}px`;
      }} else {{
        bbox.style.display = "none";
      }}

      const bubbles = payload.bubbles[currentAction] || payload.bubbles.idle || [];
      if (document.getElementById("showBubble").checked && bubbles.length) {{
        bubble.style.display = "block";
        bubble.textContent = bubbles[frameIndex % bubbles.length];
      }} else {{
        bubble.style.display = "none";
      }}

      actionInfo.textContent = JSON.stringify({{
        config: actionData.config,
        frameCount: frames().length,
        bboxDrift: actionData.summary
      }}, null, 2);
    }}

    function schedule() {{
      clearTimeout(timer);
      if (!playing) return;
      const fps = action().config.fps || 8;
      timer = setTimeout(() => {{
        const next = frameIndex + 1;
        if (next >= frames().length) {{
          frameIndex = action().config.loop ? 0 : frames().length - 1;
        }} else {{
          frameIndex = next;
        }}
        draw();
        schedule();
      }}, 1000 / fps);
    }}

    function setAction(name) {{
      currentAction = name;
      frameIndex = 0;
      document.querySelectorAll(".action-button").forEach(button => {{
        button.classList.toggle("active", button.dataset.action === name);
      }});
      draw();
      schedule();
    }}

    document.querySelectorAll(".action-button").forEach(button => {{
      button.addEventListener("click", () => setAction(button.dataset.action));
    }});

    document.getElementById("playPause").addEventListener("click", event => {{
      playing = !playing;
      event.target.textContent = playing ? "Pause" : "Play";
      schedule();
    }});
    document.getElementById("prevFrame").addEventListener("click", () => {{
      playing = false;
      document.getElementById("playPause").textContent = "Play";
      frameIndex = (frameIndex - 1 + frames().length) % frames().length;
      draw();
      schedule();
    }});
    document.getElementById("nextFrame").addEventListener("click", () => {{
      playing = false;
      document.getElementById("playPause").textContent = "Play";
      frameIndex = (frameIndex + 1) % frames().length;
      draw();
      schedule();
    }});
    document.getElementById("checker").addEventListener("change", event => {{
      stage.classList.toggle("checker", event.target.checked);
    }});
    document.getElementById("showBBox").addEventListener("change", draw);
    document.getElementById("showBubble").addEventListener("change", draw);
    document.getElementById("scale").addEventListener("input", event => {{
      stage.style.transform = `scale(${{Number(event.target.value) / 100}})`;
    }});

    document.getElementById("packMeta").textContent =
      `${{payload.manifest.id}} · ${{payload.manifest.species}} · ${{payload.manifest.style}} · ${{payload.packPath}}`;
    document.getElementById("manifestText").textContent = JSON.stringify(payload.manifest, null, 2);
    stage.style.transform = `scale(${{payload.manifest.defaultScale || 0.67}})`;
    document.getElementById("scale").value = Math.round((payload.manifest.defaultScale || 0.67) * 100);
    setAction(currentAction);
  </script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Generate a local HTML preview for a DesktopPet PetPack.")
    parser.add_argument("petpack", help="Path to a .petpack folder")
    parser.add_argument("--output", "-o", help="Output HTML path")
    parser.add_argument("--open", action="store_true", help="Open the generated HTML with the default browser")
    args = parser.parse_args()

    pack_path = Path(args.petpack).expanduser().resolve()
    if not pack_path.is_dir():
        raise SystemExit(f"PetPack path is not a directory: {pack_path}")

    payload = load_petpack(pack_path)
    pack_id = payload["manifest"].get("id", pack_path.stem)
    output = Path(args.output).expanduser().resolve() if args.output else Path("debug_previews") / f"{pack_id}.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_html(payload), encoding="utf-8")

    print(f"Preview generated: {output}")
    if args.open:
        subprocess.run(["open", str(output)], check=False)


if __name__ == "__main__":
    main()
