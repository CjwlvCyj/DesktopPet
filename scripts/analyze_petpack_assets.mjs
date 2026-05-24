#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const ALPHA_THRESHOLD = 12;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parsePNG(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    fail(`Not a PNG: ${filePath}`);
  }

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
  const channels = channelsForColorType(colorType, filePath);
  const bpp = channels;
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
      const left = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prevRowStart + x - bpp] : 0;
      pixels[rowStart + x] = unfilterByte(filter, raw, left, up, upLeft);
    }

    input += scanlineLength;
  }

  return {
    filePath,
    width,
    height,
    rgba: toRGBA(pixels, width, height, colorType)
  };
}

function channelsForColorType(colorType, filePath) {
  switch (colorType) {
    case 0: return 1;
    case 2: return 3;
    case 4: return 2;
    case 6: return 4;
    default:
      fail(`Unsupported color type ${colorType}: ${filePath}`);
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
  const rgba = Buffer.alloc(width * height * 4);
  const channels = channelsForColorType(colorType, 'image');

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

function alphaBBox(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: minX + (maxX - minX + 1) / 2,
    centerY: minY + (maxY - minY + 1) / 2,
    area: (maxX - minX + 1) * (maxY - minY + 1)
  };
}

function rmsDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) fail('Cannot diff images with different sizes.');
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const active = a.rgba[i + 3] > ALPHA_THRESHOLD || b.rgba[i + 3] > ALPHA_THRESHOLD;
    if (!active) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = a.rgba[i + channel] - b.rgba[i + channel];
      sum += delta * delta;
      count += 1;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function summarizeAction(actionName, action, images) {
  const bboxes = images.map(alphaBBox);
  const centersX = bboxes.map((box) => box?.centerX ?? 0);
  const centersY = bboxes.map((box) => box?.centerY ?? 0);
  const areas = bboxes.map((box) => box?.area ?? 0);
  const prevDiffs = [];
  for (let i = 1; i < images.length; i += 1) {
    prevDiffs.push(rmsDiff(images[i - 1], images[i]));
  }

  const driftX = range(centersX);
  const driftY = range(centersY);
  const areaDriftPct = percentRange(areas);
  const avgDiff = average(prevDiffs);
  const minDiff = Math.min(...prevDiffs);
  const maxDiff = Math.max(...prevDiffs);

  return {
    actionName,
    fps: action.fps,
    loop: !!action.loop,
    frameCount: images.length,
    firstBBox: bboxes[0],
    driftX,
    driftY,
    areaDriftPct,
    avgDiff,
    minDiff,
    maxDiff
  };
}

function range(values) {
  return Math.max(...values) - Math.min(...values);
}

