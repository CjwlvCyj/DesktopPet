import os
import sys
import math
import json
import shutil
from PIL import Image, ImageDraw

CANVAS_WIDTH = 768
CANVAS_HEIGHT = 768
BOTTOM_Y = 700  # Bottom baseline for cat feet

def chroma_key_and_crop(img_path):
    print("  - Running chroma keying and despill on green background...")
    img = Image.open(img_path).convert("RGBA")
    width, height = img.size
    pix = img.load()
    
    # 1. Key out green pixels
    for y in range(height):
        for x in range(width):
            r, g, b, a = pix[x, y]
            # If green is high and dominant
            if g > 150 and g > r * 1.35 and g > b * 1.35:
                pix[x, y] = (0, 0, 0, 0)
                
    # 2. Despill green fringe around edges
    for y in range(height):
        for x in range(width):
            r, g, b, a = pix[x, y]
            if a > 0:
                if g > r and g > b:
                    # Cap green at the average of red and blue to remove tint
                    avg_rb = (r + b) // 2
                    pix[x, y] = (r, avg_rb, b, a)
                    
    # 3. Tight crop
    bbox = img.getbbox()
    if not bbox:
        raise ValueError("Error: Image is completely transparent after chroma keying.")
    
    cropped = img.crop(bbox)
    print(f"  - Tight crop size: {cropped.size}")
    return cropped

