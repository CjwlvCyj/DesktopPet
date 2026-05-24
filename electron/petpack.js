const fs = require('fs');
const path = require('path');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${path.basename(filePath)}: ${error.message}`);
  }
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function sanitizePackId(id) {
  return String(id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'petpack';
}

function readPNGInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  ensure(signature === '89504e470d0a1a0a', `Not a PNG file: ${filePath}`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer.readUInt8(25);
  const hasAlpha = colorType === 4 || colorType === 6 || buffer.includes(Buffer.from('tRNS'));
  return { width, height, hasAlpha };
}

function sortedFrameFiles(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort()
    .map((name) => path.join(directory, name));
}

function validateFrameSequence(files, actionName) {
  files.forEach((filePath, index) => {
    const expected = `frame_${String(index).padStart(3, '0')}.png`;
    const actual = path.basename(filePath);
    ensure(actual === expected, `Action '${actionName}' expected ${expected}, got ${actual}.`);
  });
}

function validatePNG(filePath, expectedWidth, expectedHeight) {
  ensure(fs.existsSync(filePath), `Missing PNG: ${filePath}`);
  const info = readPNGInfo(filePath);
  ensure(info.width === expectedWidth && info.height === expectedHeight, `${filePath} is ${info.width}x${info.height}; expected ${expectedWidth}x${expectedHeight}.`);
  ensure(info.hasAlpha, `${filePath} does not contain an alpha channel.`);
}

function validatePetPack(packPath) {
  const basePath = path.resolve(packPath);
  ensure(fs.existsSync(basePath) && fs.statSync(basePath).isDirectory(), `PetPack folder does not exist: ${basePath}`);

  const manifest = readJSON(path.join(basePath, 'manifest.json'));
  ensure(manifest.schemaVersion === 1, `Unsupported schemaVersion '${manifest.schemaVersion}'. Expected 1.`);
  ensure(manifest.id, 'manifest.id is required.');
  ensure(manifest.canvas && manifest.canvas.width && manifest.canvas.height, 'manifest.canvas width/height are required.');
  ensure(manifest.actions && typeof manifest.actions === 'object', 'manifest.actions dictionary is required.');
  ensure(manifest.actions.idle && manifest.actions.idle.required === true, "Required action 'idle' is missing or not marked required.");

  const expectedWidth = Number(manifest.canvas.width);
  const expectedHeight = Number(manifest.canvas.height);
  validatePNG(path.join(basePath, 'preview.png'), expectedWidth, expectedHeight);
  ensure(fs.existsSync(path.join(basePath, 'license.txt')), 'license.txt is missing.');
  const bubbles = readJSON(path.join(basePath, 'bubbles.json'));
  ensure(Array.isArray(bubbles.idle), "bubbles.json must contain an 'idle' text array.");

  for (const [name, action] of Object.entries(manifest.actions)) {
    ensure(Number.isInteger(action.fps) && action.fps >= 1 && action.fps <= 60, `Action '${name}' has invalid fps '${action.fps}'.`);
    ensure(!action.fallback || manifest.actions[action.fallback], `Action '${name}' references missing fallback '${action.fallback}'.`);
  }

  const frames = {};
  for (const [name, action] of Object.entries(manifest.actions)) {
    const actionDir = path.join(basePath, action.path);
    ensure(fs.existsSync(actionDir) && fs.statSync(actionDir).isDirectory(), `Action directory is missing for '${name}': ${action.path}`);
    const files = sortedFrameFiles(actionDir);
    ensure(files.length > 0, `Action '${name}' has no PNG frames.`);
    validateFrameSequence(files, name);
    files.forEach((filePath) => validatePNG(filePath, expectedWidth, expectedHeight));
    frames[name] = files;
  }

  return { basePath, manifest, bubbles, frames };
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (itemPath) => path.basename(itemPath) !== '.DS_Store'
  });
}

function installPetPack(sourcePath, installRoot) {
  const sourcePack = validatePetPack(sourcePath);
  const packId = sanitizePackId(sourcePack.manifest.id);
  const target = path.join(installRoot, `${packId}.petpack`);
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const staging = path.join(installRoot, `.staging-${packId}-${stamp}`);
  const backup = path.join(installRoot, `.backup-${packId}-${stamp}`);

  fs.mkdirSync(installRoot, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  copyDirectory(sourcePack.basePath, staging);
  validatePetPack(staging);

  let movedOldPack = false;
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(backup, { recursive: true, force: true });
      fs.renameSync(target, backup);
      movedOldPack = true;
    }
    fs.renameSync(staging, target);
    if (movedOldPack) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (movedOldPack && !fs.existsSync(target) && fs.existsSync(backup)) {
      fs.renameSync(backup, target);
    }
    throw error;
  }

  return validatePetPack(target);
}

module.exports = { installPetPack, validatePetPack };
