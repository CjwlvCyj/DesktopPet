#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import childProcess from 'node:child_process';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const CANVAS = 768;
const DEFAULT_SOURCE_DIR = process.env.YUANBAO_SOURCE_DIR || '';
const WALK_KEYPOSE_PHASES = [0, 0.25, 0.5, 0.75];
const IDLE_SPIN_KEY_COUNT = 10;
const POSE_SOURCE = poseSourceConfig();
const POSE_OVERRIDE_SOURCE = poseOverrideSourceConfig();
const IDLE_VARIANT_SOURCE = idleVariantSourceConfig();
const IDLE_SPIN_SOURCE = idleSpinSourceConfig();
const WALK_LEFT_SOURCE = walkSourceConfig({
  dirName: 'yuanbao_walk_keyposes',
  sheetName: 'generated_walk_sheet_v5.png',
  keyPrefix: 'walk_key',
  direction: 'left'
});
const WALK_RIGHT_SOURCE = walkSourceConfig({
  dirName: 'yuanbao_walk_right_keyposes',
  sheetName: 'generated_walk_right_sheet_v2.png',
  keyPrefix: 'walk_right_key',
  direction: 'right'
});

function walkSourceConfig({ dirName, sheetName, keyPrefix, direction }) {
  const dir = path.resolve('asset_sources', dirName);
  return {
    dir,
    sheetPath: path.join(dir, sheetName),
    sheetName,
    keyPrefix,
    direction,
    files: WALK_KEYPOSE_PHASES.map((_, index) => path.join(dir, `${keyPrefix}_${String(index).padStart(2, '0')}.png`))
  };
}

function poseSourceConfig() {
  const dir = path.resolve('asset_sources', 'yuanbao_pose_sources');
  const entries = [
    ['idle', 'yuanbao_idle_source.png'],
    ['tap_happy', 'yuanbao_tap_happy_source.png'],
    ['dragged', 'yuanbao_dragged_source.png'],
    ['rest', 'yuanbao_rest_source.png'],
    ['walk', 'yuanbao_walk_base_source.png']
  ];
  return {
    dir,
    sheetPath: path.join(dir, 'generated_pose_sheet_v2.png'),
    sheetName: 'generated_pose_sheet_v2.png',
    entries,
    files: Object.fromEntries(entries.map(([name, file]) => [name, path.join(dir, file)]))
  };
}

function poseOverrideSourceConfig() {
  const dir = path.resolve('asset_sources', 'yuanbao_pose_sources');
  const entries = [
    ['dragged', 'yuanbao_dragged_source.png'],
    ['rest', 'yuanbao_rest_source.png']
  ];
  return {
    dir,
    sheetPath: path.join(dir, 'generated_dragged_rest_sheet_v1.png'),
    sheetName: 'generated_dragged_rest_sheet_v1.png',
    entries,
    files: Object.fromEntries(entries.map(([name, file]) => [name, path.join(dir, file)]))
  };
}

function idleVariantSourceConfig() {
  const dir = path.resolve('asset_sources', 'yuanbao_pose_sources');
  const entries = [
    ['idle_yawn', 'yuanbao_idle_yawn_source.png', 'idle_yawn']
  ];
  return {
    dir,
    sheetPath: path.join(dir, 'generated_idle_variants_rest_sheet_v1.png'),
    sheetName: 'generated_idle_variants_rest_sheet_v1.png',
    sheetCellCount: 6,
    entries,
    files: Object.fromEntries(entries.map((entry) => {
      const { name, file } = normalizePoseEntry(entry);
      return [name, path.join(dir, file)];
    }))
  };
}

function idleSpinSourceConfig() {
  const dir = path.resolve('asset_sources', 'yuanbao_pose_sources');
  const entries = Array.from({ length: IDLE_SPIN_KEY_COUNT }, (_, index) => [
    `idle_spin_${String(index).padStart(2, '0')}`,
    `yuanbao_idle_spin_key_${String(index).padStart(2, '0')}.png`,
    'idle_spin'
  ]);
  return {
    dir,
    sheetPath: path.join(dir, 'generated_idle_spin_sheet_v4.png'),
    sheetName: 'generated_idle_spin_sheet_v4.png',
    entries,
    files: Object.fromEntries(entries.map((entry) => {
      const { name, file } = normalizePoseEntry(entry);
      return [name, path.join(dir, file)];
    }))
  };
}

function normalizePoseEntry(entry) {
  const [name, file, poseKey = name] = entry;
  return { name, file, poseKey };
}

