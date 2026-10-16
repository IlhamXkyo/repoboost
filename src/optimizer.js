'use strict';

const { execGit, isGitRepo, getGitDir, getDirectorySize, measureCommandLatency } = require('./git');

function optimizeRepo(cwd = process.cwd(), options = {}) {
  if (!isGitRepo(cwd)) {
    return { error: 'Not a git repository' };
  }

  const gitDir = getGitDir(cwd);
  const sizeBefore = getDirectorySize(gitDir);
  const latencyBefore = measureCommandLatency(['status', '--porcelain'], cwd, 2);

  const dryRun = options.dryRun || false;

  if (dryRun) {
    return {
      dryRun: true,
      gitDir,
      sizeBefore,
      latencyBeforeMs: latencyBefore,
      plannedActions: [
        'Consolidate packed refs (git pack-refs --all --prune)',
        'Run safe garbage collection (git gc --auto)',
        'Prune dangling objects (git prune --expire=now)',
        'Clean recorded conflict resolutions (git rerere gc)',
      ],
    };
  }

  // 1. Pack refs
  execGit(['pack-refs', '--all', '--prune'], cwd);

  // 2. Garbage collection
  execGit(['gc', '--auto'], cwd);

  // 3. Prune
  execGit(['prune', '--expire=now'], cwd);

  // 4. Rerere
  execGit(['rerere', 'gc'], cwd);

  const sizeAfter = getDirectorySize(gitDir);
  const latencyAfter = measureCommandLatency(['status', '--porcelain'], cwd, 2);
  const bytesSaved = Math.max(0, sizeBefore - sizeAfter);

  return {
    dryRun: false,
    gitDir,
    sizeBefore,
    sizeAfter,
    bytesSaved,
    latencyBeforeMs: latencyBefore,
    latencyAfterMs: latencyAfter,
    latencyChangeMs: Math.round((latencyAfter - latencyBefore) * 10) / 10,
  };
}

module.exports = {
  optimizeRepo,
};