def generate_pack(source_img_path, output_dir):
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    
    # Extract tight cat sprite
    cat_sprite = chroma_key_and_crop(source_img_path)
    
    # Scale cat sprite so its height is 480px (fitting beautifully inside 768x768)
    target_height = 480
    aspect_ratio = cat_sprite.width / cat_sprite.height
    target_width = int(target_height * aspect_ratio)
    cat_base = cat_sprite.resize((target_width, target_height), Image.Resampling.LANCZOS)
    
    # Helper to paste cat onto 768x768 transparent canvas centered on bottom
    def make_frame(scale_x=1.0, scale_y=1.0, offset_x=0.0, offset_y=0.0, rotate_angle=0.0):
        # 1. Scale
        w = int(cat_base.width * scale_x)
        h = int(cat_base.height * scale_y)
        scaled = cat_base.resize((w, h), Image.Resampling.LANCZOS)
        
        # 2. Rotate if needed
        if rotate_angle != 0:
            rotated = scaled.rotate(rotate_angle, resample=Image.Resampling.BICUBIC, expand=True)
        else:
            rotated = scaled
            
        # 3. Create transparent canvas
        canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
        
        # Position bottom center at (384, BOTTOM_Y)
        # Bounding box of rotated shape center is rotated.width/2, rotated.height/2
        # Center of paste location
        cx = CANVAS_WIDTH / 2 + offset_x
        cy = BOTTOM_Y - rotated.height / 2 + offset_y
        
        # Convert center to top-left coordinate
        tx = int(cx - rotated.width / 2)
        ty = int(cy - rotated.height / 2)
        
        canvas.paste(rotated, (tx, ty), rotated)
        return canvas

    # --- ACTION 1: IDLE (8 frames, gentle breathing) ---
    print("  - Generating IDLE frames...")
    idle_dir = os.path.join(output_dir, "actions", "idle")
    os.makedirs(idle_dir, exist_ok=True)
    for i in range(8):
        breath = math.sin(i * math.pi / 4)
        sy = 1.0 + breath * 0.015
        sx = 1.0 - breath * 0.01  # preserve volume slightly
        # Keep bottom steady on line
        offset_y = (target_height - target_height * sy) / 2
        frame = make_frame(scale_x=sx, scale_y=sy, offset_y=offset_y)
        frame.save(os.path.join(idle_dir, f"frame_{i:03d}.png"))
        
    # --- ACTION 2: WALK (8 frames, side-to-side rotation and vertical bounce) ---
    print("  - Generating WALK frames...")
    walk_dir = os.path.join(output_dir, "actions", "walk")
    os.makedirs(walk_dir, exist_ok=True)
    for i in range(8):
        bounce = -abs(math.sin(i * math.pi / 4)) * 20
        angle = math.sin(i * math.pi / 4) * 4.0
        frame = make_frame(offset_y=bounce, rotate_angle=angle)
        frame.save(os.path.join(walk_dir, f"frame_{i:03d}.png"))
        
    # --- ACTION 3: TAP HAPPY (6 frames, jump and squish animation) ---
    print("  - Generating TAP_HAPPY frames...")
    tap_happy_dir = os.path.join(output_dir, "actions", "tap_happy")
    os.makedirs(tap_happy_dir, exist_ok=True)
    frames_config = [
        # (sx, sy, dy)
        (1.15, 0.85, 0.0),    # Squish down (prep)
        (0.9, 1.15, -40.0),   # Jump up
        (0.95, 1.05, -75.0),  # Peak
        (1.0, 1.0, -40.0),    # Fall down
        (1.15, 0.85, 0.0),    # Land squish
        (1.0, 1.0, 0.0)       # Return to normal
    ]
    for i, (sx, sy, dy) in enumerate(frames_config):
        offset_y = dy + (target_height - target_height * sy) / 2
        frame = make_frame(scale_x=sx, scale_y=sy, offset_y=offset_y)
        frame.save(os.path.join(tap_happy_dir, f"frame_{i:03d}.png"))
        
    # --- ACTION 4: DRAGGED (4 frames, vertical stretch, high frequency shake) ---
    print("  - Generating DRAGGED frames...")
    dragged_dir = os.path.join(output_dir, "actions", "dragged")
    os.makedirs(dragged_dir, exist_ok=True)
    for i in range(4):
        # Stretch and jitter
        jitter_x = (i % 2 * 2 - 1) * 10
        sy = 1.12
        sx = 0.88
        offset_y = -20 + (target_height - target_height * sy) / 2
        frame = make_frame(scale_x=sx, scale_y=sy, offset_x=jitter_x, offset_y=offset_y)
        frame.save(os.path.join(dragged_dir, f"frame_{i:03d}.png"))
        
    # --- ACTION 5: REST (4 frames, flattened squish and slow breathing) ---
    print("  - Generating REST frames...")
    rest_dir = os.path.join(output_dir, "actions", "rest")
    os.makedirs(rest_dir, exist_ok=True)
    for i in range(4):
        breath = math.sin(i * math.pi / 2)
        sy = 0.75 + breath * 0.015
        sx = 1.2
        offset_y = (target_height - target_height * sy) / 2
        frame = make_frame(scale_x=sx, scale_y=sy, offset_y=offset_y)
        frame.save(os.path.join(rest_dir, f"frame_{i:03d}.png"))

    # Copy preview image (copy frame_000 of idle)
    shutil.copy(
        os.path.join(idle_dir, "frame_000.png"),
        os.path.join(output_dir, "preview.png")
    )
    
    # Save manifest.json
    manifest = {
        "schemaVersion": 1,
        "id": "yuanbao-cat",
        "displayName": "元宝",
        "species": "cat",
        "style": "soft_storybook",
        "version": "0.1.0",
        "canvas": { "width": CANVAS_WIDTH, "height": CANVAS_HEIGHT, "anchorX": 0.5, "anchorY": 0.0 },
        "defaultScale": 0.55,
        "actions": {
            "idle": { "path": "actions/idle", "fps": 8, "loop": True, "required": True, "fallback": None },
            "walk": { "path": "actions/walk", "fps": 8, "loop": True, "required": False, "fallback": "idle" },
            "tap_happy": { "path": "actions/tap_happy", "fps": 8, "loop": False, "required": False, "fallback": "idle" },
            "dragged": { "path": "actions/dragged", "fps": 8, "loop": True, "required": False, "fallback": "idle" },
            "rest": { "path": "actions/rest", "fps": 4, "loop": True, "required": False, "fallback": "idle" }
        }
    }
    
    with open(os.path.join(output_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    # Save bubbles.json
    bubbles = {
        "idle": ["我是元宝，喵～", "今天也要乖乖写代码哦！", "伸个懒腰～"],
        "walk": ["我去巡视一下我的领地。", "猫步走起～"],
        "tap_happy": ["呼噜呼噜...好舒服～", "再摸摸元宝嘛！"],
        "dragged": ["哎呀！元宝要飞起来了！", "快放我下来喵～"],
        "rest": ["元宝困了，先眯一会儿...", "呼...噜..."]
    }
    
    with open(os.path.join(output_dir, "bubbles.json"), "w", encoding="utf-8") as f:
        json.dump(bubbles, f, indent=2, ensure_ascii=False)
        
    # Save license.txt
    license_text = """Source: Custom desktop pet pack for Yuanbao.
Reference images provided by the USER.
Generated with AI-assisted character creation and local Python/Pillow frame processing.
Original photos are not included in this generated PetPack.
Usage: Intended only for local DesktopPet beta application testing.
Redistribution: Do not redistribute without the user's permission.
"""
    with open(os.path.join(output_dir, "license.txt"), "w", encoding="utf-8") as f:
        f.write(license_text)
        
    print(f"✅ Pack generated successfully at: {output_dir}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 generate_yuanbao_pack.py <path/to/source_image.png> <path/to/output_dir>")
        sys.exit(1)
        
    generate_pack(sys.argv[1], sys.argv[2])

if __name__ == "__main__":
    main()
