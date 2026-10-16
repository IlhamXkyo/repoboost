'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit } = require('../src/git');
const { findBloat } = require('../src/bloat');

function createTempDir(prefix = 'repoboost-test-bloat-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('bloat detection: non-git repository returns error', () => {
  const tmp = createTempDir();
  try {
    const res = findBloat(tmp);
    assert.equal(res.error, 'Not a git repository');
    assert.deepEqual(res.items, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bloat detection: catches active and dead history blobs', () => {
  const tmp = createTempDir();
  try {
    execGit(['init', '-b', 'main'], tmp);
    execGit(['config', 'user.email', 'test@example.com'], tmp);
    execGit(['config', 'user.name', 'Test User'], tmp);

    // Commit 1: Small regular file
    fs.writeFileSync(path.join(tmp, 'index.js'), 'console.log("hello");\n');
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'add index.js'], tmp);

    // Commit 2: Add a 200KB mock binary blob
    const largeBuffer = Buffer.alloc(200 * 1024, 'A');
    fs.writeFileSync(path.join(tmp, 'legacy_bundle.bin'), largeBuffer);
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'add heavy legacy bundle'], tmp);

    // Commit 3: Delete legacy_bundle.bin in HEAD (becomes dead history!)
    fs.unlinkSync(path.join(tmp, 'legacy_bundle.bin'));
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'remove legacy bundle from HEAD'], tmp);

    // Commit 4: Add active heavy image in HEAD
    const activeBuffer = Buffer.alloc(100 * 1024, 'B');
    fs.writeFileSync(path.join(tmp, 'hero.png'), activeBuffer);
    execGit(['add', '.'], tmp);
    execGit(['commit', '-m', 'add active hero image'], tmp);

    // Run findBloat
    const res = findBloat(tmp, { top: 10 });
    assert.ok(res.totalScannedBlobs >= 3);
    assert.ok(res.items.length >= 2);

    // First item should be the 200KB dead history blob
    const deadBlob = res.items.find(i => i.path.includes('legacy_bundle.bin'));
    assert.ok(deadBlob, 'legacy_bundle.bin should be detected in history');
    assert.equal(deadBlob.status, 'DEAD_HISTORY');
    assert.equal(deadBlob.inHead, false);
    assert.ok(deadBlob.size >= 200000);

    // Second item should be the active hero.png
    const activeBlob = res.items.find(i => i.path.includes('hero.png'));
    assert.ok(activeBlob, 'hero.png should be detected');
    assert.equal(activeBlob.status, 'ACTIVE_HEAD');
    assert.equal(activeBlob.inHead, true);
    assert.ok(activeBlob.size >= 100000);

    // Verify deadHistorySize calculation
    assert.ok(res.deadHistorySize >= 200000);
    assert.ok(res.totalTrackedSize >= 100000);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
