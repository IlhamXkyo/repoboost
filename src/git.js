'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function execGit(args, cwd = process.cwd(), options = {}) {
  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      ...options,
    });

    if (result.error) {
      return { success: false, stdout: '', stderr: result.error.message, code: 1 };
    }

    return {
      success: result.status === 0,
      stdout: result.stdout ? result.stdout.trim() : '',
      stderr: result.stderr ? result.stderr.trim() : '',
      code: result.status,
    };
  } catch (err) {
    return { success: false, stdout: '', stderr: err.message, code: 1 };
  }
}

function isGitRepo(cwd = process.cwd()) {
  const res = execGit(['rev-parse', '--is-inside-work-tree'], cwd);
  return res.success && res.stdout === 'true';
}

function getRepoRoot(cwd = process.cwd()) {
  const res = execGit(['rev-parse', '--show-toplevel'], cwd);
  if (!res.success) return cwd;
  try {
    return fs.realpathSync(res.stdout);
  } catch (_) {
    return res.stdout;
  }
}

function getGitDir(cwd = process.cwd()) {
  const res = execGit(['rev-parse', '--git-dir'], cwd);
  if (!res.success) return path.join(cwd, '.git');
  return path.isAbsolute(res.stdout) ? res.stdout : path.resolve(cwd, res.stdout);
}

function getBranch(cwd = process.cwd()) {
  const res = execGit(['branch', '--show-current'], cwd);
  if (res.success && res.stdout) return res.stdout;
  const headRes = execGit(['rev-parse', '--short', 'HEAD'], cwd);
  return headRes.success ? `detached@${headRes.stdout}` : 'empty';
}

function getCommitCount(cwd = process.cwd()) {
  const res = execGit(['rev-list', '--count', 'HEAD'], cwd);
  if (!res.success) return 0;
  const count = parseInt(res.stdout, 10);
  return isNaN(count) ? 0 : count;
}

function measureCommandLatency(args, cwd = process.cwd(), iterations = 3) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    execGit(args, cwd);
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ms
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return Math.round(avg * 10) / 10;
}

function getDirectorySize(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          total += stat.size;
        } catch (_) {}
      }
    }
  } catch (_) {}

  return total;
}

module.exports = {
  execGit,
  isGitRepo,
  getRepoRoot,
  getGitDir,
  getBranch,
  getCommitCount,
  measureCommandLatency,
  getDirectorySize,
};
