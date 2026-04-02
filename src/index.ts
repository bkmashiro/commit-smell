#!/usr/bin/env node

import { Command } from 'commander';
import { detectFixLoops, detectLowInformationMessages, detectUnstableFiles, detectWipCommits } from './detectors.js';
import { runFixMode } from './fixer.js';
import { formatReport, type ReportData } from './formatter.js';
import { getCommitHistory, getCurrentBranch, isWhitespaceOnlyCommit } from './git.js';
import { installCommitMsgHook, uninstallCommitMsgHook } from './hook.js';
import { calculateScore } from './scorer.js';

interface CliOptions {
  branch?: string;
  days: string;
  limit: string;
  fix?: boolean;
  hook?: string;
  json?: boolean;
  fail: boolean;
  showWhitespace?: boolean;
}

const program = new Command();

program
  .name('commit-smell')
  .description('Audit git history for commit quality problems.')
  .option('--branch <name>', 'Branch to analyze (default: current)')
  .option('--days <n>', 'Look back N days (default: 90)', '90')
  .option('--limit <n>', 'Max commits to analyze (default: 500)', '500')
  .option('--fix', 'Interactively suggest fixes for detected issues')
  .option('--hook <action>', 'Install or uninstall commit-msg hook')
  .option('--json', 'JSON output')
  .option('--show-whitespace', 'List whitespace-only commits')
  .option('--no-fail', "Don't exit 1 on issues");

await program.parseAsync();

const options = program.opts<CliOptions>();

if (options.fix && options.json) {
  console.error('--fix cannot be used with --json');
  process.exit(2);
}

if (options.hook) {
  if (options.hook !== 'install' && options.hook !== 'uninstall') {
    console.error('--hook must be either "install" or "uninstall"');
    process.exit(2);
  }

  const result = options.hook === 'install' ? installCommitMsgHook() : uninstallCommitMsgHook();

  if (options.hook === 'install') {
    console.log(`✓ Installed commit-msg hook at ${result.relativeHookPath}`);
    console.log('  Rejects: bare "fix", "wip", "update", "changes", "misc"');
    console.log('  Requires: message > 10 characters');
  } else {
    console.log('✓ Removed commit-msg hook');
  }

  process.exit(0);
}

const days = Number.parseInt(options.days, 10);
const limit = Number.parseInt(options.limit, 10);

if (!Number.isInteger(days) || days <= 0) {
  console.error('--days must be a positive integer');
  process.exit(2);
}

if (!Number.isInteger(limit) || limit <= 0) {
  console.error('--limit must be a positive integer');
  process.exit(2);
}

const branch = options.branch ?? getCurrentBranch();
const commits = getCommitHistory({ branch, days, limit });
const wipCommits = detectWipCommits(commits);
const whitespaceOnlyCommits = commits.filter((commit) => isWhitespaceOnlyCommit(commit.hash));
const unstableFiles = detectUnstableFiles(commits);
const fixLoops = detectFixLoops(commits);
const lowInfo = detectLowInformationMessages(commits);
const score = calculateScore({ wipCommits, unstableFiles, fixLoops, lowInfo });

const report: ReportData = {
  branch,
  totalCommits: commits.length,
  days,
  commits,
  wipCommits,
  whitespaceOnlyCommits,
  unstableFiles,
  fixLoops,
  lowInfo,
  score
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report, { showWhitespace: options.showWhitespace }));
}

if (options.fix) {
  await runFixMode(report);
}

const hasIssues = wipCommits.length > 0 || unstableFiles.length > 0 || fixLoops.length > 0 || lowInfo.percentage > 20;
if (hasIssues && options.fail) {
  process.exit(1);
}
