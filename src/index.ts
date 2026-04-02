#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeBranch, compareBranches } from './comparer.js';
import { runFixMode } from './fixer.js';
import { formatComparison, formatReportOutput, type ReportFormat } from './formatter.js';
import { installCommitMsgHook, uninstallCommitMsgHook } from './hook.js';

interface CliOptions {
  branch?: string;
  days: string;
  limit: string;
  compare?: string;
  fix?: boolean;
  hook?: string;
  json?: boolean;
  report?: string;
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
  .option('--compare <branch>', 'Compare the current branch against another branch')
  .option('--fix', 'Interactively suggest fixes for detected issues')
  .option('--hook <action>', 'Install or uninstall commit-msg hook')
  .option('--json', 'JSON output')
  .option('--report <format>', 'Report output: text, markdown, json, html')
  .option('--show-whitespace', 'List whitespace-only commits')
  .option('--no-fail', "Don't exit 1 on issues");

await program.parseAsync();

const options = program.opts<CliOptions>();

if (options.fix && options.json) {
  console.error('--fix cannot be used with --json');
  process.exit(2);
}

if (options.fix && options.report) {
  console.error('--fix cannot be used with --report');
  process.exit(2);
}

if (options.compare && options.report) {
  console.error('--compare cannot be used with --report');
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

const requestedFormat = normalizeReportFormat(options.report, options.json);

if (options.compare) {
  const comparison = compareBranches({
    branch: options.branch,
    compareBranch: options.compare,
    days,
    limit
  });

  console.log(formatComparison(comparison));

  const hasRegressions = comparison.regressions.length > 0;
  if (hasRegressions && options.fail) {
    process.exit(1);
  }
  process.exit(0);
}

const report = analyzeBranch({
  branch: options.branch,
  days,
  limit
});

console.log(formatReportOutput(report, requestedFormat, { showWhitespace: options.showWhitespace }));

if (options.fix) {
  await runFixMode(report);
}

const hasIssues =
  report.wipCommits.length > 0 ||
  report.unstableFiles.length > 0 ||
  report.fixLoops.length > 0 ||
  report.lowInfo.percentage > 20;
if (hasIssues && options.fail) {
  process.exit(1);
}

function normalizeReportFormat(report: string | undefined, json: boolean | undefined): ReportFormat {
  if (json) {
    return 'json';
  }

  if (!report) {
    return 'text';
  }

  if (report === 'text' || report === 'markdown' || report === 'json' || report === 'html') {
    return report;
  }

  console.error('--report must be one of: text, markdown, json, html');
  process.exit(2);
}
