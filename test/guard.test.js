'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { installGuard, uninstallGuard, checkGuardStatus, generatePreCommitScript } = require('../src/guard');

function createTempDir(prefix = 'repoboost-test-guard-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('guard: non-git repository handling', () => {
  const tmp = createTempDir();
  try {
    const installRes = installGuard(tmp);
    assert.equal(installRes.success, false);

    const uninstallRes = uninstallGuard(tmp);
    assert.equal(uninstallRes.success, false);

    const status = checkGuardStatus(tmp);
    assert.equal(status.installed, false);
    assert.equal(status.isGitRepo, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('guard: full install, check status, and uninstall cycle', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);

    // Initial status
    const initialStatus = checkGuardStatus(tmp);
    assert.equal(initialStatus.installed, false);
    assert.equal(initialStatus.isGitRepo, true);

    // Install guard with 10MB limit
    const installRes = installGuard(tmp, { maxSizeMb: 10 });
    assert.equal(installRes.success, true);
    assert.equal(installRes.maxSizeMb, 10);
    assert.ok(fs.existsSync(installRes.hookPath));

    const hookContent = fs.readFileSync(installRes.hookPath, 'utf8');
    assert.ok(hookContent.includes('repoboost pre-commit guard'));
    assert.ok(hookContent.includes('MAX_SIZE=10485760'));

    // Check status
    const activeStatus = checkGuardStatus(tmp);
    assert.equal(activeStatus.installed, true);

    // Uninstall guard
    const uninstallRes = uninstallGuard(tmp);
    assert.equal(uninstallRes.success, true);
    assert.equal(fs.existsSync(installRes.hookPath), false);

    // Check status after uninstall
    const finalStatus = checkGuardStatus(tmp);
    assert.equal(finalStatus.installed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('guard: script generator contains rejection logic', () => {
  const script = generatePreCommitScript(2);
  assert.ok(script.includes('MAX_SIZE=2097152'));
  assert.ok(script.includes('*.env|*.env.*|.env)'));
  assert.ok(script.includes('*.pem|*.key|*id_rsa*|*id_ed25519*)'));
});
