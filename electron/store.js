const fs = require('fs');
const path = require('path');

class PetStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  get(key, fallback = undefined) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

module.exports = { PetStore };