function percentRange(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min ? ((max - min) / min) * 100 : 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createContactSheet(actions, outputPath) {
  const thumb = 96;
  const gap = 10;
  const rowLabelWidth = 26;
  const maxFrames = Math.max(...actions.map((item) => item.images.length));
  const width = rowLabelWidth + maxFrames * thumb + (maxFrames + 1) * gap;
  const height = actions.length * thumb + (actions.length + 1) * gap;
  const rgba = Buffer.alloc(width * height * 4);

  fill(rgba, width, height, [248, 248, 248, 255]);
  actions.forEach((item, row) => {
    const y = gap + row * (thumb + gap);
    drawRowMarker(rgba, width, height, gap, y, rowLabelWidth - gap, thumb, row);
    item.images.forEach((image, column) => {
      const x = rowLabelWidth + gap + column * (thumb + gap);
      drawThumb(rgba, width, height, image, x, y, thumb);
    });
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encodePNG(width, height, rgba));
}

function fill(rgba, width, height, color) {
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = color[0];
    rgba[i * 4 + 1] = color[1];
    rgba[i * 4 + 2] = color[2];
    rgba[i * 4 + 3] = color[3];
  }
}

function drawRowMarker(target, width, height, x, y, markerWidth, markerHeight, row) {
  const colors = [
    [40, 82, 160, 255],
    [28, 132, 92, 255],
    [194, 88, 45, 255],
    [120, 76, 176, 255],
    [156, 117, 28, 255]
  ];
  const color = colors[row % colors.length];
  for (let yy = y; yy < y + markerHeight; yy += 1) {
    for (let xx = x; xx < x + markerWidth; xx += 1) {
      const offset = (yy * width + xx) * 4;
      target[offset] = color[0];
      target[offset + 1] = color[1];
      target[offset + 2] = color[2];
      target[offset + 3] = color[3];
    }
  }
}

function drawThumb(target, width, height, image, x, y, size) {
  for (let yy = 0; yy < size; yy += 1) {
    for (let xx = 0; xx < size; xx += 1) {
      const checker = ((Math.floor(xx / 8) + Math.floor(yy / 8)) % 2) === 0 ? 226 : 242;
      const dst = ((y + yy) * width + (x + xx)) * 4;
      target[dst] = checker;
      target[dst + 1] = checker;
      target[dst + 2] = checker;
      target[dst + 3] = 255;
    }
  }

  const scale = Math.min(size / image.width, size / image.height);
  const drawWidth = Math.round(image.width * scale);
  const drawHeight = Math.round(image.height * scale);
  const ox = x + Math.floor((size - drawWidth) / 2);
  const oy = y + Math.floor((size - drawHeight) / 2);

  for (let yy = 0; yy < drawHeight; yy += 1) {
    for (let xx = 0; xx < drawWidth; xx += 1) {
      const srcX = Math.min(image.width - 1, Math.floor(xx / scale));
      const srcY = Math.min(image.height - 1, Math.floor(yy / scale));
      const src = (srcY * image.width + srcX) * 4;
      const alpha = image.rgba[src + 3] / 255;
      const dst = ((oy + yy) * width + (ox + xx)) * 4;
      target[dst] = Math.round(image.rgba[src] * alpha + target[dst] * (1 - alpha));
      target[dst + 1] = Math.round(image.rgba[src + 1] * alpha + target[dst + 1] * (1 - alpha));
      target[dst + 2] = Math.round(image.rgba[src + 2] * alpha + target[dst + 2] * (1 - alpha));
      target[dst + 3] = 255;
    }
  }
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

function main() {
  const packPath = path.resolve(process.argv[2] || 'Yuanbao.petpack');
  const manifest = readJSON(path.join(packPath, 'manifest.json'));
  const actionItems = [];

  for (const [name, action] of Object.entries(manifest.actions)) {
    const actionDir = path.join(packPath, action.path);
    const frames = fs.readdirSync(actionDir)
      .filter((file) => file.endsWith('.png'))
      .sort()
      .map((file) => path.join(actionDir, file));
    const images = frames.map(parsePNG);
    actionItems.push({ name, action, frames, images });
  }

  const outputPath = path.resolve(process.argv[3] || path.join('debug_previews', `${manifest.id}-contact-sheet.png`));
  createContactSheet(actionItems, outputPath);

  console.log(`PetPack: ${manifest.displayName || manifest.id} (${manifest.id})`);
  console.log(`Contact sheet: ${outputPath}`);
  console.log('');
  console.log('Rows:');
  actionItems.forEach((item, index) => console.log(`  ${index + 1}. ${item.name}`));
  console.log('');
  console.log('Action summary:');

  for (const item of actionItems) {
    const summary = summarizeAction(item.name, item.action, item.images);
    const box = summary.firstBBox;
    console.log([
      `- ${summary.actionName}: ${summary.frameCount} frames @ ${summary.fps}fps`,
      summary.loop ? 'loop' : 'once',
      `bbox ${box.x},${box.y} ${box.width}x${box.height}`,
      `center drift ${summary.driftX.toFixed(1)}x${summary.driftY.toFixed(1)}px`,
      `area drift ${summary.areaDriftPct.toFixed(1)}%`,
      `prev RMS avg/min/max ${summary.avgDiff.toFixed(1)}/${summary.minDiff.toFixed(1)}/${summary.maxDiff.toFixed(1)}`
    ].join('; '));
  }
}

main();
