'use strict';

const git = require('./git');
const { runAudit } = require('./audit');
const { findBloat } = require('./bloat');
const { detectGhostDiffs, generateGitattributes, applyGitattributes } = require('./ghost');
const { detectLeaks } = require('./leak');
const { optimizeRepo } = require('./optimizer');
const { installGuard, uninstallGuard, checkGuardStatus } = require('./guard');
const formatter = require('./formatter');

module.exports = {
  git,
  runAudit,
  findBloat,
  detectGhostDiffs,
  generateGitattributes,
  applyGitattributes,
  detectLeaks,
  optimizeRepo,
  installGuard,
  uninstallGuard,
  checkGuardStatus,
  formatter,
};
