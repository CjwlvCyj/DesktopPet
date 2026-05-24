import os
import sys
import json
import math
from PIL import Image

def remove_green_screen(img):
    img = img.convert("RGBA")
    data = img.getdata()
    new_data = []
    for item in data:
        # Green screen is typically high G, low R and B
        r, g, b, a = item
        # If it's very green, make it transparent
        if r < 120 and g > 180 and b < 120:
            new_data.append((255, 255, 255, 0))
        elif g > r + 45 and g > b + 45:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    return img

def apply_transform(img, scale_x=1.0, scale_y=1.0, dy=0, rotation=0):
    width, height = img.size
    
    # Apply rotation and scaling
    # First, resize
    new_width = int(width * scale_x)
    new_height = int(height * scale_y)
    resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # If rotation is required
    if rotation != 0:
        # Rotate with expand=True to not clip corners, then resize back or keep transparent
        resized = resized.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=True)
    
    # Create transparent canvas
    res = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    # Paste centered at the bottom
    x = (width - resized.width) // 2
    y = height - resized.height + dy
    res.paste(resized, (x, y), resized)
    return res

def process_pose(base_path, canvas_size=768, pet_size=512, offset_y=20):
    print(f"Processing pose: {base_path}...")
    img = Image.open(base_path)
    img = remove_green_screen(img)
    
    # Fit into canvas, bottom anchored
    img.thumbnail((pet_size, pet_size), Image.Resampling.LANCZOS)
    base_frame = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    paste_x = (canvas_size - img.width) // 2
    paste_y = canvas_size - img.height - offset_y
    base_frame.paste(img, (paste_x, paste_y), img)
    return base_frame

def main():
    artifact_dir = os.environ.get("YUANBAO_SOURCE_DIR") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not artifact_dir:
        print("Missing source directory. Pass it as the first argument or set YUANBAO_SOURCE_DIR.", file=sys.stderr)
        sys.exit(1)
    out_dir = "Yuanbao.petpack"
    
    # Base paths
    poses = {
        "idle": os.path.join(artifact_dir, "yuanbao_custom_eyes_swapped_1779523630440.png"),
        "walk": os.path.join(artifact_dir, "yuanbao_walk_pose_1779587530643.png"),
        "tap_happy": os.path.join(artifact_dir, "yuanbao_happy_pose_1779587549680.png"),
        "dragged": os.path.join(artifact_dir, "yuanbao_dragged_pose_1779587569775.png"),
        "rest": os.path.join(artifact_dir, "yuanbao_rest_pose_1779587590309.png")
    }
    
    # Load and clean all 5 poses
    base_frames = {}
    for name, path_img in poses.items():
        if not os.path.exists(path_img):
            print(f"Error: {path_img} does not exist.")
            sys.exit(1)
        base_frames[name] = process_pose(path_img)
        
    os.makedirs(out_dir, exist_ok=True)
    
    # Save preview using idle
    base_frames["idle"].save(os.path.join(out_dir, "preview.png"))
    
    # Generate action sequences
    actions = {
        "idle": 8,
        "walk": 8,
        "tap_happy": 6,
        "dragged": 4,
        "rest": 4
    }
    
    for action, frames_count in actions.items():
        action_dir = os.path.join(out_dir, "actions", action)
        os.makedirs(action_dir, exist_ok=True)
        base = base_frames[action]
        
        for i in range(frames_count):
            t = i / frames_count
            frame_img = base
            
            if action == "idle":
                # Breathing: slight vertical scale
                scale_y = 1.0 + 0.015 * math.sin(t * math.pi * 2)
                frame_img = apply_transform(base, scale_x=1.0, scale_y=scale_y, dy=0)
            elif action == "walk":
                # Bouncing up and down + slight side-to-side sway
                dy = int(-12 * abs(math.sin(t * math.pi * 2)))
                rotation = 2.0 * math.sin(t * math.pi * 2)
                frame_img = apply_transform(base, scale_x=1.0, scale_y=1.0, dy=dy, rotation=rotation)
            elif action == "tap_happy":
                # Happy jump: translation up and down + vertical squash/stretch
                dy = int(-40 * math.sin(t * math.pi))
                scale_y = 1.0 + 0.08 * math.sin(t * math.pi)
                scale_x = 1.0 - 0.04 * math.sin(t * math.pi)
                frame_img = apply_transform(base, scale_x=scale_x, scale_y=scale_y, dy=dy)
            elif action == "dragged":
                # Wobble hanging: rotation swing left and right
                rotation = 5.0 * math.sin(t * math.pi * 2)
                dy = -10
                frame_img = apply_transform(base, scale_x=1.0, scale_y=1.0, dy=dy, rotation=rotation)
            elif action == "rest":
                # Curled up breathing: slight horizontal expansion and vertical compression
                scale_y = 1.0 - 0.01 * math.sin(t * math.pi * 2)
                scale_x = 1.0 + 0.01 * math.sin(t * math.pi * 2)
                frame_img = apply_transform(base, scale_x=scale_x, scale_y=scale_y, dy=0)
                
            frame_img.save(os.path.join(action_dir, f"frame_{i:03d}.png"))
            
    # Manifest
    manifest = {
      "schemaVersion": 1,
      "id": "yuanbao-cat",
      "displayName": "Yuanbao",
      "species": "cat",
      "style": "soft_storybook",
      "version": "0.2.0",
      "canvas": { "width": 768, "height": 768, "anchorX": 0.5, "anchorY": 0.0 },
      "defaultScale": 0.67,
      "actions": {
        "idle": { "path": "actions/idle", "fps": 8, "loop": True, "required": True, "fallback": None },
        "walk": { "path": "actions/walk", "fps": 10, "loop": True, "required": False, "fallback": "idle" },
        "tap_happy": { "path": "actions/tap_happy", "fps": 12, "loop": false, "required": false, "fallback": "idle" },
        "dragged": { "path": "actions/dragged", "fps": 8, "loop": True, "required": False, "fallback": "idle" },
        "rest": { "path": "actions/rest", "fps": 4, "loop": True, "required": False, "fallback": "idle" }
      }
    }
    # Note: loop in JSON manifest should be standard boolean lowercase
    manifest["actions"]["tap_happy"]["loop"] = False # Fix the key capitalization
    
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        
    # Bubbles
    bubbles = {
      "idle": ["喵呜~", "今天元宝也在陪你哦。", "摸摸我嘛？"],
      "walk": ["去周围巡逻一下...", "喵喵，有老鼠吗？"],
      "tap_happy": ["好舒服呀喵！", "最喜欢主人了！"],
      "dragged": ["放开我！尾巴要断啦！", "喵呜！要去哪里？"],
      "rest": ["呼噜呼噜...Zzz", "元宝困了...咕噜..."]
    }
    with open(os.path.join(out_dir, "bubbles.json"), "w") as f:
        json.dump(bubbles, f, ensure_ascii=False, indent=2)
        
    # License
    license_text = """Yuanbao PetPack v0.2.0
Reference photos provided by the user.
Pose assets generated via AI image tools.
Chroma keying and frame animations compiled programmatically.
For beta testing of Desktop Pet.
All rights reserved.
"""
    with open(os.path.join(out_dir, "license.txt"), "w") as f:
        f.write(license_text)
        
    print(f"Successfully generated {out_dir}")

if __name__ == "__main__":
    main()
