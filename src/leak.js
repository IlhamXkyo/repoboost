'use strict';

const path = require('path');
const { execGit, isGitRepo, getRepoRoot } = require('./git');

const HIGH_RISK_PATTERNS = [
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$|schema$)[^/]+)?$/i,
  /\.(pem|key|p12|pfx|pkcs12)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)node_modules\//i,
  /(^|\/)__pycache__\//i,
  /\.pyc$/i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
  /\.sqlite3?$/i,
  /\.log$/i,
];

function detectLeaks(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { error: 'Not a git repository', leaks: [] };
  }

  const root = getRepoRoot(cwd);

  // 1. Find tracked files that match current .gitignore
  // -c (cached/tracked) + -i (ignored) + --exclude-standard
  const ignoredRes = execGit(['ls-files', '-c', '-i', '--exclude-standard'], root);
  const trackedIgnored = new Set();
  if (ignoredRes.success && ignoredRes.stdout) {
    ignoredRes.stdout.split('\n').map(l => l.trim()).filter(Boolean).forEach(f => trackedIgnored.add(f));
  }

  // 2. Find all tracked files to check against high-risk patterns
  const allTrackedRes = execGit(['ls-files'], root);
  const leaks = [];

  if (allTrackedRes.success && allTrackedRes.stdout) {
    const files = allTrackedRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);

    for (const file of files) {
      const normalizedPath = file.replace(/\\/g, '/');
      const isIgnored = trackedIgnored.has(file);
      let isHighRisk = false;
      let riskReason = '';

      for (const pattern of HIGH_RISK_PATTERNS) {
        if (pattern.test(normalizedPath)) {
          isHighRisk = true;
          riskReason = `Matches high-risk sensitive/artifact pattern: ${pattern.toString()}`;
          break;
        }
      }

      if (isIgnored || isHighRisk) {
        leaks.push({
          path: file,
          isIgnoredByGitignore: isIgnored,
          isHighRiskPattern: isHighRisk,
          reason: riskReason || 'File is listed in .gitignore but remains actively tracked by git',
          remediation: `git rm --cached "${file}"`,
        });
      }
    }
  }

  return {
    repoRoot: root,
    leakCount: leaks.length,
    leaks,
  };
}

module.exports = {
  detectLeaks,
  HIGH_RISK_PATTERNS,
};
