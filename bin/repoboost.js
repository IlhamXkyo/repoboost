#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  runAudit,
  findBloat,
  detectGhostDiffs,
  applyGitattributes,
  detectLeaks,
  optimizeRepo,
  installGuard,
  uninstallGuard,
  checkGuardStatus,
  formatter: { colors, formatBytes, colorScore, renderBanner },
} = require('../src/index');

const pkg = require('../package.json');

function printHelp() {
  console.log(renderBanner());
  console.log(`${colors.bold}USAGE:${colors.reset}
  repoboost <command> [target_path] [options]

${colors.bold}COMMANDS:${colors.reset}
  audit [path]         Run full velocity & health audit (score, latency, bloat summary)
  bloat [path]         Scan git history for largest committed blobs & orphaned objects
  ghost [path]         Detect phantom line-ending diffs (CRLF vs LF churn)
  leak [path]          Detect tracked files matching .gitignore or sensitive patterns
  optimize [path]      Perform safe non-destructive Git maintenance & reclaim disk
  guard [path]         Manage pre-commit size & sensitive file guard
  help                 Display this help guide

${colors.bold}OPTIONS:${colors.reset}
  --json               Output machine-readable JSON (ideal for CI/CD & AI agents)
  --top <N>            Number of largest blobs to return (default: 15)
  --threshold <MB>     Minimum blob size in MB for bloat scan (default: 0)
  --apply              Apply recommended .gitattributes normalization in 'ghost'
  --dry-run            Simulate optimization without making disk modifications
  --install            Install pre-commit hook in 'guard'
  --uninstall          Uninstall pre-commit hook in 'guard'
  --max-size <MB>      Max allowed staged file size for guard (default: 5)
  -v, --version        Show version number
  -h, --help           Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  repoboost audit
  repoboost bloat --top 10 --threshold 1
  repoboost ghost --apply
  repoboost leak --json
  repoboost optimize --dry-run
  repoboost guard --install --max-size 10
`);
}

function parseArgs(args) {
  let command = 'audit';
  let targetPath = process.cwd();
  const options = {
    json: false,
    top: 15,
    thresholdMb: 0,
    apply: false,
    dryRun: false,
    install: false,
    uninstall: false,
    maxSizeMb: 5,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      return { action: 'help' };
    }
    if (arg === '--version' || arg === '-v') {
      return { action: 'version' };
    }
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--install') {
      options.install = true;
    } else if (arg === '--uninstall') {
      options.uninstall = true;
    } else if (arg === '--top' && i + 1 < args.length) {
      options.top = parseInt(args[++i], 10) || 15;
    } else if (arg === '--threshold' && i + 1 < args.length) {
      options.thresholdMb = parseFloat(args[++i]) || 0;
    } else if (arg === '--max-size' && i + 1 < args.length) {
      options.maxSizeMb = parseFloat(args[++i]) || 5;
    } else if (!arg.startsWith('-')) {
      if (['audit', 'bloat', 'ghost', 'leak', 'optimize', 'guard'].includes(arg)) {
        command = arg;
      } else {
        targetPath = path.resolve(process.cwd(), arg);
      }
    }
    i++;
  }

  return { action: 'run', command, targetPath, options };
}

