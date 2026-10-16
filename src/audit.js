'use strict';

const path = require('path');
const fs = require('fs');
const {
  isGitRepo,
  getRepoRoot,
  getGitDir,
  getBranch,
  getCommitCount,
  measureCommandLatency,
  getDirectorySize,
  execGit,
} = require('./git');
const { findBloat } = require('./bloat');
const { detectGhostDiffs } = require('./ghost');
const { detectLeaks } = require('./leak');
const { checkGuardStatus } = require('./guard');

function parseCountObjects(cwd) {
  const res = execGit(['count-objects', '-v'], cwd);
  const data = {
    count: 0,
    size: 0,
    inPack: 0,
    packs: 0,
    sizePack: 0,
    prunePackable: 0,
    garbage: 0,
    sizeGarbage: 0,
  };

  if (!res.success || !res.stdout) return data;

  const lines = res.stdout.split('\n');
  for (const line of lines) {
    const [key, valStr] = line.trim().split(/:\s+/);
    if (!key || !valStr) continue;
    const val = parseInt(valStr, 10);
    if (isNaN(val)) continue;

    if (key === 'count') data.count = val;
    else if (key === 'size') data.size = val * 1024; // KB to B
    else if (key === 'in-pack') data.inPack = val;
    else if (key === 'packs') data.packs = val;
    else if (key === 'size-pack') data.sizePack = val * 1024; // KB to B
    else if (key === 'prune-packable') data.prunePackable = val;
    else if (key === 'garbage') data.garbage = val;
    else if (key === 'size-garbage') data.sizeGarbage = val * 1024;
  }

  return data;
}

function runAudit(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { error: 'Not a git repository' };
  }

  const root = getRepoRoot(cwd);
  const gitDir = getGitDir(root);
  const branch = getBranch(root);
  const commitCount = getCommitCount(root);

  // Folder breakdowns
  const totalGitSize = getDirectorySize(gitDir);
  const objectsDir = path.join(gitDir, 'objects');
  const packDir = path.join(objectsDir, 'pack');
  const logsDir = path.join(gitDir, 'logs');
  const refsDir = path.join(gitDir, 'refs');
  const indexPath = path.join(gitDir, 'index');

  const objectsSize = getDirectorySize(objectsDir);
  const packSize = getDirectorySize(packDir);
  const looseObjectsSize = Math.max(0, objectsSize - packSize);
  const logsSize = getDirectorySize(logsDir);
  const refsSize = getDirectorySize(refsDir);
  let indexSize = 0;
  try {
    if (fs.existsSync(indexPath)) indexSize = fs.statSync(indexPath).size;
  } catch (_) {}

  // Latency telemetry
  const statusLatencyMs = measureCommandLatency(['status', '--porcelain'], root, 3);
  const logLatencyMs = commitCount > 0 ? measureCommandLatency(['log', '-n', '1'], root, 3) : 0;

  // Count objects
  const objStats = parseCountObjects(root);

  // Subsystem checks
  const bloat = findBloat(root, { top: 5, thresholdMb: 2 });
  const ghost = detectGhostDiffs(root);
  const leaks = detectLeaks(root);
  const guard = checkGuardStatus(root);

  // Calculate Health & Velocity Score (0 - 100)
  let score = 100;
  const deductions = [];

  // 1. Large blobs > 5MB
  const massiveBlobs = bloat.items.filter(b => b.size > 5 * 1024 * 1024);
  if (massiveBlobs.length > 0) {
    const penalty = Math.min(25, massiveBlobs.length * 10);
    score -= penalty;
    deductions.push(`-${penalty} pts: ${massiveBlobs.length} massive historical blob(s) exceeding 5MB`);
  }

  // 2. Dead history size
  if (bloat.deadHistorySize > 10 * 1024 * 1024) {
    score -= 15;
    deductions.push(`-15 pts: Heavy dead history (${Math.round(bloat.deadHistorySize / (1024 * 1024))}MB orphaned from HEAD)`);
  }

  // 3. Ghost diffs
  if (ghost.ghostCount > 0) {
    score -= 15;
    deductions.push(`-15 pts: ${ghost.ghostCount} ghost diff file(s) with CRLF/LF churn`);
  }

  // 4. Tracked leaks
  if (leaks.leakCount > 0) {
    score -= 15;
    deductions.push(`-15 pts: ${leaks.leakCount} tracked file(s) matching .gitignore or sensitive patterns`);
  }

  // 5. Unpacked loose objects
  if (objStats.count > 500) {
    score -= 10;
    deductions.push(`-10 pts: High loose object count (${objStats.count} loose objects, run optimize)`);
  }

  // 6. Slow status latency
  if (statusLatencyMs > 250) {
    score -= 10;
    deductions.push(`-10 pts: Elevated git status latency (${statusLatencyMs}ms)`);
  }

  // 7. Missing .gitattributes
  if (!ghost.gitattributes.configuredProperly) {
    score -= 5;
    deductions.push('-5 pts: Missing or incomplete .gitattributes text normalization');
  }

  score = Math.max(0, Math.min(100, score));

  // Actionable recommendations
  const recommendations = [];
  if (ghost.ghostCount > 0 || !ghost.gitattributes.configuredProperly) {
    recommendations.push('Run `repoboost ghost --apply` to normalize line endings and avoid ghost diffs');
  }
  if (leaks.leakCount > 0) {
    recommendations.push('Run `repoboost leak` and execute remediation commands to stop tracking ignored files');
  }
  if (objStats.count > 100 || bloat.deadHistorySize > 5 * 1024 * 1024) {
    recommendations.push('Run `repoboost optimize` to pack loose objects and reclaim disk space');
  }
  if (!guard.installed) {
    recommendations.push('Run `repoboost guard --install` to prevent future commits of massive binaries or secrets');
  }

  return {
    repoRoot: root,
    branch,
    commitCount,
    healthScore: score,
    deductions,
    recommendations,
    telemetry: {
      statusLatencyMs,
      logLatencyMs,
    },
    diskUsage: {
      totalGitSize,
      objectsSize,
      packSize,
      looseObjectsSize,
      logsSize,
      refsSize,
      indexSize,
    },
    objects: objStats,
    bloatSummary: {
      scannedBlobs: bloat.totalScannedBlobs,
      trackedBytes: bloat.totalTrackedSize,
      deadHistoryBytes: bloat.deadHistorySize,
      topBloatCount: bloat.items.length,
    },
    ghostSummary: {
      ghostCount: ghost.ghostCount,
      gitattributesPresent: ghost.gitattributes.exists,
      gitattributesValid: ghost.gitattributes.configuredProperly,
    },
    leakSummary: {
      leakCount: leaks.leakCount,
    },
    guardSummary: {
      installed: guard.installed,
    },
  };
}

module.exports = {
  runAudit,
};
