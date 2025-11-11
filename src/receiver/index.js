#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const WebTorrent = require('webtorrent');
const { pipeline } = require('stream/promises');
const ora = require('ora');
const { ensureIdentity } = require('../crypto/keyManager');
const { deriveSharedKey, decryptHandshakePayload } = require('../crypto/session');
const { createDecryptStream } = require('../crypto/secretStream');
const { DEFAULTS, ensureDir, resolvePath } = require('../common/config');
const { createProgressBar, bytesToMegabytes } = require('../common/progress');
const logger = require('../common/logger');

const program = new Command();

program
  .description('Secure BitTorrent receiver CLI')
  .requiredOption('-h, --handshake <path>', 'Handshake file provided by sender')
  .option('-a, --alias <alias>', 'Alias for receiver identity', 'receiver')
  .option('-s, --save <path>', 'Directory to store decrypted file', path.join(process.cwd(), 'downloads'))
  .option('-k, --key-store <path>', 'Key store path', DEFAULTS.keyStore)
  .option('--temp-dir <path>', 'Temporary directory for encrypted payload', DEFAULTS.tempDir)
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const handshakePath = resolvePath(options.handshake);
  const keyStorePath = resolvePath(options.keyStore);
  const saveDir = resolvePath(options.save);
  const tempDir = resolvePath(options.tempDir);

  if (!fs.existsSync(handshakePath)) {
    throw new Error(`Handshake file not found: ${handshakePath}`);
  }

  ensureDir(saveDir);
  ensureDir(tempDir);

  const spinner = ora('Verifying handshake').start();

  try {
    const handshake = await fse.readJson(handshakePath);
    const identity = await ensureIdentity(options.alias, keyStorePath);

    if (handshake.receiverPublicKey !== identity.publicKey) {
      throw new Error('Handshake is not intended for this receiver (public key mismatch)');
    }

    const { sharedKey } = await deriveSharedKey({
      ownPublicKey: identity.publicKey,
      ownPrivateKey: identity.privateKey,
      peerPublicKey: handshake.senderPublicKey,
      role: 'receiver'
    });

    spinner.text = 'Decrypting handshake payload';
    const payload = await decryptHandshakePayload(sharedKey, handshake.encryptedPayload);

    spinner.text = 'Connecting to torrent';
    await downloadAndDecrypt({
      payload,
      identity,
      saveDir,
      tempDir,
      sharedKey
    });

    spinner.succeed('File received and decrypted successfully');
  } catch (error) {
    spinner.fail(error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

async function downloadAndDecrypt({ payload, saveDir, tempDir, sharedKey }) {
  return new Promise((resolve, reject) => {
    const client = new WebTorrent({ dht: false });
    const progressBar = createProgressBar();

    client.add(
      payload.magnetURI,
      {
        path: tempDir
      },
      async (torrent) => {
        logger.info(`Connected to torrent ${torrent.infoHash}`);

        const totalMB = parseFloat(bytesToMegabytes(torrent.length));
        progressBar.start(totalMB, 0, { speed: 0 });

        const interval = setInterval(() => {
          progressBar.update(totalMB * torrent.progress, {
            speed: bytesToMegabytes(torrent.downloadSpeed)
          });
        }, 1000);

        torrent.on('done', async () => {
          clearInterval(interval);
          progressBar.stop();
          try {
            const encryptedFilePath = path.join(torrent.path, torrent.files[0].path);
            const destinationPath = path.join(saveDir, payload.originalFileName);
            const readStream = fs.createReadStream(encryptedFilePath);
            const { stream: decryptStream } = await createDecryptStream(sharedKey, payload.encryptedHeader);
            const writeStream = fs.createWriteStream(destinationPath);
            await pipeline(readStream, decryptStream, writeStream);
            logger.info(`Decrypted file saved to ${destinationPath}`);
            await fse.remove(encryptedFilePath);
            client.destroy();
            resolve();
          } catch (error) {
            client.destroy();
            reject(error);
          }
        });

        torrent.on('error', (error) => {
          clearInterval(interval);
          progressBar.stop();
          client.destroy();
          reject(error);
        });
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

