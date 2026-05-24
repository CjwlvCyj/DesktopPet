#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image


FRAME_RE = re.compile(r"^frame_(\d{3,})\.png$")
RAW_PHOTO_HINTS = ("source", "reference", "photo", "photos", "img_", "dsc_", "original")


def error_exit(message):
    print(f"❌ Error: {message}")
    sys.exit(1)


def warn(warnings, message):
    warnings.append(message)
    print(f"⚠️ Warning: {message}")


def read_json(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        error_exit(f"Failed to decode {path.name}: {exc}")


def ensure_alpha(image, file_path):
    if image.mode in ("RGBA", "LA"):
        return
    if image.mode == "P" and "transparency" in image.info:
        return
    error_exit(f"PNG file does not contain an alpha channel: {file_path}")


def alpha_bbox(image):
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    return alpha.getbbox()


def validate_image(file_path, expected_w, expected_h):
    try:
        with Image.open(file_path) as image:
            width, height = image.size
            if width != expected_w or height != expected_h:
                error_exit(
                    f"Frame size mismatch for {file_path}. "
                    f"Got {width}x{height}, expected {expected_w}x{expected_h}."
                )
            ensure_alpha(image, file_path)
            return alpha_bbox(image)
    except SystemExit:
        raise
    except Exception as exc:
        error_exit(f"Failed to read PNG file {file_path}: {exc}")


def validate_frame_sequence(files, action_name):
    indexed = []
    for file_path in files:
        match = FRAME_RE.match(file_path.name)
        if not match:
            error_exit(
                f"Invalid frame name in action '{action_name}': {file_path.name}. "
                "Expected frame_000.png style names."
            )
        indexed.append((int(match.group(1)), file_path))

    indexed.sort(key=lambda item: item[0])
    for expected, (actual, file_path) in enumerate(indexed):
        if actual != expected:
            error_exit(
                f"Frame sequence gap in action '{action_name}'. "
                f"Expected frame_{expected:03d}.png, got {file_path.name}."
            )
    return [item[1] for item in indexed]


def warn_about_root_files(pack_path, warnings):
    for child in pack_path.iterdir():
        name = child.name.lower()
        if child.name == ".DS_Store":
            warn(warnings, "Root contains .DS_Store; remove it before distributing the pack.")
        if child.is_file() and any(hint in name for hint in RAW_PHOTO_HINTS):
            warn(warnings, f"Possible raw reference photo in pack root: {child.name}")


def warn_about_motion_drift(action_name, boxes, action_config, warnings):
    if not boxes:
        return

    centers = [((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) for box in boxes]
    drift_x = max(center[0] for center in centers) - min(center[0] for center in centers)
    drift_y = max(center[1] for center in centers) - min(center[1] for center in centers)

    # Walk and tap_happy naturally move. For looping idle/rest/dragged, larger drift is usually accidental.
    if action_config.get("loop") and action_name in {"idle", "rest", "dragged"} and (drift_x > 20 or drift_y > 20):
        warn(
            warnings,
            f"Action '{action_name}' bbox center drifts by {drift_x:.1f}px x {drift_y:.1f}px; "
            "check visual anchor alignment."
        )
    elif drift_x > 80 or drift_y > 80:
        warn(
            warnings,
            f"Action '{action_name}' has large intentional-looking motion drift "
            f"({drift_x:.1f}px x {drift_y:.1f}px). Verify transitions back to idle."
        )


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_petpack.py <path/to/PetName.petpack>")
        sys.exit(1)

    pack_path = Path(sys.argv[1])
    if not pack_path.is_dir():
        error_exit(f"Specified path is not a directory: {pack_path}")

    warnings = []
    print(f"🔍 Validating PetPack at: {pack_path}...")
    warn_about_root_files(pack_path, warnings)

    manifest_path = pack_path / "manifest.json"
    if not manifest_path.is_file():
        error_exit("manifest.json file is missing.")
    manifest = read_json(manifest_path)

    if manifest.get("schemaVersion") != 1:
        error_exit(f"Unsupported schemaVersion: {manifest.get('schemaVersion')}. Expected 1.")

    pack_id = manifest.get("id")
    if not pack_id:
        error_exit("manifest.json: 'id' is missing.")
    if pack_id == "default-pet":
        warn(warnings, "'default-pet' is the built-in system ID. Custom packs must use a different ID.")

    canvas = manifest.get("canvas")
    if not isinstance(canvas, dict):
        error_exit("manifest.json: 'canvas' section is missing or invalid.")
    expected_w = int(canvas.get("width", 0))
    expected_h = int(canvas.get("height", 0))
    if expected_w <= 0 or expected_h <= 0:
        error_exit("manifest.json: canvas width/height must be positive.")

    actions = manifest.get("actions")
    if not isinstance(actions, dict) or not actions:
        error_exit("manifest.json: 'actions' dictionary is missing or invalid.")

    idle_action = actions.get("idle")
    if not idle_action or not idle_action.get("required"):
        error_exit("manifest.json: Required 'idle' action is missing or not marked as required.")

    for required_file in ("preview.png", "license.txt", "bubbles.json"):
        if not (pack_path / required_file).is_file():
            error_exit(f"{required_file} is missing.")

    validate_image(pack_path / "preview.png", expected_w, expected_h)

    bubbles = read_json(pack_path / "bubbles.json")
    if "idle" not in bubbles or not isinstance(bubbles.get("idle"), list):
        error_exit("bubbles.json: 'idle' key must exist and contain an array.")

    for action_name, config in actions.items():
        fps = config.get("fps")
        if not isinstance(fps, int) or fps < 1 or fps > 60:
            error_exit(f"manifest.json: action '{action_name}' has invalid fps {fps}. Expected 1-60.")

        fallback = config.get("fallback")
        if fallback is not None and fallback not in actions:
            error_exit(f"manifest.json: action '{action_name}' references missing fallback '{fallback}'.")

    action_summaries = []
    for action_name, config in actions.items():
        rel_path = config.get("path")
        if not rel_path:
            error_exit(f"manifest.json: Path for action '{action_name}' is missing.")

        action_dir = pack_path / rel_path
        if not action_dir.is_dir():
            error_exit(f"Directory for action '{action_name}' is missing at: {rel_path}")

        png_files = sorted([path for path in action_dir.iterdir() if path.suffix.lower() == ".png"])
        if not png_files:
            error_exit(f"No png frames found for action '{action_name}' in: {rel_path}")

        png_files = validate_frame_sequence(png_files, action_name)
        boxes = [validate_image(path, expected_w, expected_h) for path in png_files]
        boxes = [box for box in boxes if box is not None]
        warn_about_motion_drift(action_name, boxes, config, warnings)
        action_summaries.append(f"{action_name}: {len(png_files)} frames @ {config.get('fps')}fps")

    print("✅ Success! PetPack is valid and conforms to v1 specification.")
    print("📦 Actions: " + "; ".join(action_summaries))
    if warnings:
        print(f"⚠️ Completed with {len(warnings)} warning(s).")
    else:
        print("✨ No warnings.")


if __name__ == "__main__":
    main()
