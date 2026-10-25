# repoboost

```text
  ___ ___ ___  ___  ___  ___   ___  ___ _____ 
 | _ \ __| _ \/ _ \| _ )/ _ \ / _ \/ __|_   _|
 |   / _||  _/ (_) | _ \ (_) | (_) \__ \ | |  
 |_|_\\___|_|  \___/|___/\___/ \___/|___/ |_|  
 Zero-dependency Git Velocity & Bloat Purifier
```

[![CI](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/IlhamXkyo/repoboost)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-orange.svg)](package.json)

> **repoboost** accelerates Git workflows by pinpointing historical binary bloat, eliminating cross-platform ghost line-ending diffs, exposing tracked ignore leaks, and enforcing pre-commit safeguards. Built with pure Node.js and zero external dependencies.

---

## The Problem It Solves

As software repositories evolve, they accumulate invisible performance drag. Developers unknowingly commit large test datasets, model weights, or multimedia binaries. Even after deleting these files in subsequent commits, the historical blobs remain permanently embedded inside `.git/objects`, causing clones, fetches, and AI agent context indexing to crawl.

Simultaneously, teams collaborating across Windows, macOS, and Linux suffer from CRLF/LF line-ending churn, where Git marks hundreds of files as modified despite zero code changes. To compound the friction, `.env` credentials and build artifacts frequently slip past `.gitignore` configurations and stay silently tracked. Existing tools like `bfg` or `git-filter-repo` require external runtimes, complex installation steps, and destructive history rewrites. `repoboost` delivers instantaneous diagnostic telemetry, safe housekeeping, and prevention guards with zero runtime dependencies.

---

## 30-Second Quickstart

Run directly via `npx` without installation:

```bash
npx repoboost audit
```

Or install globally:

```bash
npm install -g repoboost
```

---

## Key Capabilities

1. **Velocity & Health Telemetry (`repoboost audit`)**
   - Benchmarks `git status` and `git log` command latencies down to the millisecond.
   - Calculates an objective **Health & Velocity Score** (0 to 100) based on detected bloat factors.
   - Provides itemized penalty breakdowns and prioritized optimization actions.

2. **Historical Blob Telemetry (`repoboost bloat`)**
   - Traverses Git packfiles and revision trees to surface the heaviest historical objects.
   - Accurately differentiates active files in `HEAD` from dead history (orphaned objects preserved across old commits).
   - Configurable size thresholds (`--threshold <MB>`) and top-N ranking (`--top <N>`).

3. **Ghost Line-Ending Purge (`repoboost ghost`)**
   - Pinpoints files flagged as dirty solely due to CRLF vs LF line ending discrepancies.
   - Detects missing `.gitattributes` normalization.
   - Generates and applies recommended `.gitattributes` with `repoboost ghost --apply`.
   - Renormalizes working tree index immediately with `--renormalize`.

4. **Tracked Ignore & Secret Leaks (`repoboost leak`)**
   - Catches files that match `.gitignore` rules but remain actively tracked in Git index.
   - Flags sensitive credential leaks (`.env`, `.pem`, `id_rsa`, `serviceAccountKey*.json`, `node_modules`).
   - One-step automatic remediation via `repoboost leak --fix` to untrack files while preserving them on disk.

5. **Safe Non-Destructive Optimization (`repoboost optimize`)**
   - Executes safe reference packing (`git pack-refs --all --prune`), automated garbage collection, and loose object pruning.
   - Measures before vs after disk space reclaimed and status latency gains.
   - Includes `--dry-run` simulation mode.

6. **Pre-Commit Fortress Guard (`repoboost guard`)**
   - Installs a zero-dependency pre-commit hook in `.git/hooks/pre-commit`.
   - Intercepts files exceeding the size threshold (default: 5MB) or private keys BEFORE they enter Git history.
   - Prevents repository pollution at the source.

7. **CI/CD Quality Gate & AI Automation (`--fail-under`, `--strict`, `--json`)**
   - Enforce minimum repository health standards in CI pipelines with `--fail-under <score>`.
   - Block builds on dirty line endings or sensitive leaks with `--strict`.
   - Every command supports structured JSON output for AI coding agents and CI/CD pipelines.

