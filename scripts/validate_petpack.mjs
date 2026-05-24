#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const FRAME_RE = /^frame_(\d{3,})\.png$/;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Failed to read ${path.basename(filePath)}: ${error.message}`);
  }
}

function pngInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    fail(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25),
    hasAlpha: [4, 6].includes(buffer.readUInt8(25)) || buffer.includes(Buffer.from('tRNS'))
  };
}

function validatePNG(filePath, width, height) {
  if (!fs.existsSync(filePath)) fail(`Missing PNG: ${filePath}`);
  const info = pngInfo(filePath);
  if (info.width !== width || info.height !== height) {
    fail(`${filePath} is ${info.width}x${info.height}; expected ${width}x${height}.`);
  }
  if (!info.hasAlpha) fail(`${filePath} does not contain an alpha channel.`);
}

function validatePetPack(packPath) {
  if (!fs.existsSync(packPath) || !fs.statSync(packPath).isDirectory()) {
    fail(`PetPack folder does not exist: ${packPath}`);
  }

  const manifest = readJSON(path.join(packPath, 'manifest.json'));
  if (manifest.schemaVersion !== 1) fail(`Unsupported schemaVersion ${manifest.schemaVersion}.`);
  if (!manifest.id) fail('manifest.id is required.');
  if (!manifest.canvas?.width || !manifest.canvas?.height) fail('manifest.canvas width/height are required.');
  if (!manifest.actions || typeof manifest.actions !== 'object') fail('manifest.actions dictionary is required.');
  if (!manifest.actions.idle?.required) fail("Required action 'idle' is missing or not marked required.");

  const width = Number(manifest.canvas.width);
  const height = Number(manifest.canvas.height);
  validatePNG(path.join(packPath, 'preview.png'), width, height);
  if (!fs.existsSync(path.join(packPath, 'license.txt'))) fail('license.txt is missing.');
  const bubbles = readJSON(path.join(packPath, 'bubbles.json'));
  if (!Array.isArray(bubbles.idle)) fail("bubbles.json must contain an 'idle' text array.");

  for (const [name, action] of Object.entries(manifest.actions)) {
    if (!Number.isInteger(action.fps) || action.fps < 1 || action.fps > 60) fail(`Action '${name}' has invalid fps.`);
    if (action.fallback && !manifest.actions[action.fallback]) fail(`Action '${name}' references missing fallback '${action.fallback}'.`);
    const actionDir = path.join(packPath, action.path);
    if (!fs.existsSync(actionDir)) fail(`Missing action directory: ${action.path}`);
    const frames = fs.readdirSync(actionDir).filter((file) => file.endsWith('.png')).sort();
    if (!frames.length) fail(`Action '${name}' has no frames.`);
    frames.forEach((file, index) => {
      const match = file.match(FRAME_RE);
      if (!match) fail(`Invalid frame name '${file}' in '${name}'.`);
      const expected = `frame_${String(index).padStart(3, '0')}.png`;
      if (file !== expected) fail(`Frame gap in '${name}'. Expected ${expected}, got ${file}.`);
      validatePNG(path.join(actionDir, file), width, height);
    });
  }

  console.log(`OK: ${manifest.displayName || manifest.id} (${manifest.id})`);
}

const target = process.argv[2];
if (!target) fail('Usage: node scripts/validate_petpack.mjs path/to/PetPack');
validatePetPack(path.resolve(target));
