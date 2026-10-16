'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { runAudit } = require('../src/audit');

function createTempDir(prefix = 'repoboost-test-audit-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return fs.realpathSync.native ? fs.realpathSync.native(dir) : fs.realpathSync(dir);
}

test('audit: non-git repository handling', () => {
  const tmp = createTempDir();
  try {
    const res = runAudit(tmp);
    assert.equal(res.error, 'Not a git repository');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit: clean repository scores high and reports full telemetry', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.writeFileSync(path.join(tmp, 'index.js'), 'console.log("hello");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'initial commit'], tmp);

    const res = runAudit(tmp);
    assert.ok(res.healthScore >= 80);
    assert.equal(res.commitCount, 1);
    assert.equal(res.branch, 'main');
    assert.ok(res.diskUsage.totalGitSize > 0);
    assert.ok(Array.isArray(res.recommendations));
    assert.equal(typeof res.telemetry.statusLatencyMs, 'number');
    assert.equal(typeof res.telemetry.logLatencyMs, 'number');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit: deductions trigger on detected bottlenecks', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    // Track a secret .env file and commit it
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=abc\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'commit secret'], tmp);

    // Now add .env to .gitignore so it becomes a tracked ignore leak
    fs.writeFileSync(path.join(tmp, '.gitignore'), '.env\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'add gitignore'], tmp);

    const res = runAudit(tmp);
    assert.ok(res.leakSummary.leakCount > 0);
    assert.ok(res.deductions.some(d => d.includes('tracked file')));
    assert.ok(res.recommendations.some(r => r.includes('repoboost leak')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
