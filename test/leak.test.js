'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { detectLeaks, fixLeaks } = require('../src/leak');

function createTempDir(prefix = 'repoboost-test-leak-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('leak detection: non-git repository returns error', () => {
  const tmp = createTempDir();
  try {
    const res = detectLeaks(tmp);
    assert.equal(res.error, 'Not a git repository');
    assert.deepEqual(res.leaks, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak detection: catches files in .gitignore that remain tracked in git', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    // Track a secret .env and a debug log
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET_KEY=12345\n');
    fs.writeFileSync(path.join(tmp, 'debug.log'), 'some log data\n');
    fs.writeFileSync(path.join(tmp, 'clean.js'), 'console.log("ok");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'accidentally track sensitive files'], tmp);

    // Now user adds them to .gitignore, thinking git will stop tracking them
    fs.writeFileSync(path.join(tmp, '.gitignore'), '.env\n*.log\n');
    execGit(['add', '.gitignore'], tmp);
    execGit(['commit', '-m', 'add gitignore'], tmp);

    const res = detectLeaks(tmp);
    assert.equal(res.leakCount, 2);

    const envLeak = res.leaks.find(l => l.path === '.env');
    assert.ok(envLeak, '.env should be detected');
    assert.equal(envLeak.isIgnoredByGitignore, true);
    assert.equal(envLeak.isHighRiskPattern, true);
    assert.equal(envLeak.remediation, 'git rm --cached ".env"');

    const logLeak = res.leaks.find(l => l.path === 'debug.log');
    assert.ok(logLeak, 'debug.log should be detected');
    assert.equal(logLeak.isIgnoredByGitignore, true);
    assert.equal(logLeak.remediation, 'git rm --cached "debug.log"');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak detection: catches nested secret envs while permitting example templates', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.mkdirSync(path.join(tmp, 'packages', 'backend'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'packages', 'backend', '.env'), 'DB_PASS=xyz\n');
    fs.writeFileSync(path.join(tmp, 'packages', 'backend', '.env.local'), 'LOCAL=true\n');
    fs.writeFileSync(path.join(tmp, '.env.example'), 'PORT=3000\n');
    fs.writeFileSync(path.join(tmp, 'packages', 'backend', '.env.sample'), 'DB_PASS=sample\n');

    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'add various env files'], tmp);

    const res = detectLeaks(tmp);
    const paths = res.leaks.map(l => l.path);

    assert.ok(paths.includes('packages/backend/.env'), 'Nested .env should be detected as high risk');
    assert.ok(paths.includes('packages/backend/.env.local'), 'Nested .env.local should be detected as high risk');
    assert.equal(paths.includes('.env.example'), false, '.env.example should not be flagged as a secret leak');
    assert.equal(paths.includes('packages/backend/.env.sample'), false, '.env.sample should not be flagged as a secret leak');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak remediation: fixLeaks untracks leaked files while preserving on disk', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=foo\n');
    fs.writeFileSync(path.join(tmp, 'credentials.json'), '{"key":"secret"}\n');
    fs.writeFileSync(path.join(tmp, 'app.js'), 'console.log("ok");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'commit files'], tmp);

    const initialLeaks = detectLeaks(tmp);
    assert.equal(initialLeaks.leakCount, 2);

    const fixResult = fixLeaks(tmp);
    assert.equal(fixResult.success, true);
    assert.equal(fixResult.fixedCount, 2);
    assert.ok(fixResult.removedFiles.includes('.env'));
    assert.ok(fixResult.removedFiles.includes('credentials.json'));

    // Check files are still present on disk
    assert.ok(fs.existsSync(path.join(tmp, '.env')), '.env must remain on disk');
    assert.ok(fs.existsSync(path.join(tmp, 'credentials.json')), 'credentials.json must remain on disk');

    // Check files are now untracked in git status
    const statusRes = execGit(['status', '--porcelain'], tmp);
    assert.ok(statusRes.stdout.includes('D  .env'));
    assert.ok(statusRes.stdout.includes('D  credentials.json'));

    // After committing the unstaging, leaks should be 0
    execGit(['commit', '-m', 'chore: fix leaks'], tmp);
    const afterLeaks = detectLeaks(tmp);
    assert.equal(afterLeaks.leakCount, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
