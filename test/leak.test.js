'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { detectLeaks } = require('../src/leak');

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
