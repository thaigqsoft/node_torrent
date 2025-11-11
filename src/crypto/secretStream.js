const { Transform } = require('stream');
const { getSodium, toBase64, fromBase64 } = require('../common/crypto');

async function createEncryptStream(sharedKey) {
  const sodium = await getSodium();

  const state = sodium.crypto_secretstream_xchacha20poly1305_state_new();
  const header = sodium.crypto_secretstream_xchacha20poly1305_init_push(state, sharedKey);

  const stream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const cipherChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
          state,
          chunk,
          null,
          sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE
        );
        callback(null, Buffer.from(cipherChunk));
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        const finalChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
          state,
          Buffer.alloc(0),
          null,
          sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        );
        if (finalChunk && finalChunk.length) {
          this.push(Buffer.from(finalChunk));
        }
        callback();
      } catch (error) {
        callback(error);
      }
    }
  });

  return {
    stream,
    header: toBase64(header)
  };
}

async function createDecryptStream(sharedKey, headerB64) {
  const sodium = await getSodium();
  const state = sodium.crypto_secretstream_xchacha20poly1305_state_new();
  const header = fromBase64(headerB64);

  sodium.crypto_secretstream_xchacha20poly1305_init_pull(state, header, sharedKey);

  const stream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, chunk);
        if (!result) {
          callback(new Error('Failed to decrypt chunk'));
          return;
        }
        const { message, tag } = result;
        if (tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
          this.push(Buffer.from(message));
          callback();
        } else {
          callback(null, Buffer.from(message));
        }
      } catch (error) {
        callback(error);
      }
    }
  });

  return {
    stream
  };
}

module.exports = {
  createEncryptStream,
  createDecryptStream
};

