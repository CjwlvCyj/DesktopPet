import os
import math
import json
import shutil
from PIL import Image, ImageDraw

CANVAS_WIDTH = 768
CANVAS_HEIGHT = 768
PET_RADIUS = 200
BOTTOM_Y = 700  # Pet rests on y=700

def create_base_image():
    # Create a transparent 768x768 image
    return Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))

def draw_face(draw, cx, cy, rx, ry, expression="normal"):
    # Draw simple facial features
    eye_offset_x = rx * 0.4
    eye_offset_y = ry * 0.1
    eye_r = 12
    
    left_eye_center = (cx - eye_offset_x, cy - eye_offset_y)
    right_eye_center = (cx + eye_offset_x, cy - eye_offset_y)
    
    if expression == "normal":
        # Black circular eyes
        draw.ellipse([left_eye_center[0] - eye_r, left_eye_center[1] - eye_r, left_eye_center[0] + eye_r, left_eye_center[1] + eye_r], fill=(40, 40, 40, 255))
        draw.ellipse([right_eye_center[0] - eye_r, right_eye_center[1] - eye_r, right_eye_center[0] + eye_r, right_eye_center[1] + eye_r], fill=(40, 40, 40, 255))
        # Happy curved mouth
        draw.arc([cx - 20, cy + 10, cx + 20, cy + 30], start=0, end=180, fill=(40, 40, 40, 255), width=6)
    elif expression == "happy":
        # Curved lines for squinting happy eyes
        draw.arc([left_eye_center[0] - 20, left_eye_center[1] - 10, left_eye_center[0] + 20, left_eye_center[1] + 10], start=180, end=360, fill=(40, 40, 40, 255), width=6)
        draw.arc([right_eye_center[0] - 20, right_eye_center[1] - 10, right_eye_center[0] + 20, right_eye_center[1] + 10], start=180, end=360, fill=(40, 40, 40, 255), width=6)
        # Open mouth (pink circle or semicircle)
        draw.ellipse([cx - 15, cy + 10, cx + 15, cy + 35], fill=(235, 100, 100, 255))
    elif expression == "dizzy":
        # X eyes
        def draw_x(ex, ey):
            size = 15
            draw.line([ex - size, ey - size, ex + size, ey + size], fill=(40, 40, 40, 255), width=6)
            draw.line([ex - size, ey + size, ex + size, ey - size], fill=(40, 40, 40, 255), width=6)
        draw_x(left_eye_center[0], left_eye_center[1])
        draw_x(right_eye_center[0], right_eye_center[1])
        # Wavy mouth
        draw.line([cx - 20, cy + 15, cx, cy + 25], fill=(40, 40, 40, 255), width=5)
        draw.line([cx, cy + 25, cx + 20, cy + 15], fill=(40, 40, 40, 255), width=5)
    elif expression == "sleepy":
        # Closed eyes (horizontal lines)
        draw.line([left_eye_center[0] - 20, left_eye_center[1], left_eye_center[0] + 20, left_eye_center[1]], fill=(40, 40, 40, 255), width=6)
        draw.line([right_eye_center[0] - 20, right_eye_center[1], right_eye_center[0] + 20, right_eye_center[1]], fill=(40, 40, 40, 255), width=6)
        # Small 'o' mouth
        draw.ellipse([cx - 8, cy + 15, cx + 8, cy + 31], fill=(40, 40, 40, 255))

def generate_idle(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    color = (135, 206, 250, 255) # Light blue
    for i in range(8):
        img = create_base_image()
        draw = ImageDraw.Draw(img)
        
        # Breathing effect: radius fluctuates
        breath = math.sin(i * math.pi / 4) * 8
        rx = PET_RADIUS + breath
        ry = PET_RADIUS - breath
        
        cx = CANVAS_WIDTH / 2
        cy = BOTTOM_Y - ry
        
        # Draw body
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color, outline=(70, 130, 180, 255), width=10)
        draw_face(draw, cx, cy, rx, ry, "normal")
        
        img.save(os.path.join(output_dir, f"frame_{i:03d}.png"))

def generate_walk(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    color = (144, 238, 144, 255) # Light green
    for i in range(8):
        img = create_base_image()
        draw = ImageDraw.Draw(img)
        
        # Walking bounce & slight tilt
        bounce = -abs(math.sin(i * math.pi / 4)) * 30
        rx = PET_RADIUS
        ry = PET_RADIUS
        
        cx = CANVAS_WIDTH / 2
        cy = BOTTOM_Y - ry + bounce
        
        # Draw body
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color, outline=(46, 139, 87, 255), width=10)
        
        # Shift eyes/mouth slightly in walking direction
        shift_x = math.sin(i * math.pi / 4) * 10
        draw_face(draw, cx + shift_x, cy, rx, ry, "normal")
        
        img.save(os.path.join(output_dir, f"frame_{i:03d}.png"))

