'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  execGit,
  isGitRepo,
  getRepoRoot,
  getGitDir,
  getBranch,
  getCommitCount,
  measureCommandLatency,
  getDirectorySize,
} = require('../src/git');

function createTempDir(prefix = 'repoboost-test-git-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return fs.realpathSync.native ? fs.realpathSync.native(dir) : fs.realpathSync(dir);
}

test('git helpers: non-git directory detection', () => {
  const tmp = createTempDir();
  try {
    assert.equal(isGitRepo(tmp), false);
    const count = getCommitCount(tmp);
    assert.equal(count, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('git helpers: initialized repo lifecycle', () => {
  const tmp = createTempDir();
  try {
    // Init git repo
    const initRes = execGit(['init', '-b', 'main'], tmp);
    assert.equal(initRes.success, true);
    assert.equal(isGitRepo(tmp), true);

    // Initial empty state
    const root = getRepoRoot(tmp);
    assert.equal(fs.realpathSync(root), fs.realpathSync(tmp));

    const gitDir = getGitDir(tmp);
    assert.equal(fs.existsSync(gitDir), true);

    const initialCommits = getCommitCount(tmp);
    assert.equal(initialCommits, 0);

    // Write a file and commit
    fs.writeFileSync(path.join(tmp, 'sample.txt'), 'hello repoboost\n');
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);
    execGit(['add', '.'], tmp);
    const commitRes = execGit(['commit', '-m', 'initial commit'], tmp);
    assert.equal(commitRes.success, true);

    // Check branch and commit count
    const branch = getBranch(tmp);
    assert.equal(branch, 'main');

    const commits = getCommitCount(tmp);
    assert.equal(commits, 1);

    // Measure command latency
    const latency = measureCommandLatency(['status'], tmp, 2);
    assert.equal(typeof latency, 'number');
    assert.ok(latency >= 0);

    // Directory size
    const dirSize = getDirectorySize(gitDir);
    assert.ok(dirSize > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('git helpers: bare repository detection', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '--bare'], tmp);
    assert.equal(isGitRepo(tmp), true);
    const gitDir = getGitDir(tmp);
    assert.ok(gitDir.length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
