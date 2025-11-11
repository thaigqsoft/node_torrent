#!/usr/bin/env node
const { Command } = require('commander');
const { ensureIdentity, listIdentities } = require('../src/crypto/keyManager');
const { DEFAULTS, resolvePath } = require('../src/common/config');

const program = new Command();

program
  .description('Generate or list encryption identities')
  .option('-a, --alias <alias>', 'Alias to create or ensure')
  .option('-k, --key-store <path>', 'Key store path', DEFAULTS.keyStore)
  .option('-l, --list', 'List available identities')
  .parse(process.argv);

async function main() {
  const options = program.opts();
  const keyStorePath = resolvePath(options.keyStore);

  if (options.list) {
    const identities = listIdentities(keyStorePath);
    if (!identities.length) {
      console.log('No identities found.');
      return;
    }
    identities.forEach((identity) => {
      console.log(`${identity.alias}: ${identity.publicKey}`);
    });
    return;
  }

  if (!options.alias) {
    throw new Error('Alias is required unless listing identities');
  }

  const identity = await ensureIdentity(options.alias, keyStorePath);
  console.log(`Identity ready for alias "${identity.alias}"`);
  console.log(`Public Key: ${identity.publicKey}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  main
};

