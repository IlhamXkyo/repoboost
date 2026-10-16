'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { detectGhostDiffs, generateGitattributes, applyGitattributes } = require('../src/ghost');

function createTempDir(prefix = 'repoboost-test-ghost-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('ghost diff: non-git repository returns error', () => {
  const tmp = createTempDir();
  try {
    const res = detectGhostDiffs(tmp);
    assert.equal(res.error, 'Not a git repository');
    assert.deepEqual(res.ghostFiles, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ghost diff: clean repository returns 0 ghost files', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    fs.writeFileSync(path.join(tmp, 'file.txt'), 'line 1\nline 2\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'clean commit'], tmp);

    const res = detectGhostDiffs(tmp);
    assert.equal(res.ghostCount, 0);
    assert.equal(res.gitattributes.exists, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ghost diff: detects pure CRLF vs LF line ending difference', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);
    execGit(['config', 'core.autocrlf', 'false'], tmp);

    const filePath = path.join(tmp, 'script.js');
    fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;\n', 'utf8');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'commit with LF'], tmp);

    // Overwrite exact same text with CRLF line endings
    fs.writeFileSync(filePath, 'const a = 1;\r\nconst b = 2;\r\n', 'utf8');

    const res = detectGhostDiffs(tmp);
    assert.equal(res.ghostCount, 1);
    assert.equal(res.ghostFiles[0].path, 'script.js');
    assert.equal(res.ghostFiles[0].type, 'PURE_EOL_GHOST');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('gitattributes: generates and applies text=auto', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);

    const template = generateGitattributes();
    assert.ok(template.includes('* text=auto eol=lf'));
    assert.ok(template.includes('*.png binary'));

    // Apply
    const applyRes = applyGitattributes(tmp);
    assert.equal(applyRes.success, true);
    assert.ok(fs.existsSync(path.join(tmp, '.gitattributes')));

    // Re-check ghost status reflects configuredProperly
    const status = detectGhostDiffs(tmp);
    assert.equal(status.gitattributes.exists, true);
    assert.equal(status.gitattributes.configuredProperly, true);

    // Second apply should report already configured
    const reapplyRes = applyGitattributes(tmp);
    assert.equal(reapplyRes.success, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