const POSES = {
  idle: {
    file: 'yuanbao_custom_eyes_swapped_1779523630440.png',
    maxWidth: 360,
    maxHeight: 405,
    bottomY: 696
  },
  idle_yawn: {
    maxWidth: 360,
    maxHeight: 405,
    bottomY: 696
  },
  idle_spin: {
    maxWidth: 430,
    maxHeight: 415,
    bottomY: 700
  },
  walk: {
    file: 'yuanbao_walk_pose_1779587530643.png',
    maxWidth: 505,
    maxHeight: 365,
    bottomY: 696
  },
  tap_happy: {
    file: 'yuanbao_happy_pose_1779587549680.png',
    maxWidth: 440,
    maxHeight: 430,
    bottomY: 660
  },
  dragged: {
    file: 'yuanbao_dragged_pose_1779587569775.png',
    maxWidth: 335,
    maxHeight: 430,
    bottomY: 682
  },
  rest: {
    file: 'yuanbao_rest_pose_1779587590309.png',
    maxWidth: 500,
    maxHeight: 300,
    bottomY: 724
  }
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parsePNG(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) fail(`Not a PNG: ${filePath}`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) fail(`Unsupported bit depth ${bitDepth}: ${filePath}`);
  const channels = channelsForColorType(colorType);
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const scanlineLength = width * channels;
  const pixels = Buffer.alloc(width * height * channels);

  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input];
    input += 1;
    const rowStart = y * scanlineLength;
    const prevRowStart = (y - 1) * scanlineLength;

    for (let x = 0; x < scanlineLength; x += 1) {
      const raw = inflated[input + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prevRowStart + x - channels] : 0;
      pixels[rowStart + x] = unfilterByte(filter, raw, left, up, upLeft);
    }

    input += scanlineLength;
  }

  return { width, height, rgba: toRGBA(pixels, width, height, colorType) };
}

function loadSourceImage(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 8).toString('hex');
  if (header === PNG_SIGNATURE) return parsePNG(filePath);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yuanbao-pose-'));
  const convertedPath = path.join(tempDir, `${path.basename(filePath)}.png`);
  try {
    childProcess.execFileSync('sips', ['-s', 'format', 'png', filePath, '--out', convertedPath], { stdio: 'ignore' });
    return parsePNG(convertedPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function channelsForColorType(colorType) {
  switch (colorType) {
    case 0: return 1;
    case 2: return 3;
    case 4: return 2;
    case 6: return 4;
    default:
      fail(`Unsupported PNG color type ${colorType}`);
  }
}

function unfilterByte(filter, raw, left, up, upLeft) {
  switch (filter) {
    case 0: return raw;
    case 1: return (raw + left) & 255;
    case 2: return (raw + up) & 255;
    case 3: return (raw + Math.floor((left + up) / 2)) & 255;
    case 4: return (raw + paeth(left, up, upLeft)) & 255;
    default:
      fail(`Unsupported PNG filter ${filter}`);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function toRGBA(pixels, width, height, colorType) {
  const channels = channelsForColorType(colorType);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    const dst = i * 4;
    if (colorType === 6) {
      rgba[dst] = pixels[src];
      rgba[dst + 1] = pixels[src + 1];
      rgba[dst + 2] = pixels[src + 2];
      rgba[dst + 3] = pixels[src + 3];
    } else if (colorType === 2) {
      rgba[dst] = pixels[src];
      rgba[dst + 1] = pixels[src + 1];
      rgba[dst + 2] = pixels[src + 2];
      rgba[dst + 3] = 255;
    } else if (colorType === 4) {
      rgba[dst] = pixels[src];
      rgba[dst + 1] = pixels[src];
      rgba[dst + 2] = pixels[src];
      rgba[dst + 3] = pixels[src + 1];
    } else {
      rgba[dst] = pixels[src];
      rgba[dst + 1] = pixels[src];
      rgba[dst + 2] = pixels[src];
      rgba[dst + 3] = 255;
    }
  }
  return rgba;
}

function image(width, height, rgba = Buffer.alloc(width * height * 4)) {
  return { width, height, rgba };
}

function keyGreenScreen(input) {
  const output = image(input.width, input.height, Buffer.from(input.rgba));
  for (let i = 0; i < output.rgba.length; i += 4) {
    let r = output.rgba[i];
    let g = output.rgba[i + 1];
    let b = output.rgba[i + 2];
    let a = output.rgba[i + 3];
    const maxRB = Math.max(r, b);
    const dominance = g - maxRB;
    const ratio = g / Math.max(1, maxRB);

    if ((g > 120 && dominance > 30 && ratio > 1.13) || (g > 178 && r < 165 && b < 165)) {
      const matte = clamp((dominance - 18) / 62, 0, 1);
      a = Math.round(a * (1 - matte));
      if (a < 18) {
        output.rgba[i] = 0;
        output.rgba[i + 1] = 0;
        output.rgba[i + 2] = 0;
        output.rgba[i + 3] = 0;
        continue;
      }
    }

    if (a > 0 && g > r && g > b) {
      g = Math.min(g, Math.round((r + b) / 2 + 8));
    }

    output.rgba[i] = r;
    output.rgba[i + 1] = g;
    output.rgba[i + 2] = b;
    output.rgba[i + 3] = a;
  }
  return output;
}

function alphaBBox(input, threshold = 12) {
  let minX = input.width;
  let minY = input.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const alpha = input.rgba[(y * input.width + x) * 4 + 3];
      if (alpha > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function crop(input, box) {
  const output = image(box.width, box.height);
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const src = ((box.y + y) * input.width + (box.x + x)) * 4;
      const dst = (y * box.width + x) * 4;
      input.rgba.copy(output.rgba, dst, src, src + 4);
    }
  }
  return output;
}

function fitSprite(input, maxWidth, maxHeight) {
  const keyed = keyGreenScreen(input);
  const box = alphaBBox(keyed);
  if (!box) fail('Pose became fully transparent after keying.');
  const cropped = crop(keyed, box);
  const scale = Math.min(maxWidth / cropped.width, maxHeight / cropped.height);
  return resize(cropped, Math.round(cropped.width * scale), Math.round(cropped.height * scale));
}

function eraseSleepMarks(input) {
  const output = image(input.width, input.height, Buffer.from(input.rgba));
  const cutoffY = Math.round(input.height * 0.24);
  const minX = Math.round(input.width * 0.43);

  for (let y = 0; y < cutoffY; y += 1) {
    for (let x = minX; x < input.width; x += 1) {
      const offset = (y * input.width + x) * 4;
      const r = output.rgba[offset];
      const g = output.rgba[offset + 1];
      const b = output.rgba[offset + 2];
      const a = output.rgba[offset + 3];
      const isNeutralDark = a > 20 && r < 130 && g < 130 && b < 130 && Math.max(r, g, b) - Math.min(r, g, b) < 55;
      if (isNeutralDark) {
        output.rgba[offset] = 0;
        output.rgba[offset + 1] = 0;
        output.rgba[offset + 2] = 0;
        output.rgba[offset + 3] = 0;
      }
    }
  }

  return output;
}

function resize(input, width, height) {
  const output = image(Math.max(1, width), Math.max(1, height));
  const sx = input.width / output.width;
  const sy = input.height / output.height;
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const color = sample(input, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
      setPixel(output, x, y, color);
    }
  }
  return output;
}

function rotate(input, degrees) {
  if (Math.abs(degrees) < 0.001) return input;
  const radians = degrees * Math.PI / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const width = Math.ceil(Math.abs(input.width * cos) + Math.abs(input.height * sin));
  const height = Math.ceil(Math.abs(input.width * sin) + Math.abs(input.height * cos));
  const output = image(width, height);
  const cx = (input.width - 1) / 2;
  const cy = (input.height - 1) / 2;
  const ox = (width - 1) / 2;
  const oy = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - ox;
      const dy = y - oy;
      const srcX = dx * cos + dy * sin + cx;
      const srcY = -dx * sin + dy * cos + cy;
      const color = sample(input, srcX, srcY);
      setPixel(output, x, y, color);
    }
  }
  return output;
}