---

## CLI Reference & Usage

```text
USAGE:
  repoboost <command> [target_path] [options]

COMMANDS:
  audit [path]         Run full velocity & health audit (score, latency, bloat summary)
  bloat [path]         Scan git history for largest committed blobs & orphaned objects
  ghost [path]         Detect phantom line-ending diffs (CRLF vs LF churn)
  leak [path]          Detect tracked files matching .gitignore or sensitive patterns
  optimize [path]      Perform safe non-destructive Git maintenance & reclaim disk
  guard [path]         Manage pre-commit size & sensitive file guard
  help                 Display help guide

OPTIONS:
  --json               Output machine-readable JSON (ideal for CI/CD & AI agents)
  --fail-under <N>     Exit with code 1 if health score is under N in 'audit' (CI gate)
  --strict             Fail audit if any leaks or ghost diffs are detected
  --top <N>            Number of largest blobs to return (default: 15)
  --threshold <MB>     Minimum blob size in MB for bloat scan (default: 0)
  --apply              Apply recommended .gitattributes normalization in 'ghost'
  --renormalize        Renormalize working tree index line endings when applying ghost fix
  --fix                Automatically untrack leaked/ignored files in 'leak'
  --dry-run            Simulate optimization without making disk modifications
  --install            Install pre-commit hook in 'guard'
  --uninstall          Uninstall pre-commit hook in 'guard'
  --max-size <MB>      Max allowed staged file size for guard (default: 5)
  -v, --version        Show version number
  -h, --help           Show help message
```

---

## Real Terminal Output Example

```text
$ repoboost audit

  ___ ___ ___  ___  ___  ___   ___  ___ _____ 
 | _ \ __| _ \/ _ \| _ )/ _ \ / _ \/ __|_   _|
 |   / _||  _/ (_) | _ \ (_) | (_) \__ \ | |  
 |_|_\\___|_|  \___/|___/\___/ \___/|___/ |_|  
 Zero-dependency Git Velocity & Bloat Purifier

REPOSITORY AUDIT TELEMETRY
Path:      /home/developer/workspace/project
Branch:    main (142 commits)
Velocity:  git status 14.2ms | git log 8.6ms
Total Git: 48.22 MB (Pack: 39.10 MB, Loose: 9.12 MB)

HEALTH & VELOCITY SCORE: 75/100
Detected Bottlenecks:
  - -15 pts: 1 ghost diff file(s) with CRLF/LF churn
  - -10 pts: High loose object count (640 loose objects, run optimize)

COMPONENT METRICS:
  Historical Bloat:    428 blobs scanned, 12.40 MB dead history
  Ghost EOL Diffs:     1 files (.gitattributes: Missing/Default)
  Tracked Ignore Leaks: 0 leaks
  Pre-Commit Guard:    Not Installed

ACTIONABLE BOOST RECOMMENDATIONS:
  1. Run `repoboost ghost --apply` to normalize line endings and avoid ghost diffs
  2. Run `repoboost optimize` to pack loose objects and reclaim disk space
  3. Run `repoboost guard --install` to prevent future commits of massive binaries or secrets
```

---

## CI / Agent Automation Example

Integrate `repoboost` into GitHub Actions or AI agent execution loops:

```yaml
name: Repository Health Check
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run repoboost audit with Quality Gate
        run: npx repoboost audit --fail-under 80 --strict --json
```

---

## Verification & Architecture

`repoboost` is engineered strictly according to `anti-slop-code` principles:
- **Zero Runtime Dependencies**: Uses Node.js standard modules (`child_process`, `fs`, `path`, `os`, `util`).
- **Zero Mocks in Core Flow**: Interacts directly with native Git plumbing (`git rev-list`, `git cat-file`, `git count-objects`, `git ls-files`).
- **Deterministic Test Suite**: 32 unit and integration tests executing real Git repositories in temporary sandboxes.

```bash
npm test
```

---

## License

MIT (c) 2026 [Ilham (@IlhamXkyo)](https://github.com/IlhamXkyo).
