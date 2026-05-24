const fs = require('fs');
const path = require('path');
const os = require('os');

const DEBOUNCE_MS = 500;

class PetStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this._writeTimer = null;
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      this.data = {};
      // ENOENT is expected on first launch — only log genuine errors
      if (err.code !== 'ENOENT') {
        process.stderr.write(`[PetStore] Failed to load ${this.filePath}: ${err.message}${os.EOL}`);
      }
    }
  }

  get(key, fallback = undefined) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this._scheduleSave();
  }

  /**
   * Force an immediate write to disk, cancelling any pending debounced write.
   * Call this before app quit to ensure nothing is lost.
   */
  flush() {
    if (this._writeTimer !== null) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    this._writeToDisk();
  }

  // ── private ────────────────────────────────────────────

  _scheduleSave() {
    if (this._writeTimer !== null) {
      clearTimeout(this._writeTimer);
    }
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this._writeToDisk();
    }, DEBOUNCE_MS);
  }

  /**
   * Atomic write: serialize → write to a temp file next to the target → rename.
   * rename(2) is atomic on every major OS when src and dst are on the same filesystem.
   */
  _writeToDisk() {
    const dir = path.dirname(this.filePath);
    const tmpPath = path.join(dir, `.${path.basename(this.filePath)}.tmp`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      process.stderr.write(`[PetStore] Failed to save ${this.filePath}: ${err.message}${os.EOL}`);
      // Clean up the temp file if the rename failed
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
    }
  }
}

module.exports = { PetStore };
