'use strict';

const fs = require('fs');
const path = require('path');
const { execGit, isGitRepo, getRepoRoot } = require('./git');

function detectGhostDiffs(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { error: 'Not a git repository', ghostFiles: [] };
  }

  const root = getRepoRoot(cwd);

  // 1. Get list of modified files
  const diffRes = execGit(['diff', '--name-only'], root);
  const stagedDiffRes = execGit(['diff', '--cached', '--name-only'], root);

  const modifiedFiles = new Set();
  if (diffRes.success && diffRes.stdout) {
    diffRes.stdout.split('\n').map(f => f.trim()).filter(Boolean).forEach(f => modifiedFiles.add(f));
  }
  if (stagedDiffRes.success && stagedDiffRes.stdout) {
    stagedDiffRes.stdout.split('\n').map(f => f.trim()).filter(Boolean).forEach(f => modifiedFiles.add(f));
  }

  const ghostFiles = [];

  for (const relFile of modifiedFiles) {
    // Run normal diff
    const normalDiff = execGit(['diff', 'HEAD', '--', relFile], root);
    // Run diff ignoring space and EOL
    const eolDiff = execGit(['diff', '--ignore-space-at-eol', 'HEAD', '--', relFile], root);

    if (normalDiff.success && normalDiff.stdout && eolDiff.success && !eolDiff.stdout) {
      // Normal diff has lines, but eolDiff is completely empty!
      // This is a 100% ghost diff.
      const lineCount = normalDiff.stdout.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length;
      ghostFiles.push({
        path: relFile,
        type: 'PURE_EOL_GHOST',
        affectedDiffLines: lineCount,
        note: 'Zero code logic change; differing solely by CRLF vs LF',
      });
    }
  }

  // 2. Check .gitattributes status
  const gitattributesPath = path.join(root, '.gitattributes');
  const hasGitattributes = fs.existsSync(gitattributesPath);
  let hasTextAuto = false;

  if (hasGitattributes) {
    try {
      const content = fs.readFileSync(gitattributesPath, 'utf8');
      hasTextAuto = /^\s*\*\s+text(=auto)?/m.test(content);
    } catch (_) {}
  }

  return {
    repoRoot: root,
    ghostCount: ghostFiles.length,
    ghostFiles,
    gitattributes: {
      exists: hasGitattributes,
      configuredProperly: hasTextAuto,
      path: gitattributesPath,
    },
  };
}

function generateGitattributes() {
  return `# Auto-detect text files and normalize line endings to LF on commit
* text=auto eol=lf

# Windows scripts
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf

# Binary formats
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.pdf binary
*.zip binary
*.tar binary
*.gz binary
*.7z binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
*.mp4 binary
*.mp3 binary
*.wav binary
*.wasm binary
`;
}

function applyGitattributes(cwd = process.cwd()) {
  const root = getRepoRoot(cwd);
  const gitattributesPath = path.join(root, '.gitattributes');

  if (fs.existsSync(gitattributesPath)) {
    const existing = fs.readFileSync(gitattributesPath, 'utf8');
    if (/^\s*\*\s+text(=auto)?/m.test(existing)) {
      return { success: false, message: '.gitattributes already contains text=auto configuration' };
    }
    fs.appendFileSync(gitattributesPath, '\n# Added by repoboost\n* text=auto eol=lf\n');
    return { success: true, message: 'Updated existing .gitattributes with * text=auto eol=lf' };
  }

  fs.writeFileSync(gitattributesPath, generateGitattributes(), 'utf8');
  return { success: true, message: 'Created recommended .gitattributes with normalized line endings' };
}

module.exports = {
  detectGhostDiffs,
  generateGitattributes,
  applyGitattributes,
};
