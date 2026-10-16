'use strict';

const { spawnSync } = require('child_process');
const { execGit, isGitRepo } = require('./git');
const { formatBytes, colors } = require('./formatter');

function findBloat(cwd = process.cwd(), options = {}) {
  const top = options.top || 15;
  const thresholdBytes = (options.thresholdMb || 0) * 1024 * 1024;

  if (!isGitRepo(cwd)) {
    return { error: 'Not a git repository', items: [] };
  }

  // 1. Get all objects with their associated path
  const revListRes = execGit(['rev-list', '--objects', '--all'], cwd);
  if (!revListRes.success || !revListRes.stdout) {
    return { items: [], totalTrackedSize: 0, deadHistorySize: 0 };
  }

  const lines = revListRes.stdout.split('\n');
  const pathByHash = new Map();
  const hashes = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      const hash = trimmed;
      hashes.push(hash);
      pathByHash.set(hash, '');
    } else {
      const hash = trimmed.slice(0, spaceIdx);
      const filePath = trimmed.slice(spaceIdx + 1).trim();
      hashes.push(hash);
      pathByHash.set(hash, filePath);
    }
  }

  if (hashes.length === 0) {
    return { items: [], totalTrackedSize: 0, deadHistorySize: 0 };
  }

  // 2. Query object types and sizes in bulk via git cat-file
  const catFileProcess = spawnSync(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      cwd,
      input: hashes.join('\n'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  if (catFileProcess.error || !catFileProcess.stdout) {
    return { items: [], totalTrackedSize: 0, deadHistorySize: 0 };
  }

  // 3. Get current HEAD files to detect active vs dead history
  const headObjects = new Set();
  const lsTreeRes = execGit(['ls-tree', '-r', 'HEAD'], cwd);
  if (lsTreeRes.success && lsTreeRes.stdout) {
    const treeLines = lsTreeRes.stdout.split('\n');
    for (const treeLine of treeLines) {
      const parts = treeLine.trim().split(/\s+/);
      if (parts.length >= 3) {
        headObjects.add(parts[2]); // The object SHA
      }
    }
  }

  // 4. Parse batch output
  const outputLines = catFileProcess.stdout.split('\n');
  const blobs = [];
  let totalTrackedSize = 0;
  let deadHistorySize = 0;

  for (const outLine of outputLines) {
    const parts = outLine.trim().split(/\s+/);
    if (parts.length < 3) continue;

    const [sha, type, sizeStr] = parts;
    if (type !== 'blob') continue;

    const size = parseInt(sizeStr, 10);
    if (isNaN(size) || size < thresholdBytes) continue;

    const filePath = pathByHash.get(sha) || '(anonymous blob)';
    const inHead = headObjects.has(sha);

    if (inHead) {
      totalTrackedSize += size;
    } else {
      deadHistorySize += size;
    }

    blobs.push({
      sha: sha.substring(0, 10),
      fullSha: sha,
      size,
      path: filePath,
      inHead,
      status: inHead ? 'ACTIVE_HEAD' : 'DEAD_HISTORY',
    });
  }

  // Sort descending by size
  blobs.sort((a, b) => b.size - a.size);

  const topBlobs = blobs.slice(0, top);

  return {
    items: topBlobs,
    totalScannedBlobs: blobs.length,
    totalTrackedSize,
    deadHistorySize,
  };
}

module.exports = {
  findBloat,
};
