'use strict';

const fs = require('fs');
const path = require('path');
const { getGitDir, isGitRepo } = require('./git');

function generatePreCommitScript(maxSizeMb = 5) {
  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  return `#!/bin/sh
# repoboost pre-commit guard
# Generated automatically by repoboost. Do not edit manually.

MAX_SIZE=${maxSizeBytes}
MAX_SIZE_LABEL="${maxSizeMb}MB"

# Check for staged files exceeding size limit
FAILED=0

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
TMP_STAGED="$GIT_DIR/.repoboost_staged_$$"
git diff --cached --name-only --diff-filter=ACM > "$TMP_STAGED"

# Loop over staged files safely handling spaces in filenames
while IFS= read -r FILE || [ -n "$FILE" ]; do
  [ -z "$FILE" ] && continue
  if [ -f "$FILE" ]; then
    # Cross-platform file size in bytes
    if stat -c%s "$FILE" >/dev/null 2>&1; then
      FILE_SIZE=$(stat -c%s "$FILE")
    else
      FILE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || wc -c < "$FILE")
    fi

    # Trim whitespace
    FILE_SIZE=$(echo "$FILE_SIZE" | tr -d ' ')

    if [ "$FILE_SIZE" -gt "$MAX_SIZE" ]; then
      echo "\\033[31m[repoboost guard] REJECTED:\\033[0m '$FILE' exceeds size threshold of $MAX_SIZE_LABEL ($FILE_SIZE bytes)"
      echo "  Large binaries permanently bloat Git history. Use Git LFS or external artifact storage."
      FAILED=1
    fi

    # Check for accidental sensitive file commits
    case "$FILE" in
      *.env.example|*.env.sample|*.env.template|*.env.dist|*.env.schema)
        # Permitted sample configuration template
        ;;
      *.env|*.env.*|.env|*/.env|*/.env.*)
        echo "\\033[31m[repoboost guard] REJECTED:\\033[0m Sensitive environment file '$FILE' staged for commit!"
        FAILED=1
        ;;
      *.pub)
        # Public keys are not secret
        ;;
      *.pem|*.key|*id_rsa*|*id_ed25519*)
        echo "\\033[31m[repoboost guard] REJECTED:\\033[0m Private key / certificate '$FILE' staged for commit!"
        FAILED=1
        ;;
    esac
  fi
done < "$TMP_STAGED"
rm -f "$TMP_STAGED"

if [ "$FAILED" -ne 0 ]; then
  echo "\\033[33mCommit aborted by repoboost guard.\\033[0m To bypass (not recommended), use: git commit --no-verify"
  exit 1
fi

exit 0
`;
}

function installGuard(cwd = process.cwd(), options = {}) {
  if (!isGitRepo(cwd)) {
    return { success: false, message: 'Not a git repository' };
  }

  const gitDir = getGitDir(cwd);
  const hooksDir = path.join(gitDir, 'hooks');

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookFile = path.join(hooksDir, 'pre-commit');
  const maxSizeMb = options.maxSizeMb || 5;

  // If hook already exists, check if it's ours or someone else's
  if (fs.existsSync(hookFile)) {
    const existing = fs.readFileSync(hookFile, 'utf8');
    if (!existing.includes('repoboost pre-commit guard')) {
      const backupPath = `${hookFile}.backup.${Date.now()}`;
      fs.writeFileSync(backupPath, existing);
    }
  }

  fs.writeFileSync(hookFile, generatePreCommitScript(maxSizeMb), { mode: 0o755 });

  try {
    fs.chmodSync(hookFile, 0o755);
  } catch (_) {}

  return {
    success: true,
    hookPath: hookFile,
    maxSizeMb,
    message: `Pre-commit guard installed successfully (${maxSizeMb}MB threshold)`,
  };
}

function uninstallGuard(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { success: false, message: 'Not a git repository' };
  }

  const gitDir = getGitDir(cwd);
  const hookFile = path.join(gitDir, 'hooks', 'pre-commit');

  if (!fs.existsSync(hookFile)) {
    return { success: false, message: 'No pre-commit hook found' };
  }

  const content = fs.readFileSync(hookFile, 'utf8');
  if (!content.includes('repoboost pre-commit guard')) {
    return { success: false, message: 'Pre-commit hook was not created by repoboost. Aborting uninstall for safety.' };
  }

  fs.unlinkSync(hookFile);
  return { success: true, message: 'Pre-commit guard removed successfully' };
}

function checkGuardStatus(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { installed: false, isGitRepo: false };
  }

  const gitDir = getGitDir(cwd);
  const hookFile = path.join(gitDir, 'hooks', 'pre-commit');

  if (!fs.existsSync(hookFile)) {
    return { installed: false, isGitRepo: true };
  }

  try {
    const content = fs.readFileSync(hookFile, 'utf8');
    return {
      installed: content.includes('repoboost pre-commit guard'),
      isGitRepo: true,
      path: hookFile,
    };
  } catch (_) {
    return { installed: false, isGitRepo: true };
  }
}

module.exports = {
  installGuard,
  uninstallGuard,
  checkGuardStatus,
  generatePreCommitScript,
};