function warp(input, mapPoint) {
  const output = image(input.width, input.height);
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const [sourceX, sourceY] = mapPoint(x, y, input.width, input.height);
      setPixel(output, x, y, sample(input, sourceX, sourceY));
    }
  }
  return output;
}

function walkSpriteForPhase(input, phase) {
  const cycle = phase * Math.PI * 2;
  const frontSwing = Math.sin(cycle);
  const rearSwing = Math.sin(cycle + Math.PI);
  const middleSwing = Math.sin(cycle + Math.PI / 2);

  return warp(input, (x, y, width, height) => {
    const nx = x / Math.max(1, width - 1);
    const ny = y / Math.max(1, height - 1);
    const lower = smoothstep(0.48, 0.94, ny);
    const paws = smoothstep(0.64, 0.98, ny);
    const frontLeg = gaussian(nx, 0.22, 0.075) * lower;
    const middleLeg = gaussian(nx, 0.49, 0.06) * lower;
    const rearLeg = gaussian(nx, 0.79, 0.085) * lower;
    const tail = gaussian(nx, 0.86, 0.12) * smoothstep(0.08, 0.48, ny) * (1 - smoothstep(0.48, 0.72, ny));

    let sx = x;
    let sy = y;
    sx -= frontLeg * frontSwing * 16;
    sx -= rearLeg * rearSwing * 14;
    sx -= middleLeg * middleSwing * 7;
    sx -= tail * Math.sin(cycle + Math.PI / 3) * 5;
    sy -= frontLeg * Math.max(0, frontSwing) * paws * 8;
    sy -= rearLeg * Math.max(0, rearSwing) * paws * 8;
    return [sx, sy];
  });
}

