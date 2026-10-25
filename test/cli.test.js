'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { execGit } = require('../src/git');

const CLI_PATH = path.resolve(__dirname, '../bin/repoboost.js');

function createTempDir(prefix = 'repoboost-test-cli-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('cli: --help and --version', () => {
  const helpRes = runCli(['--help'], process.cwd());
  assert.equal(helpRes.status, 0);
  assert.ok(helpRes.stdout.includes('Zero-dependency Git Velocity & Bloat Purifier'));
  assert.ok(helpRes.stdout.includes('COMMANDS:'));

  const verRes = runCli(['--version'], process.cwd());
  assert.equal(verRes.status, 0);
  assert.ok(verRes.stdout.includes('repoboost v0.2.0'));
});

test('cli: error on non-git directory', () => {
  const tmp = createTempDir();
  try {
    const res = runCli(['audit', tmp], tmp);
    assert.equal(res.status, 1);
    assert.ok(res.stderr.includes('Not a git repository'));

    const jsonRes = runCli(['audit', tmp, '--json'], tmp);
    assert.equal(jsonRes.status, 1);
    const parsed = JSON.parse(jsonRes.stdout);
    assert.equal(parsed.error, 'Not a git repository');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli: full suite of commands on initialized git repo', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.writeFileSync(path.join(tmp, 'sample.js'), 'console.log("hello");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'initial test commit'], tmp);

    // 1. Audit command (human output)
    const auditRes = runCli(['audit', tmp], tmp);
    assert.equal(auditRes.status, 0);
    assert.ok(auditRes.stdout.includes('REPOSITORY AUDIT TELEMETRY'));
    assert.ok(auditRes.stdout.includes('HEALTH & VELOCITY SCORE'));

    // 2. Audit command (--json)
    const auditJson = runCli(['audit', tmp, '--json'], tmp);
    assert.equal(auditJson.status, 0);
    const auditData = JSON.parse(auditJson.stdout);
    assert.equal(typeof auditData.healthScore, 'number');
    assert.ok(auditData.healthScore >= 0 && auditData.healthScore <= 100);
    assert.equal(auditData.commitCount, 1);
    assert.equal(auditData.branch, 'main');

    // 3. Bloat command (--json)
    const bloatJson = runCli(['bloat', tmp, '--json'], tmp);
    assert.equal(bloatJson.status, 0);
    const bloatData = JSON.parse(bloatJson.stdout);
    assert.ok(Array.isArray(bloatData.items));

    // 4. Ghost command (--json)
    const ghostJson = runCli(['ghost', tmp, '--json'], tmp);
    assert.equal(ghostJson.status, 0);
    const ghostData = JSON.parse(ghostJson.stdout);
    assert.equal(ghostData.ghostCount, 0);

    // 5. Leak command (--json)
    const leakJson = runCli(['leak', tmp, '--json'], tmp);
    assert.equal(leakJson.status, 0);
    const leakData = JSON.parse(leakJson.stdout);
    assert.equal(leakData.leakCount, 0);

    // 6. Optimize command (--dry-run --json)
    const optJson = runCli(['optimize', tmp, '--dry-run', '--json'], tmp);
    assert.equal(optJson.status, 0);
    const optData = JSON.parse(optJson.stdout);
    assert.equal(optData.dryRun, true);
    assert.ok(optData.plannedActions.length > 0);

    // 7. Guard command (--install and --uninstall)
    const guardInstallRes = runCli(['guard', tmp, '--install', '--json'], tmp);
    assert.equal(guardInstallRes.status, 0);
    const guardInstallData = JSON.parse(guardInstallRes.stdout);
    assert.equal(guardInstallData.success, true);

    const guardStatusRes = runCli(['guard', tmp, '--json'], tmp);
    assert.equal(guardStatusRes.status, 0);
    const guardStatusData = JSON.parse(guardStatusRes.stdout);
    assert.equal(guardStatusData.installed, true);

    const guardUninstallRes = runCli(['guard', tmp, '--uninstall', '--json'], tmp);
    assert.equal(guardUninstallRes.status, 0);
    const guardUninstallData = JSON.parse(guardUninstallRes.stdout);
    assert.equal(guardUninstallData.success, true);

    // 8. CI Quality Gate: --fail-under passing
    const passGateRes = runCli(['audit', tmp, '--fail-under', '50'], tmp);
    assert.equal(passGateRes.status, 0);

    // 9. CI Quality Gate: --fail-under failing
    const failGateRes = runCli(['audit', tmp, '--fail-under', '101'], tmp);
    assert.equal(failGateRes.status, 1);
    assert.ok(failGateRes.stderr.includes('[Quality Gate Failed]'));

    // 10. Leak remediation via CLI: leak --fix
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=val\n');
    execGit(['add', '.env'], tmp);
    execGit(['commit', '-m', 'add secret'], tmp);

    const leakFixJson = runCli(['leak', tmp, '--fix', '--json'], tmp);
    assert.equal(leakFixJson.status, 0);
    const leakFixData = JSON.parse(leakFixJson.stdout);
    assert.equal(leakFixData.fixedCount, 1);
    assert.ok(leakFixData.removedFiles.includes('.env'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
