const { deriveSharedKey, encryptHandshakePayload, decryptHandshakePayload } = require('../../src/crypto/session');
const { generateKeyPair } = require('../../src/crypto/keyManager');
const { toBase64 } = require('../../src/common/crypto');

describe('Session crypto', () => {
  let senderKeys;
  let receiverKeys;

  beforeAll(async () => {
    senderKeys = await generateKeyPair();
    receiverKeys = await generateKeyPair();
    senderKeys.publicKey = toBase64(senderKeys.publicKey);
    senderKeys.privateKey = toBase64(senderKeys.privateKey);
    receiverKeys.publicKey = toBase64(receiverKeys.publicKey);
    receiverKeys.privateKey = toBase64(receiverKeys.privateKey);
  });

  test('shared key derivation is symmetric', async () => {
    const senderSession = await deriveSharedKey({
      ownPublicKey: senderKeys.publicKey,
      ownPrivateKey: senderKeys.privateKey,
      peerPublicKey: receiverKeys.publicKey,
      role: 'sender'
    });

    const receiverSession = await deriveSharedKey({
      ownPublicKey: receiverKeys.publicKey,
      ownPrivateKey: receiverKeys.privateKey,
      peerPublicKey: senderKeys.publicKey,
      role: 'receiver'
    });

    expect(senderSession.sharedKey.equals(receiverSession.sharedKey)).toBe(true);
    expect(senderSession.authToken).toEqual(receiverSession.authToken);
  });

  test('handshake payload encrypt/decrypt round trip', async () => {
    const shared = await deriveSharedKey({
      ownPublicKey: senderKeys.publicKey,
      ownPrivateKey: senderKeys.privateKey,
      peerPublicKey: receiverKeys.publicKey,
      role: 'sender'
    });

    const payload = {
      magnetURI: 'magnet:?xt=urn:btih:dummy',
      infoHash: 'dummyhash',
      tracker: 'http://localhost:9000/announce'
    };

    const encrypted = await encryptHandshakePayload(shared.sharedKey, payload);
    const decrypted = await decryptHandshakePayload(shared.sharedKey, encrypted);

    expect(decrypted).toEqual(payload);
  });
});

