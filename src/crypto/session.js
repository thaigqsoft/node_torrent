const { getSodium, fromBase64, toBase64 } = require('../common/crypto');

async function deriveSharedKey({ ownPublicKey, ownPrivateKey, peerPublicKey, role = 'sender' }) {
  const sodium = await getSodium();

  const ownPublic = fromBase64(ownPublicKey);
  const ownPrivate = fromBase64(ownPrivateKey);
  const peerPublic = fromBase64(peerPublicKey);

  let sessionKeys;
  if (role === 'sender') {
    sessionKeys = sodium.crypto_kx_client_session_keys(ownPublic, ownPrivate, peerPublic);
  } else {
    sessionKeys = sodium.crypto_kx_server_session_keys(ownPublic, ownPrivate, peerPublic);
  }

  const keyParts = [Buffer.from(sessionKeys.sharedRx), Buffer.from(sessionKeys.sharedTx)].sort(Buffer.compare);
  const sharedKey = Buffer.from(sodium.crypto_generichash(32, Buffer.concat(keyParts)));

  const authToken = sodium.crypto_generichash(
    32,
    Buffer.concat([Buffer.from('tracker-auth'), Buffer.from(sharedKey)])
  );

  return {
    sharedKey,
    authToken: toBase64(authToken)
  };
}

async function encryptHandshakePayload(sharedKey, payload) {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const message = Buffer.from(JSON.stringify(payload));
  const cipher = sodium.crypto_secretbox_easy(message, nonce, sharedKey);
  return {
    nonce: toBase64(nonce),
    cipher: toBase64(cipher)
  };
}

async function decryptHandshakePayload(sharedKey, encryptedPayload) {
  const sodium = await getSodium();
  const nonce = fromBase64(encryptedPayload.nonce);
  const cipher = fromBase64(encryptedPayload.cipher);
  const message = sodium.crypto_secretbox_open_easy(cipher, nonce, sharedKey);
  if (!message) {
    throw new Error('Failed to decrypt handshake payload');
  }
  return JSON.parse(Buffer.from(message).toString('utf-8'));
}

module.exports = {
  deriveSharedKey,
  encryptHandshakePayload,
  decryptHandshakePayload
};