function handleAudit(targetPath, options) {
  const result = runAudit(targetPath);
  if (result.error) {
    if (options.json) {
      console.log(JSON.stringify({ error: result.error }, null, 2));
    } else {
      console.error(`${colors.red}[Error]${colors.reset} ${result.error}: ${targetPath}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBanner());
  console.log(`${colors.bold}REPOSITORY AUDIT TELEMETRY${colors.reset}`);
  console.log(`${colors.gray}Path:      ${colors.reset}${result.repoRoot}`);
  console.log(`${colors.gray}Branch:    ${colors.reset}${result.branch} (${result.commitCount} commits)`);
  console.log(`${colors.gray}Velocity:  ${colors.reset}git status ${colors.cyan}${result.telemetry.statusLatencyMs}ms${colors.reset} | git log ${colors.cyan}${result.telemetry.logLatencyMs}ms${colors.reset}`);
  console.log(`${colors.gray}Total Git: ${colors.reset}${formatBytes(result.diskUsage.totalGitSize)} (Pack: ${formatBytes(result.diskUsage.packSize)}, Loose: ${formatBytes(result.diskUsage.looseObjectsSize)})`);
  console.log('');

  console.log(`${colors.bold}HEALTH & VELOCITY SCORE:${colors.reset} ${colorScore(result.healthScore)}`);
  if (result.deductions.length > 0) {
    console.log(`${colors.yellow}Detected Bottlenecks:${colors.reset}`);
    for (const d of result.deductions) {
      console.log(`  - ${d}`);
    }
  } else {
    console.log(`${colors.green}  Clean repository. Zero major bloat or line-ending anomalies detected.${colors.reset}`);
  }
  console.log('');

  console.log(`${colors.bold}COMPONENT METRICS:${colors.reset}`);
  console.log(`  Historical Bloat:    ${result.bloatSummary.scannedBlobs} blobs scanned, ${formatBytes(result.bloatSummary.deadHistoryBytes)} dead history`);
  console.log(`  Ghost EOL Diffs:     ${result.ghostSummary.ghostCount} files (.gitattributes: ${result.ghostSummary.gitattributesValid ? colors.green + 'Normalized' : colors.yellow + 'Missing/Default'}${colors.reset})`);
  console.log(`  Tracked Ignore Leaks: ${result.leakSummary.leakCount === 0 ? colors.green + '0 leaks' : colors.red + result.leakSummary.leakCount + ' leaks found'}${colors.reset}`);
  console.log(`  Pre-Commit Guard:    ${result.guardSummary.installed ? colors.green + 'Installed' : colors.yellow + 'Not Installed'}${colors.reset}`);
  console.log('');

  if (result.recommendations.length > 0) {
    console.log(`${colors.cyan}${colors.bold}ACTIONABLE BOOST RECOMMENDATIONS:${colors.reset}`);
    for (let i = 0; i < result.recommendations.length; i++) {
      console.log(`  ${i + 1}. ${result.recommendations[i]}`);
    }
    console.log('');
  }
}

function handleBloat(targetPath, options) {
  const result = findBloat(targetPath, options);
  if (result.error) {
    if (options.json) {
      console.log(JSON.stringify({ error: result.error }, null, 2));
    } else {
      console.error(`${colors.red}[Error]${colors.reset} ${result.error}: ${targetPath}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBanner());
  console.log(`${colors.bold}HISTORICAL OBJECT BLOAT INSPECTION${colors.reset}`);
  console.log(`${colors.gray}Total Blobs: ${result.totalScannedBlobs} | Dead History: ${formatBytes(result.deadHistorySize)}${colors.reset}\n`);

  if (result.items.length === 0) {
    console.log(`${colors.green}No large blobs detected meeting criteria.${colors.reset}\n`);
    return;
  }

  console.log(`${colors.bold}Top ${result.items.length} Heaviest Objects in Git History:${colors.reset}`);
  console.log('--------------------------------------------------------------------------------');
  console.log('SIZE       STATUS       SHA        PATH');
  console.log('--------------------------------------------------------------------------------');

  for (const item of result.items) {
    const sizeStr = formatBytes(item.size).padEnd(10);
    const statusStr = item.inHead
      ? `${colors.green}ACTIVE_HEAD${colors.reset} `
      : `${colors.yellow}DEAD_HIST  ${colors.reset} `;
    const shaStr = `${colors.cyan}${item.sha}${colors.reset} `;
    console.log(`${sizeStr} ${statusStr} ${shaStr} ${item.path}`);
  }
  console.log('--------------------------------------------------------------------------------\n');
  console.log(`${colors.gray}Note: DEAD_HIST objects are absent from current HEAD but permanently preserved in past commits.${colors.reset}\n`);
}

function handleGhost(targetPath, options) {
  if (options.apply) {
    const applyRes = applyGitattributes(targetPath);
    if (options.json) {
      console.log(JSON.stringify(applyRes, null, 2));
    } else {
      console.log(applyRes.success ? `${colors.green}${applyRes.message}${colors.reset}` : `${colors.yellow}${applyRes.message}${colors.reset}`);
    }
    return;
  }

  const result = detectGhostDiffs(targetPath);
  if (result.error) {
    if (options.json) {
      console.log(JSON.stringify({ error: result.error }, null, 2));
    } else {
      console.error(`${colors.red}[Error]${colors.reset} ${result.error}: ${targetPath}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBanner());
  console.log(`${colors.bold}GHOST LINE-ENDING DIFF INSPECTION (CRLF vs LF)${colors.reset}`);
  console.log(`${colors.gray}.gitattributes: ${result.gitattributes.configuredProperly ? colors.green + 'Configured (* text=auto)' : colors.yellow + 'Missing or Incomplete'}${colors.reset}\n`);

  if (result.ghostCount === 0) {
    console.log(`${colors.green}Zero ghost line-ending diffs detected. Working tree is clean of EOL churn.${colors.reset}\n`);
    if (!result.gitattributes.configuredProperly) {
      console.log(`${colors.cyan}Tip:${colors.reset} Run \`repoboost ghost --apply\` to prevent future cross-platform EOL drift.\n`);
    }
    return;
  }

  console.log(`${colors.yellow}Found ${result.ghostCount} ghost diff file(s):${colors.reset}`);
  for (const ghost of result.ghostFiles) {
    console.log(`  ${colors.yellow}*${colors.reset} ${ghost.path} (${ghost.affectedDiffLines} diff lines caused purely by line endings)`);
  }
  console.log('');
  console.log(`${colors.cyan}Remediation:${colors.reset} Run \`repoboost ghost --apply\` to normalize Git line ending attributes.\n`);
}

function handleLeak(targetPath, options) {
  const result = detectLeaks(targetPath);
  if (result.error) {
    if (options.json) {
      console.log(JSON.stringify({ error: result.error }, null, 2));
    } else {
      console.error(`${colors.red}[Error]${colors.reset} ${result.error}: ${targetPath}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBanner());
  console.log(`${colors.bold}TRACKED IGNORE & SENSITIVE ARTIFACT LEAK INSPECTION${colors.reset}\n`);

  if (result.leakCount === 0) {
    console.log(`${colors.green}Zero tracked leaks found. No ignored or sensitive files are tracked in Git index.${colors.reset}\n`);
    return;
  }

  console.log(`${colors.red}${colors.bold}Found ${result.leakCount} actively tracked file(s) that should be ignored:${colors.reset}\n`);
  for (const leak of result.leaks) {
    console.log(`  ${colors.red}!${colors.reset} ${colors.bold}${leak.path}${colors.reset}`);
    console.log(`    ${colors.gray}Reason:${colors.reset} ${leak.reason}`);
    console.log(`    ${colors.cyan}Fix:${colors.reset}    ${leak.remediation}`);
    console.log('');
  }
}

function handleOptimize(targetPath, options) {
  const result = optimizeRepo(targetPath, options);
  if (result.error) {
    if (options.json) {
      console.log(JSON.stringify({ error: result.error }, null, 2));
    } else {
      console.error(`${colors.red}[Error]${colors.reset} ${result.error}: ${targetPath}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(renderBanner());
  if (result.dryRun) {
    console.log(`${colors.yellow}${colors.bold}OPTIMIZATION SIMULATION (--dry-run)${colors.reset}`);
    console.log(`${colors.gray}Current Git Size: ${formatBytes(result.sizeBefore)}${colors.reset}`);
    console.log(`${colors.gray}Status Latency:   ${result.latencyBeforeMs}ms${colors.reset}\n`);
    console.log(`${colors.bold}Planned Non-Destructive Maintenance Actions:${colors.reset}`);
    for (const a of result.plannedActions) {
      console.log(`  * ${a}`);
    }
    console.log(`\nTo execute, run: \`repoboost optimize\` without --dry-run\n`);
    return;
  }

  console.log(`${colors.green}${colors.bold}GIT REPOSITORY OPTIMIZATION COMPLETED${colors.reset}`);
  console.log(`${colors.gray}Size Before:     ${formatBytes(result.sizeBefore)}${colors.reset}`);
  console.log(`${colors.gray}Size After:      ${formatBytes(result.sizeAfter)}${colors.reset}`);
  console.log(`${colors.cyan}Disk Reclaimed:  ${formatBytes(result.bytesSaved)}${colors.reset}`);
  console.log(`${colors.gray}Status Latency:  ${result.latencyBeforeMs}ms -> ${result.latencyAfterMs}ms (${result.latencyChangeMs >= 0 ? '+' : ''}${result.latencyChangeMs}ms)${colors.reset}\n`);
}

function handleGuard(targetPath, options) {
  if (options.install) {
    const installRes = installGuard(targetPath, options);
    if (options.json) {
      console.log(JSON.stringify(installRes, null, 2));
    } else {
      console.log(installRes.success
        ? `${colors.green}${installRes.message}${colors.reset}\nHook path: ${installRes.hookPath}\n`
        : `${colors.red}[Error] ${installRes.message}${colors.reset}\n`);
    }
    return;
  }

  if (options.uninstall) {
    const uninstallRes = uninstallGuard(targetPath);
    if (options.json) {
      console.log(JSON.stringify(uninstallRes, null, 2));
    } else {
      console.log(uninstallRes.success
        ? `${colors.green}${uninstallRes.message}${colors.reset}\n`
        : `${colors.yellow}${uninstallRes.message}${colors.reset}\n`);
    }
    return;
  }

  const status = checkGuardStatus(targetPath);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(renderBanner());
  console.log(`${colors.bold}PRE-COMMIT GUARD STATUS${colors.reset}`);
  console.log(`Status: ${status.installed ? colors.green + 'ACTIVE & GUARDING' : colors.yellow + 'INACTIVE'}${colors.reset}`);
  if (status.installed) {
    console.log(`Location: ${status.path}`);
  } else {
    console.log(`To install, run: \`repoboost guard --install --max-size 5\``);
  }
  console.log('');
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.action === 'help') {
    printHelp();
    return;
  }

  if (parsed.action === 'version') {
    console.log(`repoboost v${pkg.version}`);
    return;
  }

  switch (parsed.command) {
    case 'audit':
      handleAudit(parsed.targetPath, parsed.options);
      break;
    case 'bloat':
      handleBloat(parsed.targetPath, parsed.options);
      break;
    case 'ghost':
      handleGhost(parsed.targetPath, parsed.options);
      break;
    case 'leak':
      handleLeak(parsed.targetPath, parsed.options);
      break;
    case 'optimize':
      handleOptimize(parsed.targetPath, parsed.options);
      break;
    case 'guard':
      handleGuard(parsed.targetPath, parsed.options);
      break;
    default:
      printHelp();
      break;
  }
}

main();