def generate_tap_happy(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    color = (255, 182, 193, 255) # Pink
    frames_config = [
        # (width_mult, height_mult, dy, expression)
        (1.15, 0.85, 0, "happy"),    # Squish down before jump
        (0.9, 1.1, -50, "happy"),    # Going up
        (0.9, 1.1, -100, "happy"),   # Peak
        (1.0, 1.0, -80, "happy"),    # Coming down
        (1.15, 0.85, 0, "happy"),    # Land squish
        (1.0, 1.0, 0, "happy")       # Back to normal
    ]
    for i, (wm, hm, dy, expr) in enumerate(frames_config):
        img = create_base_image()
        draw = ImageDraw.Draw(img)
        
        rx = PET_RADIUS * wm
        ry = PET_RADIUS * hm
        
        cx = CANVAS_WIDTH / 2
        cy = BOTTOM_Y - ry + dy
        
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color, outline=(219, 112, 147, 255), width=10)
        draw_face(draw, cx, cy, rx, ry, expr)
        
        img.save(os.path.join(output_dir, f"frame_{i:03d}.png"))

def generate_dragged(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    color = (255, 218, 185, 255) # Peach / Orange
    for i in range(4):
        img = create_base_image()
        draw = ImageDraw.Draw(img)
        
        # Stretched vertically, shaking
        shaking = (i % 2 * 2 - 1) * 15
        rx = PET_RADIUS * 0.85
        ry = PET_RADIUS * 1.15
        
        cx = CANVAS_WIDTH / 2 + shaking
        cy = BOTTOM_Y - ry - 20 # slightly suspended
        
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color, outline=(210, 105, 30, 255), width=10)
        draw_face(draw, cx, cy, rx, ry, "dizzy")
        
        img.save(os.path.join(output_dir, f"frame_{i:03d}.png"))

def generate_rest(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    color = (230, 230, 250, 255) # Lavender
    for i in range(4):
        img = create_base_image()
        draw = ImageDraw.Draw(img)
        
        # Flattened/resting on bottom, breathing slowly
        breath = math.sin(i * math.pi / 2) * 5
        rx = PET_RADIUS * 1.2
        ry = PET_RADIUS * 0.7 - breath
        
        cx = CANVAS_WIDTH / 2
        cy = BOTTOM_Y - ry
        
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color, outline=(147, 112, 219, 255), width=10)
        draw_face(draw, cx, cy, rx, ry, "sleepy")
        
        # Floating Zzz symbol
        z_offset = i * 15
        draw.text((cx + rx * 0.6 + z_offset * 0.5, cy - ry - 20 - z_offset), "z", fill=(100, 100, 200, 255), font=None)
        
        img.save(os.path.join(output_dir, f"frame_{i:03d}.png"))

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pack_dir = os.path.join(base_dir, "Resources", "DefaultPetPack")
    
    # Clean output directory
    if os.path.exists(pack_dir):
        shutil.rmtree(pack_dir)
    os.makedirs(pack_dir, exist_ok=True)
    
    print("Generating frames...")
    generate_idle(os.path.join(pack_dir, "actions", "idle"))
    generate_walk(os.path.join(pack_dir, "actions", "walk"))
    generate_tap_happy(os.path.join(pack_dir, "actions", "tap_happy"))
    generate_dragged(os.path.join(pack_dir, "actions", "dragged"))
    generate_rest(os.path.join(pack_dir, "actions", "rest"))
    
    # Save preview image (copy frame_000 of idle)
    shutil.copy(
        os.path.join(pack_dir, "actions", "idle", "frame_000.png"),
        os.path.join(pack_dir, "preview.png")
    )
    
    # Generate manifest.json
    manifest = {
        "schemaVersion": 1,
        "id": "default-pet",
        "displayName": "小蓝",
        "species": "circle",
        "style": "soft_storybook",
        "version": "0.1.0",
        "canvas": { "width": CANVAS_WIDTH, "height": CANVAS_HEIGHT, "anchorX": 0.5, "anchorY": 0.0 },
        "defaultScale": 0.5,
        "actions": {
            "idle": { "path": "actions/idle", "fps": 8, "loop": True, "required": True, "fallback": None },
            "walk": { "path": "actions/walk", "fps": 8, "loop": True, "required": False, "fallback": "idle" },
            "tap_happy": { "path": "actions/tap_happy", "fps": 8, "loop": False, "required": False, "fallback": "idle" },
            "dragged": { "path": "actions/dragged", "fps": 8, "loop": True, "required": False, "fallback": "idle" },
            "rest": { "path": "actions/rest", "fps": 4, "loop": True, "required": False, "fallback": "idle" }
        }
    }
    
    with open(os.path.join(pack_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    # Generate bubbles.json
    bubbles = {
        "idle": ["我在这里。", "今天也陪你。", "你在写代码吗？"],
        "walk": ["我去转一圈。", "活动活动筋骨。"],
        "tap_happy": ["嘿嘿，好舒服！", "再摸一下嘛。"],
        "dragged": ["要去哪里呀？", "哎呀，悬空了！"],
        "rest": ["我先趴一会儿。", "呼呼，好困。"]
    }
    
    with open(os.path.join(pack_dir, "bubbles.json"), "w", encoding="utf-8") as f:
        json.dump(bubbles, f, indent=2, ensure_ascii=False)
        
    # Generate license.txt
    license_text = """Source: Automatically generated placeholder assets for DesktopPet.
Author: DesktopPet development tooling
Process: Generated programmatically using Python and Pillow to create smooth SVG-like circle animations.
Usage: Intended solely for local development and beta testing of the DesktopPet application.
Distribution: Restricted. Do not distribute without permission.
"""
    with open(os.path.join(pack_dir, "license.txt"), "w", encoding="utf-8") as f:
        f.write(license_text)
        
    print("Default placeholder assets generated successfully at:", pack_dir)

if __name__ == "__main__":
    main()
