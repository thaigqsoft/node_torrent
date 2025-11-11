#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const WebTorrent = require('webtorrent');
const { pipeline } = require('stream/promises');
const ora = require('ora');
const { createEncryptStream } = require('../crypto/secretStream');
const { ensureIdentity } = require('../crypto/keyManager');
const { deriveSharedKey, encryptHandshakePayload } = require('../crypto/session');
const { DEFAULTS, ensureDir, resolvePath } = require('../common/config');
const { createProgressBar, bytesToMegabytes } = require('../common/progress');
const logger = require('../common/logger');

const program = new Command();

program
  .description('Secure BitTorrent sender CLI')
  .requiredOption('-f, --file <path>', 'File to send')
  .option('-a, --alias <alias>', 'Alias for sender identity', 'sender')
  .requiredOption('-r, --recipient-key <base64>', 'Recipient public key (base64)')
  .option('-k, --key-store <path>', 'Key store path', DEFAULTS.keyStore)
  .option('-t, --tracker <url>', 'Tracker announce URL', DEFAULTS.tracker)
  .option('-o, --handshake-out <path>', 'Output handshake file', path.join(DEFAULTS.handshakeDir, 'handshake.json'))
  .option('--temp-dir <path>', 'Temporary directory for encrypted payload', DEFAULTS.tempDir)
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const filePath = resolvePath(options.file);
  const keyStorePath = resolvePath(options.keyStore);
  const tempDir = resolvePath(options.tempDir);
  const handshakePath =
    program.getOptionValueSource('handshakeOut') === 'default'
      ? resolvePath(path.join(DEFAULTS.handshakeDir, `handshake-${Date.now()}.json`))
      : resolvePath(options.handshakeOut);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const spinner = ora('Preparing secure transfer').start();

  try {
    ensureDir(path.dirname(handshakePath));
    ensureDir(tempDir);

    const identity = await ensureIdentity(options.alias, keyStorePath);

    spinner.text = 'Deriving shared session key';
    const { sharedKey, authToken } = await deriveSharedKey({
      ownPublicKey: identity.publicKey,
      ownPrivateKey: identity.privateKey,
      peerPublicKey: options.recipientKey,
      role: 'sender'
    });

    spinner.text = 'Encrypting file locally';
    const { header, encryptedPath } = await encryptFile(filePath, tempDir, sharedKey);

    spinner.text = 'Starting seeding session';
    await seedEncryptedFile({
      encryptedPath,
      originalFilePath: filePath,
      trackerUrl: options.tracker,
      sharedKey,
      handshakePath,
      identity,
      recipientKey: options.recipientKey,
      header,
      authToken
    });

    spinner.succeed('Sender is ready. Share the handshake file with the receiver securely.');
  } catch (error) {
    spinner.fail(error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

async function encryptFile(filePath, tempDir, sharedKey) {
  const fileName = path.basename(filePath);
  const encryptedFileName = `${fileName}.${Date.now()}.enc`;
  const encryptedPath = path.join(tempDir, encryptedFileName);

  const readStream = fs.createReadStream(filePath);
  const writeStream = fs.createWriteStream(encryptedPath);
  const { stream: encryptStream, header } = await createEncryptStream(sharedKey);

  await pipeline(readStream, encryptStream, writeStream);

  return { encryptedPath, header };
}

async function seedEncryptedFile({
  encryptedPath,
  originalFilePath,
  trackerUrl,
  sharedKey,
  handshakePath,
  identity,
  recipientKey,
  header,
  authToken
}) {
  const client = new WebTorrent({ dht: false });
  const progressBar = createProgressBar();

  return new Promise((resolve, reject) => {
    client.seed(
      encryptedPath,
      {
        announce: [trackerUrl],
        private: true
      },
      async (torrent) => {
        logger.info(`Seeding encrypted torrent with infoHash: ${torrent.infoHash}`);

        const totalMB = parseFloat(bytesToMegabytes(torrent.length));
        progressBar.start(totalMB, 0, { speed: 0 });

        const interval = setInterval(() => {
          progressBar.update(totalMB * torrent.progress, {
            speed: bytesToMegabytes(torrent.uploadSpeed)
          });
        }, 1000);

        torrent.on('wire', (wire) => {
          logger.info(`Connected to peer ${wire.remoteAddress || wire.peerId}`);
        });

        torrent.on('error', (error) => {
          clearInterval(interval);
          progressBar.stop();
          client.destroy();
          reject(error);
        });

        process.on('SIGINT', () => {
          clearInterval(interval);
          progressBar.stop();
          client.destroy(() => process.exit(0));
        });

        const payload = {
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          torrentName: torrent.name,
          encryptedHeader: header,
          tracker: trackerUrl,
          authToken,
          originalFileName: path.basename(originalFilePath),
          fileSize: torrent.length,
          createdAt: new Date().toISOString()
        };

        const encryptedPayload = await encryptHandshakePayload(sharedKey, payload);

        const handshake = {
          version: 1,
          senderAlias: identity.alias,
          senderPublicKey: identity.publicKey,
          receiverPublicKey: recipientKey,
          encryptedPayload
        };

        await fse.writeJson(handshakePath, handshake, { spaces: 2, mode: 0o600 });

        logger.info(`Handshake file written to ${handshakePath}`);
        resolve();
      }
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};

