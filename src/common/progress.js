const cliProgress = require('cli-progress');
const chalk = require('chalk');

function createProgressBar(options = {}) {
  const bar = new cliProgress.SingleBar(
    {
      format: `${chalk.cyan('{bar}')} {percentage}% | {value}/{total} MB | Speed: {speed} MB/s | ETA: {eta_formatted}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      ...options
    },
    cliProgress.Presets.shades_classic
  );
  return bar;
}

function bytesToMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

module.exports = {
  createProgressBar,
  bytesToMegabytes
};

