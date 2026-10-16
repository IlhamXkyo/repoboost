'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { optimizeRepo } = require('../src/optimizer');

function createTempDir(prefix = 'repoboost-test-opt-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return fs.realpathSync.native ? fs.realpathSync.native(dir) : fs.realpathSync(dir);
}

test('optimizer: non-git repository handling', () => {
  const tmp = createTempDir();
  try {
    const res = optimizeRepo(tmp);
    assert.equal(res.error, 'Not a git repository');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('optimizer: dry-run mode returns planned actions without modifying', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.writeFileSync(path.join(tmp, 'app.js'), 'console.log("running");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'commit app'], tmp);

    const dryRes = optimizeRepo(tmp, { dryRun: true });
    assert.equal(dryRes.dryRun, true);
    assert.ok(dryRes.plannedActions.length >= 4);
    assert.ok(dryRes.sizeBefore > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('optimizer: live execution packs refs and runs garbage collection', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(tmp, `file_${i}.txt`), `content ${i}\n`);
      execGit(['add', '.'], tmp);
      execGit(['commit', '-m', `commit ${i}`], tmp);
    }

    const res = optimizeRepo(tmp);
    assert.equal(res.dryRun, false);
    assert.ok(res.sizeBefore > 0);
    assert.ok(res.sizeAfter > 0);
    assert.equal(typeof res.bytesSaved, 'number');
    assert.equal(typeof res.latencyBeforeMs, 'number');
    assert.equal(typeof res.latencyAfterMs, 'number');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('optimizer: bare repository optimization executes cleanly', () => {
  const tmp = createTempDir();
  try {
    const normalDir = path.join(tmp, 'normal');
    const bareDir = path.join(tmp, 'bare.git');
    fs.mkdirSync(normalDir);

    execGit(['init', '-b', 'main'], normalDir);
    execGit(['config', 'user.email', 'test@example.com'], normalDir);
    execGit(['config', 'user.name', 'Test User'], normalDir);

    fs.writeFileSync(path.join(normalDir, 'file.txt'), 'content\n');
    execGit(['add', '.'], normalDir);
    execGit(['commit', '-m', 'commit'], normalDir);

    execGit(['clone', '--bare', normalDir, bareDir]);

    const res = optimizeRepo(bareDir);
    assert.equal(res.error, undefined);
    assert.equal(res.isBare, true);
    assert.equal(res.dryRun, false);
    assert.ok(res.sizeBefore > 0);
    assert.ok(res.sizeAfter > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