function gaussian(value, center, spread) {
  const delta = (value - center) / spread;
  return Math.exp(-0.5 * delta * delta);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sample(input, x, y) {
  if (x < -0.5 || y < -0.5 || x > input.width - 0.5 || y > input.height - 0.5) return [0, 0, 0, 0];
  const x0 = clamp(Math.floor(x), 0, input.width - 1);
  const y0 = clamp(Math.floor(y), 0, input.height - 1);
  const x1 = clamp(x0 + 1, 0, input.width - 1);
  const y1 = clamp(y0 + 1, 0, input.height - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const c00 = getPixel(input, x0, y0);
  const c10 = getPixel(input, x1, y0);
  const c01 = getPixel(input, x0, y1);
  const c11 = getPixel(input, x1, y1);
  const result = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel += 1) {
    const top = c00[channel] * (1 - tx) + c10[channel] * tx;
    const bottom = c01[channel] * (1 - tx) + c11[channel] * tx;
    result[channel] = Math.round(top * (1 - ty) + bottom * ty);
  }
  return result;
}

function getPixel(input, x, y) {
  const offset = (y * input.width + x) * 4;
  return [
    input.rgba[offset],
    input.rgba[offset + 1],
    input.rgba[offset + 2],
    input.rgba[offset + 3]
  ];
}

function setPixel(input, x, y, color) {
  const offset = (y * input.width + x) * 4;
  input.rgba[offset] = color[0];
  input.rgba[offset + 1] = color[1];
  input.rgba[offset + 2] = color[2];
  input.rgba[offset + 3] = color[3];
}

function renderFrame(sprite, options) {
  const sx = options.scaleX ?? 1;
  const sy = options.scaleY ?? 1;
  const scaled = resize(sprite, Math.round(sprite.width * sx), Math.round(sprite.height * sy));
  const transformed = rotate(scaled, options.rotation ?? 0);
  const frame = image(CANVAS, CANVAS);
  const anchorX = options.anchorX ?? CANVAS / 2;
  const bottomY = options.bottomY ?? 700;
  const x = Math.round(anchorX + (options.dx ?? 0) - transformed.width / 2);
  const y = options.topY == null
    ? Math.round(bottomY + (options.dy ?? 0) - transformed.height)
    : Math.round(options.topY + (options.dy ?? 0));
  paste(frame, transformed, x, y);
  return frame;
}

function paste(target, source, x, y) {
  for (let sy = 0; sy < source.height; sy += 1) {
    const ty = y + sy;
    if (ty < 0 || ty >= target.height) continue;
    for (let sx = 0; sx < source.width; sx += 1) {
      const tx = x + sx;
      if (tx < 0 || tx >= target.width) continue;
      const src = (sy * source.width + sx) * 4;
      const alpha = source.rgba[src + 3] / 255;
      if (alpha <= 0) continue;
      const dst = (ty * target.width + tx) * 4;
      target.rgba[dst] = Math.round(source.rgba[src] * alpha + target.rgba[dst] * (1 - alpha));
      target.rgba[dst + 1] = Math.round(source.rgba[src + 1] * alpha + target.rgba[dst + 1] * (1 - alpha));
      target.rgba[dst + 2] = Math.round(source.rgba[src + 2] * alpha + target.rgba[dst + 2] * (1 - alpha));
      target.rgba[dst + 3] = Math.round(source.rgba[src + 3] + target.rgba[dst + 3] * (1 - alpha));
    }
  }
}

function drawSleepMarks(frame, phase) {
  const lift = Math.sin(phase * Math.PI * 2);
  const alpha = Math.round(115 + Math.max(0, lift) * 70);
  const y = 222 - Math.max(0, lift) * 12;
  drawZ(frame, 477, y + 46, 14, alpha);
  drawZ(frame, 507, y + 20, 18, alpha);
  drawZ(frame, 544, y, 23, Math.round(alpha * 0.86));
}

function drawZ(frame, x, y, size, alpha) {
  const color = [54, 54, 54, alpha];
  const thickness = Math.max(2, Math.round(size / 7));
  drawLine(frame, x, y, x + size, y, color, thickness);
  drawLine(frame, x + size, y, x, y + size * 0.72, color, thickness);
  drawLine(frame, x, y + size * 0.72, x + size, y + size * 0.72, color, thickness);
}

function drawLine(frame, x1, y1, x2, y2, color, thickness) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    drawDot(frame, x, y, thickness, color);
  }
}

function drawDot(frame, cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    if (y < 0 || y >= frame.height) continue;
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x < 0 || x >= frame.width) continue;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      const strength = clamp(1 - distance / Math.max(1, radius), 0.22, 1);
      blendPixel(frame, x, y, [color[0], color[1], color[2], Math.round(color[3] * strength)]);
    }
  }
}

