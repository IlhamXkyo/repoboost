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

test('guard: script generator contains rejection logic and space handling', () => {
  const script = generatePreCommitScript(2);
  assert.ok(script.includes('MAX_SIZE=2097152'));
  assert.ok(script.includes('*.env.example|*.env.sample|*.env.template|*.env.dist|*.env.schema)'));
  assert.ok(script.includes('*.env|*.env.*|.env|*/.env|*/.env.*)'));
  assert.ok(script.includes('while IFS= read -r FILE'));
});

test('guard: active hook blocks oversized files with spaces and secret envs, but permits examples', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    // Install guard with 1MB threshold
    installGuard(tmp, { maxSizeMb: 1 });

    // 1. Staged .env.example must be allowed
    fs.writeFileSync(path.join(tmp, '.env.example'), 'PORT=3000\n');
    execGit(['add', '.env.example'], tmp);
    const exampleCommit = execGit(['commit', '-m', 'allow env example'], tmp);
    assert.equal(exampleCommit.success, true, 'Committing .env.example should succeed');

    // 2. Oversized binary with spaces in filename must be blocked
    const bigFile = path.join(tmp, 'large video archive with spaces.bin');
    fs.writeFileSync(bigFile, Buffer.alloc(2 * 1024 * 1024, 0x42));
    execGit(['add', 'large video archive with spaces.bin'], tmp);
    const bigCommit = execGit(['commit', '-m', 'should fail on large binary with spaces'], tmp);
    assert.equal(bigCommit.success, false, 'Large binary with spaces should be blocked by guard');
    assert.ok(bigCommit.stderr.includes('REJECTED') || bigCommit.stdout.includes('REJECTED'));

    // Unstage the big file
    execGit(['reset', 'HEAD', 'large video archive with spaces.bin'], tmp);
    fs.unlinkSync(bigFile);

    // 3. Staging actual .env must be blocked
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=supersecret\n');
    execGit(['add', '.env'], tmp);
    const secretCommit = execGit(['commit', '-m', 'should fail on secret .env'], tmp);
    assert.equal(secretCommit.success, false, 'Actual .env should be blocked by guard');
    assert.ok(secretCommit.stderr.includes('REJECTED') || secretCommit.stdout.includes('REJECTED'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
