const sodium = require('libsodium-wrappers');

async function getSodium() {
  await sodium.ready;
  return sodium;
}

function toBase64(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }
  return buffer.toString('base64');
}

function fromBase64(str) {
  return Buffer.from(str, 'base64');
}

module.exports = {
  getSodium,
  toBase64,
  fromBase64
};

