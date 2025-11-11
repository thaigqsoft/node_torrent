const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..', '..');

const DEFAULTS = {
  keyStore: path.join(ROOT_DIR, 'config', 'keys.json'),
  tracker: 'http://localhost:9000/announce',
  handshakeDir: path.join(ROOT_DIR, 'handshakes'),
  tempDir: path.join(os.tmpdir(), 'secure-torrent')
};

function ensureDir(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  }
}

function resolvePath(inputPath, fallback) {
  if (!inputPath) {
    return fallback;
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

module.exports = {
  ROOT_DIR,
  DEFAULTS,
  ensureDir,
  resolvePath
};

