#!/usr/bin/env node
const { Command } = require('commander');
const logger = require('../common/logger');

const program = new Command();

program
  .description('Private BitTorrent tracker for secure file transfers')
  .option('-p, --port <number>', 'Port to listen on', (value) => parseInt(value, 10), 9000)
  .option('-H, --host <host>', 'Host to bind', '0.0.0.0')
  .option('-u, --udp', 'Enable UDP tracker', false)
  .option('-w, --websocket', 'Enable WebSocket tracker', false);

async function loadTrackerServer() {
  const mod = await import('bittorrent-tracker/server');
  return mod.default || mod.Server || mod;
}

async function startTracker(cliOptions = {}) {
  const TrackerServer = await loadTrackerServer();
  const server = new TrackerServer({
    udp: !!cliOptions.udp,
    http: true,
    ws: !!cliOptions.websocket,
    stats: true
  });

  server.on('error', (error) => {
    logger.error(`Tracker error: ${error.message}`);
  });

  server.on('warning', (warning) => {
    logger.warn(`Tracker warning: ${warning.message || warning}`);
  });

  server.on('listening', () => {
    const httpAddr = server.http.address();
    logger.info(
      `Tracker listening on http://${httpAddr.address === '::' ? '0.0.0.0' : httpAddr.address}:${httpAddr.port}/announce`
    );
    if (cliOptions.udp && server.udp) {
      const udpAddr = server.udp.address();
      logger.info(`UDP tracker listening on udp://${udpAddr.address}:${udpAddr.port}`);
    }
    if (cliOptions.websocket && server.ws) {
      const wsAddr = server.ws.address();
      logger.info(`WebSocket tracker listening on ws://${wsAddr.address}:${wsAddr.port}`);
    }
  });

  function shutdown() {
    logger.info('Shutting down tracker...');
    server.close(() => {
      process.exit(0);
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  server.listen(cliOptions.port || 9000, cliOptions.host || '0.0.0.0');
  return server;
}

if (require.main === module) {
  program.parse(process.argv);
  const options = program.opts();
  startTracker(options).catch((error) => {
    logger.error(`Failed to start tracker: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  startTracker
};

