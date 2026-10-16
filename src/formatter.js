'use strict';

const isColorSupported = !process.env.NO_COLOR &&
  (process.stdout.isTTY || process.env.FORCE_COLOR !== undefined);

const colors = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',
  white: isColorSupported ? '\x1b[37m' : '',
  bgCyan: isColorSupported ? '\x1b[46m\x1b[30m' : '',
  bgRed: isColorSupported ? '\x1b[41m\x1b[37m' : '',
  bgGreen: isColorSupported ? '\x1b[42m\x1b[30m' : '',
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2);
  return `${val} ${units[i]}`;
}

function colorScore(score) {
  if (score >= 85) return `${colors.green}${colors.bold}${score}/100${colors.reset}`;
  if (score >= 60) return `${colors.yellow}${colors.bold}${score}/100${colors.reset}`;
  return `${colors.red}${colors.bold}${score}/100${colors.reset}`;
}

function renderBanner() {
  return `${colors.cyan}${colors.bold}
  ___ ___ ___  ___  ___  ___   ___  ___ _____ 
 | _ \\ __| _ \\/ _ \\| _ )/ _ \\ / _ \\/ __|_   _|
 |   / _||  _/ (_) | _ \\ (_) | (_) \\__ \\ | |  
 |_|_\\___|_|  \\___/|___/\\___/ \\___/|___/ |_|  
${colors.gray} Zero-dependency Git Velocity & Bloat Purifier${colors.reset}\n`;
}

module.exports = {
  colors,
  formatBytes,
  colorScore,
  renderBanner,
};