function blendPixel(frame, x, y, color) {
  const offset = (y * frame.width + x) * 4;
  const alpha = color[3] / 255;
  frame.rgba[offset] = Math.round(color[0] * alpha + frame.rgba[offset] * (1 - alpha));
  frame.rgba[offset + 1] = Math.round(color[1] * alpha + frame.rgba[offset + 1] * (1 - alpha));
  frame.rgba[offset + 2] = Math.round(color[2] * alpha + frame.rgba[offset + 2] * (1 - alpha));
  frame.rgba[offset + 3] = Math.round(color[3] + frame.rgba[offset + 3] * (1 - alpha));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writePNG(filePath, input) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodePNG(input.width, input.height, input.rgba));
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE, 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function saveAction(outputDir, actionName, frames) {
  const dir = path.join(outputDir, 'actions', actionName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  frames.forEach((frame, index) => writePNG(path.join(dir, `frame_${String(index).padStart(3, '0')}.png`), frame));
}

function importPoseSourceSheetIfAvailable(config = POSE_SOURCE) {
  if (!fs.existsSync(config.sheetPath)) return false;

  fs.mkdirSync(config.dir, { recursive: true });
  const keyedSheet = keyGreenScreen(loadSourceImage(config.sheetPath));
  const cellCount = config.sheetCellCount ?? config.entries.length;
  const cellWidth = Math.floor(keyedSheet.width / cellCount);
  const cells = config.entries.map((entry, index) => {
    const { name, poseKey } = normalizePoseEntry(entry);
    const width = index === cellCount - 1 ? keyedSheet.width - cellWidth * index : cellWidth;
    return { name, poseKey, image: crop(keyedSheet, { x: cellWidth * index, y: 0, width, height: keyedSheet.height }) };
  });

  const sourceManifest = {
    version: 1,
    source: config.sheetName,
    method: 'imagegen multi-action pose sheet imported with local chroma-key removal and per-pose framing',
    note: 'Photo-marking-priority Yuanbao source poses. Original photos are references only and are not included in the PetPack.',
    canvas: { width: CANVAS, height: CANVAS },
    poses: []
  };

  for (const { name, poseKey, image: cell } of cells) {
    const pose = POSES[poseKey];
    if (!pose) fail(`Unknown pose config '${poseKey}' for source '${name}'.`);
    const isolated = largestAlphaComponent(cell);
    const box = alphaBBox(isolated);
    if (!box) fail(`Pose source '${name}' is fully transparent after chroma-key removal.`);
    const sprite = crop(isolated, box);
    const scale = Math.min(pose.maxWidth / sprite.width, pose.maxHeight / sprite.height);
    const fitted = resize(sprite, Math.round(sprite.width * scale), Math.round(sprite.height * scale));
    const frame = renderFrame(fitted, { bottomY: pose.bottomY });
    writePNG(config.files[name], frame);
    sourceManifest.poses.push({ name, poseKey, file: path.basename(config.files[name]) });
  }

  const manifestName = config === POSE_SOURCE
    ? 'source_manifest.json'
    : config === POSE_OVERRIDE_SOURCE
      ? 'source_manifest_overrides.json'
      : `source_manifest_${path.basename(config.sheetName, '.png')}.json`;
  fs.writeFileSync(path.join(config.dir, manifestName), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  return true;
}

function largestAlphaComponent(input, threshold = 12) {
  const total = input.width * input.height;
  const visited = new Uint8Array(total);
  let best = [];
  const queue = [];

  for (let start = 0; start < total; start += 1) {
    if (visited[start] || input.rgba[start * 4 + 3] <= threshold) continue;
    const component = [];
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);

    for (let read = 0; read < queue.length; read += 1) {
      const index = queue[read];
      component.push(index);
      const x = index % input.width;
      const y = Math.floor(index / input.width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < input.width ? index + 1 : -1,
        y > 0 ? index - input.width : -1,
        y + 1 < input.height ? index + input.width : -1
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next] || input.rgba[next * 4 + 3] <= threshold) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (component.length > best.length) {
      best = component;
    }
  }

  if (!best.length) return input;
  const output = image(input.width, input.height);
  for (const index of best) {
    const offset = index * 4;
    input.rgba.copy(output.rgba, offset, offset, offset + 4);
  }
  return output;
}

function loadProjectPoseSources() {
  if (!Object.values(POSE_SOURCE.files).every((filePath) => fs.existsSync(filePath))) return null;
  const sprites = {};
  loadPoseSourceFiles(sprites, POSE_SOURCE, true);
  loadPoseSourceFiles(sprites, IDLE_VARIANT_SOURCE, false);
  loadPoseSourceFiles(sprites, IDLE_SPIN_SOURCE, false);
  return sprites;
}

function loadPoseSourceFiles(sprites, config, requireAll) {
  const entries = config.entries.map(normalizePoseEntry);
  if (requireAll && !entries.every(({ name }) => fs.existsSync(config.files[name]))) return false;

  for (const { name, poseKey } of entries) {
    const filePath = config.files[name];
    if (!fs.existsSync(filePath)) continue;
    const pose = POSES[poseKey];
    if (!pose) fail(`Unknown pose config '${poseKey}' for source '${name}'.`);
    sprites[name] = spriteFromFramedSource(loadSourceImage(filePath), pose);
  }
  return true;
}

function importWalkKeyPoseSheetIfAvailable(config) {
  if (!fs.existsSync(config.sheetPath)) return false;

  fs.mkdirSync(config.dir, { recursive: true });
  const keyedSheet = keyGreenScreen(loadSourceImage(config.sheetPath));
  const cellWidth = Math.floor(keyedSheet.width / WALK_KEYPOSE_PHASES.length);
  const cells = WALK_KEYPOSE_PHASES.map((_, index) => {
    const width = index === WALK_KEYPOSE_PHASES.length - 1 ? keyedSheet.width - cellWidth * index : cellWidth;
    return crop(keyedSheet, { x: cellWidth * index, y: 0, width, height: keyedSheet.height });
  });

  const trimmed = cells.map((cell, index) => {
    const isolated = largestAlphaComponent(cell);
    const box = alphaBBox(isolated);
    if (!box) fail(`Walk key pose ${index} is fully transparent after chroma-key removal.`);
    return crop(isolated, box);
  });

  const scale = Math.min(
    ...trimmed.map((sprite) => POSES.walk.maxWidth / sprite.width),
    ...trimmed.map((sprite) => POSES.walk.maxHeight / sprite.height)
  );

  trimmed.forEach((sprite, index) => {
    const fitted = resize(sprite, Math.round(sprite.width * scale), Math.round(sprite.height * scale));
    const frame = renderFrame(fitted, { bottomY: POSES.walk.bottomY });
    writePNG(config.files[index], frame);
  });

  const sourceManifest = {
    version: 2,
    source: config.sheetName,
    direction: config.direction,
    method: 'imagegen walk-cycle sprite sheet imported with local chroma-key removal and per-pose framing',
    note: `Four true ${config.direction}-facing walking key poses for Yuanbao. The generated sheet is preserved so the key poses can be regenerated.`,
    canvas: { width: CANVAS, height: CANVAS },
    keyPoses: WALK_KEYPOSE_PHASES.map((phase, index) => ({
      file: path.basename(config.files[index]),
      phase
    }))
  };
  fs.writeFileSync(path.join(config.dir, 'source_manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  return true;
}

function loadWalkKeyPoseSources(config) {
  if (!config.files.every((filePath) => fs.existsSync(filePath))) return null;
  return config.files.map((filePath) => spriteFromFramedSource(loadSourceImage(filePath)));
}

function spriteFromFramedSource(input, pose = POSES.walk) {
  const keyed = keyGreenScreen(input);
  const box = alphaBBox(keyed);
  if (!box) fail('Walk key pose became fully transparent after keying.');
  const cropped = crop(keyed, box);
  const scale = Math.min(1, pose.maxWidth / cropped.width, pose.maxHeight / cropped.height);
  return scale < 1 ? resize(cropped, Math.round(cropped.width * scale), Math.round(cropped.height * scale)) : cropped;
}

function saveDerivedWalkKeyPoseSources(walkSprite, config = WALK_LEFT_SOURCE) {
  fs.mkdirSync(config.dir, { recursive: true });

  const keySprites = WALK_KEYPOSE_PHASES.map((phase, index) => {
    const sprite = walkSpriteForPhase(walkSprite, phase);
    const frame = renderFrame(sprite, { bottomY: POSES.walk.bottomY });
    writePNG(config.files[index], frame);
    return sprite;
  });

  const sourceManifest = {
    version: 1,
    source: 'yuanbao_walk_pose_1779587530643.png',
    direction: config.direction,
    method: 'fallback local warp from one walk pose',
    note: 'Fallback only. Prefer generated walk-cycle sheets for true step-cycle key poses.',
    canvas: { width: CANVAS, height: CANVAS },
    keyPoses: WALK_KEYPOSE_PHASES.map((phase, index) => ({
      file: path.basename(config.files[index]),
      phase
    }))
  };
  fs.writeFileSync(path.join(config.dir, 'source_manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
  return keySprites;
}

function buildFrames(sprites) {
  const idle = POSES.idle;
  const yawn = POSES.idle_yawn;
  const spin = POSES.idle_spin;
  const walk = POSES.walk;
  const happy = POSES.tap_happy;
  const dragged = POSES.dragged;
  const rest = POSES.rest;
  const walkLeftKeys = sprites.walkLeftKeys?.length ? sprites.walkLeftKeys : [sprites.walk];
  const walkRightKeys = sprites.walkRightKeys?.length ? sprites.walkRightKeys : walkLeftKeys;
  const spinKeys = Array.from({ length: IDLE_SPIN_KEY_COUNT }, (_, index) => sprites[`idle_spin_${String(index).padStart(2, '0')}`]).filter(Boolean);

  const buildWalkFrames = (walkKeys) => Array.from({ length: 12 }, (_, i) => {
    const phase = i / 12;
    const t = Math.sin(phase * Math.PI * 2);
    const keySprite = walkKeys[Math.floor(i / 3) % walkKeys.length];
    const microStep = (i % 3) - 1;
    return renderFrame(keySprite, {
      bottomY: walk.bottomY,
      rotation: t * 0.55,
      dy: -Math.abs(t) * 6 + microStep,
      dx: t * 4 + microStep * 1.5
    });
  });

  return {
    idle: Array.from({ length: 10 }, (_, i) => {
      const t = Math.sin((i / 10) * Math.PI * 2);
      return renderFrame(sprites.idle, {
        bottomY: idle.bottomY,
        scaleX: 1 - t * 0.006,
        scaleY: 1 + t * 0.012,
        dy: -Math.max(0, t) * 3
      });
    }),
    idle_yawn: [
      renderFrame(sprites.idle, { bottomY: idle.bottomY }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 1.01, scaleY: 0.99, dy: 2 }),
      renderFrame(sprites.idle_yawn, { bottomY: yawn.bottomY, scaleX: 0.99, scaleY: 1.01, dy: -2 }),
      renderFrame(sprites.idle_yawn, { bottomY: yawn.bottomY, scaleX: 1.0, scaleY: 1.0, dy: -4 }),
      renderFrame(sprites.idle_yawn, { bottomY: yawn.bottomY, scaleX: 1.01, scaleY: 0.99, dy: -3 }),
      renderFrame(sprites.idle_yawn, { bottomY: yawn.bottomY, scaleX: 1.0, scaleY: 1.0, dy: -2 }),
      renderFrame(sprites.idle_yawn, { bottomY: yawn.bottomY, scaleX: 0.99, scaleY: 1.01, dy: -1 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 1.01, scaleY: 0.98, dy: 4 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 0.995, scaleY: 1.005, dy: -1 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY })
    ],
    idle_spin: spinKeys.map((keySprite) => renderFrame(keySprite, { bottomY: spin.bottomY })),
    walk: buildWalkFrames(walkLeftKeys),
    walk_left: buildWalkFrames(walkLeftKeys),
    walk_right: buildWalkFrames(walkRightKeys),
    tap_happy: [
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 1.04, scaleY: 0.96, dy: 7 }),
      renderFrame(sprites.tap_happy, { bottomY: happy.bottomY, scaleX: 0.98, scaleY: 1.02, dy: -18 }),
      renderFrame(sprites.tap_happy, { bottomY: happy.bottomY, scaleX: 1.0, scaleY: 1.0, dy: -36, rotation: -1.0 }),
      renderFrame(sprites.tap_happy, { bottomY: happy.bottomY, scaleX: 1.01, scaleY: 0.99, dy: -38 }),
      renderFrame(sprites.tap_happy, { bottomY: happy.bottomY, scaleX: 1.0, scaleY: 1.0, dy: -22, rotation: 1.0 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 1.06, scaleY: 0.94, dy: 8 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY, scaleX: 0.99, scaleY: 1.01, dy: -2 }),
      renderFrame(sprites.idle, { bottomY: idle.bottomY })
    ],
    dragged: Array.from({ length: 6 }, (_, i) => {
      const t = Math.sin((i / 6) * Math.PI * 2);
      return renderFrame(sprites.dragged, {
        topY: 205,
        anchorX: CANVAS / 2,
        rotation: t * 2.2,
        dx: t * 3,
        dy: Math.cos((i / 6) * Math.PI * 2) * 2
      });
    }),
    rest: Array.from({ length: 8 }, (_, i) => {
      const phase = i / 8;
      const t = Math.sin(phase * Math.PI * 2);
      const frame = renderFrame(sprites.rest, {
        bottomY: rest.bottomY,
        scaleX: 1 + t * 0.008,
        scaleY: 1 - t * 0.006,
        dy: -Math.max(0, t) * 2
      });
      drawSleepMarks(frame, phase);
      return frame;
    })
  };
}

function assertRestFrames(frames) {
  frames.forEach((frame, index) => {
    const box = alphaBBox(frame);
    if (!box) fail(`Rest frame ${index} has no visible pixels.`);

    const darkOpaquePixels = countDarkOpaquePixels(frame);
    if (darkOpaquePixels < 12000) {
      fail(`Rest frame ${index} has too few opaque dark marking pixels (${darkOpaquePixels}). Check that back patches were not keyed out.`);
    }

    const internalTransparentPixels = countInternalTransparentPixels(frame, box);
    if (internalTransparentPixels > 9000) {
      fail(`Rest frame ${index} contains a large internal transparent region (${internalTransparentPixels}px). Check for missing body/back patch alpha.`);
    }
  });
}

function countDarkOpaquePixels(input) {
  let count = 0;
  for (let i = 0; i < input.rgba.length; i += 4) {
    const r = input.rgba[i];
    const g = input.rgba[i + 1];
    const b = input.rgba[i + 2];
    const a = input.rgba[i + 3];
    if (a > 180 && r < 125 && g < 125 && b < 125) count += 1;
  }
  return count;
}

function countInternalTransparentPixels(input, box) {
  const width = box.width;
  const height = box.height;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const isTransparent = (x, y) => {
    const offset = ((box.y + y) * input.width + (box.x + x)) * 4;
    return input.rgba[offset + 3] <= 12;
  };
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !isTransparent(x, y)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let read = 0; read < queue.length; read += 1) {
    const index = queue[read];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isTransparent(x, y) && !visited[y * width + x]) count += 1;
    }
  }
  return count;
}

