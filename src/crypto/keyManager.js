const fs = require('fs');
const path = require('path');
const { getSodium, toBase64 } = require('../common/crypto');
const { ensureDir } = require('../common/config');

async function generateKeyPair() {
  const sodium = await getSodium();
  return sodium.crypto_kx_keypair();
}

function readKeyStore(storePath) {
  if (!fs.existsSync(storePath)) {
    return { identities: {} };
  }
  const raw = fs.readFileSync(storePath, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    throw new Error(`Invalid key store format at ${storePath}: ${error.message}`);
  }
}

function writeKeyStore(storePath, data) {
  ensureDir(path.dirname(storePath));
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

async function ensureIdentity(alias, storePath) {
  if (!alias) {
    throw new Error('Alias is required');
  }
  const store = readKeyStore(storePath);
  if (store.identities[alias]) {
    return store.identities[alias];
  }

  const keypair = await generateKeyPair();
  const identity = {
    alias,
    publicKey: toBase64(keypair.publicKey),
    privateKey: toBase64(keypair.privateKey),
    createdAt: new Date().toISOString()
  };
  store.identities[alias] = identity;
  writeKeyStore(storePath, store);
  return identity;
}

function getIdentity(alias, storePath) {
  const store = readKeyStore(storePath);
  const identity = store.identities[alias];
  if (!identity) {
    throw new Error(`Identity "${alias}" not found in key store`);
  }
  return identity;
}

function listIdentities(storePath) {
  const store = readKeyStore(storePath);
  return Object.values(store.identities);
}

module.exports = {
  generateKeyPair,
  readKeyStore,
  writeKeyStore,
  ensureIdentity,
  getIdentity,
  listIdentities
};