function main() {
  const sourceDirInput = process.argv[2] || DEFAULT_SOURCE_DIR;
  const outputDir = path.resolve(process.argv[3] || 'Yuanbao.petpack');
  const sourceDir = sourceDirInput ? path.resolve(sourceDirInput) : null;
  if (sourceDir && !fs.existsSync(sourceDir)) fail(`Source directory does not exist: ${sourceDir}`);
  importPoseSourceSheetIfAvailable(POSE_SOURCE);
  importPoseSourceSheetIfAvailable(POSE_OVERRIDE_SOURCE);
  importPoseSourceSheetIfAvailable(IDLE_VARIANT_SOURCE);
  importPoseSourceSheetIfAvailable(IDLE_SPIN_SOURCE);
  importWalkKeyPoseSheetIfAvailable(WALK_LEFT_SOURCE);
  importWalkKeyPoseSheetIfAvailable(WALK_RIGHT_SOURCE);

  const sprites = loadProjectPoseSources() ?? {};
  if (!Object.keys(sprites).length) {
    if (!sourceDir) {
      fail(`Missing project pose source sheet: ${POSE_SOURCE.sheetPath}`);
    }
    for (const [name, pose] of Object.entries(POSES)) {
      const filePath = path.join(sourceDir, pose.file);
      if (!fs.existsSync(filePath)) fail(`Missing pose source: ${filePath}`);
      sprites[name] = fitSprite(loadSourceImage(filePath), pose.maxWidth, pose.maxHeight);
    }
  }
  const requiredIdleVariantSources = [
    'idle_yawn',
    ...Array.from({ length: IDLE_SPIN_KEY_COUNT }, (_, index) => `idle_spin_${String(index).padStart(2, '0')}`)
  ];
  for (const sourceName of requiredIdleVariantSources) {
    const expectedSheet = sourceName === 'idle_yawn' ? IDLE_VARIANT_SOURCE.sheetPath : IDLE_SPIN_SOURCE.sheetPath;
    if (!sprites[sourceName]) fail(`Missing idle variant source '${sourceName}'. Expected sheet: ${expectedSheet}`);
  }
  sprites.walkLeftKeys = loadWalkKeyPoseSources(WALK_LEFT_SOURCE) ?? saveDerivedWalkKeyPoseSources(sprites.walk, WALK_LEFT_SOURCE);
  sprites.walkRightKeys = loadWalkKeyPoseSources(WALK_RIGHT_SOURCE);
  if (!sprites.walkRightKeys) fail(`Missing right walk source sheet: ${WALK_RIGHT_SOURCE.sheetPath}`);

  backupExistingPack(outputDir);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const frames = buildFrames(sprites);
  assertRestFrames(frames.rest);
  for (const [actionName, actionFrames] of Object.entries(frames)) {
    saveAction(outputDir, actionName, actionFrames);
  }
  fs.copyFileSync(path.join(outputDir, 'actions', 'idle', 'frame_000.png'), path.join(outputDir, 'preview.png'));

  const manifest = {
    schemaVersion: 1,
    id: 'yuanbao-cat',
    displayName: '元宝',
    species: 'cat',
    style: 'soft_storybook_multi_pose',
    version: '0.5.6',
    canvas: { width: CANVAS, height: CANVAS, anchorX: 0.5, anchorY: 0.0 },
    defaultScale: 0.67,
    actions: {
      idle: { path: 'actions/idle', fps: 8, loop: true, required: true, fallback: null },
      idle_yawn: { path: 'actions/idle_yawn', fps: 8, loop: false, required: false, fallback: 'idle' },
      idle_spin: { path: 'actions/idle_spin', fps: 8, loop: false, required: false, fallback: 'idle' },
      walk: { path: 'actions/walk', fps: 12, loop: true, required: false, fallback: 'idle' },
      walk_left: { path: 'actions/walk_left', fps: 12, loop: true, required: false, fallback: 'walk' },
      walk_right: { path: 'actions/walk_right', fps: 12, loop: true, required: false, fallback: 'walk' },
      tap_happy: { path: 'actions/tap_happy', fps: 12, loop: false, required: false, fallback: 'idle' },
      dragged: { path: 'actions/dragged', fps: 8, loop: true, required: false, fallback: 'idle' },
      rest: { path: 'actions/rest', fps: 4, loop: true, required: false, fallback: 'idle' }
    }
  };

  const bubbles = {
    idle: ['喵~', '我在这里陪你。', '今天也乖乖守着桌面。'],
    walk: ['去巡视一下领地。', '猫步出发。'],
    tap_happy: ['嘿嘿！', '再摸摸我~', '开心到翻肚皮。'],
    dragged: ['哎呀，放我下来！', '我被提起来啦。'],
    rest: ['让我睡一会儿...Zzz', '元宝进入省电模式。']
  };

  const license = [
    'Yuanbao PetPack v0.5.6',
    '',
    'Reference photos: provided by the user for this DesktopPet beta.',
    'Generated pose sources: local AI-generated Yuanbao sheets, using the user-provided real photos as photo-marking references. Idle yawn, idle spin, and rest repair sources are kept outside the PetPack.',
    'Walk key pose sources: left and right walk key pose sheets generated from Yuanbao references. All current sources prioritize the real photo markings.',
    'Frame process: local Node.js PNG processing, green-screen removal, pose fitting, key-pose sequencing, and light motion pass.',
    'Original photos: not included in this PetPack.',
    'Usage: intended only for local DesktopPet beta testing.',
    "Redistribution: do not redistribute generated assets or source references without the user's permission.",
    ''
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'bubbles.json'), `${JSON.stringify(bubbles, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'license.txt'), license);
  console.log(`Generated: ${outputDir}`);
  console.log(`Pose sources: ${POSE_SOURCE.dir}`);
  console.log(`Walk left key pose sources: ${WALK_LEFT_SOURCE.dir}`);
  console.log(`Walk right key pose sources: ${WALK_RIGHT_SOURCE.dir}`);
}

function backupExistingPack(outputDir) {
  if (!fs.existsSync(outputDir)) return;
  const backupRoot = path.resolve('legacy', 'backup');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const backupPath = path.join(backupRoot, `${path.basename(outputDir)}-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.cpSync(outputDir, backupPath, { recursive: true });
  console.log(`Backed up existing pack: ${backupPath}`);
}

main();
