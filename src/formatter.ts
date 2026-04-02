import chalk from 'chalk';
import type { FixLoop, LowInfoSummary, UnstableFile } from './detectors.js';
import type { CommitRecord } from './git.js';
import type { ScoreBreakdown } from './scorer.js';
import type { ComparisonData } from './comparer.js';

export interface ReportData {
  branch: string;
  totalCommits: number;
  days: number;
  commits: CommitRecord[];
  wipCommits: CommitRecord[];
  whitespaceOnlyCommits: CommitRecord[];
  unstableFiles: UnstableFile[];
  fixLoops: FixLoop[];
  lowInfo: LowInfoSummary;
  score: ScoreBreakdown;
}

export type ReportFormat = 'text' | 'markdown' | 'json' | 'html';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatReport(report: ReportData, options: { showWhitespace?: boolean } = {}): string {
  const lines: string[] = [];

  lines.push(`Analyzing ${report.totalCommits} ${pluralize(report.totalCommits, 'commit')} on ${report.branch}...`);
  lines.push('');

  lines.push(`${chalk.red('🔴')} WIP commits reached ${report.branch} (${report.wipCommits.length}):`);
  if (report.wipCommits.length === 0) {
    lines.push('   none');
  } else {
    for (const commit of report.wipCommits) {
      lines.push(`   ${commit.hash.slice(0, 7)}  ${JSON.stringify(commit.subject)}  (${commit.date})`);
    }
  }
  lines.push('');

  lines.push(`${chalk.yellow('🟡')} Whitespace-only commits (${report.whitespaceOnlyCommits.length}):`);
  if (report.whitespaceOnlyCommits.length === 0) {
    lines.push('   none');
  } else if (options.showWhitespace) {
    for (const commit of report.whitespaceOnlyCommits) {
      lines.push(`   ${commit.hash.slice(0, 7)}  ${JSON.stringify(commit.subject)}  (${commit.date})`);
    }
  } else {
    lines.push('   (use --show-whitespace to list)');
  }
  lines.push('');

  lines.push(`${chalk.red('🔴')} Unstable files (reverted 3+ times):`);
  if (report.unstableFiles.length === 0) {
    lines.push(`   none in last ${report.days} days`);
  } else {
    for (const file of report.unstableFiles) {
      lines.push(`   ${file.file}   reverted ${file.count}x in last ${report.days} days  ${chalk.dim('← instability signal')}`);
    }
  }
  lines.push('');

  lines.push(`${chalk.yellow('🟡')} Fix-loop chains (5+ sequential "fix" commits on same file):`);
  if (report.fixLoops.length === 0) {
    lines.push('   none');
  } else {
    for (const loop of report.fixLoops) {
      const subjects = loop.commits.map((commit) => JSON.stringify(commit.subject)).join(', ');
      lines.push(`   ${loop.file}: ${subjects} (${loop.commits.length} commits, ${loop.startDate} to ${loop.endDate})`);
    }
  }
  lines.push('');

  lines.push(`${chalk.yellow('🟡')} Low-information commit messages (${report.lowInfo.percentage}%):`);
  if (report.lowInfo.matches.length === 0) {
    lines.push('   none');
  } else {
    const offenders = report.lowInfo.offenders
      .slice(0, 5)
      .map((offender) => JSON.stringify(offender.message))
      .join(', ');
    lines.push(`   Top offenders: ${offenders}`);
  }
  lines.push('');

  lines.push(
    `Score: ${report.score.score}/100 (${report.score.grade})  ${chalk.dim(`— ${report.score.criticalIssues} critical issues, ${report.score.warnings} warnings`)}`
  );

  return lines.join('\n');
}

export function formatReportOutput(report: ReportData, format: ReportFormat, options: { showWhitespace?: boolean } = {}): string {
  switch (format) {
    case 'markdown':
      return formatMarkdownReport(report, options);
    case 'json':
      return JSON.stringify(createSerializableReport(report), null, 2);
    case 'html':
      return formatHtmlReport(report, options);
    default:
      return formatReport(report, options);
  }
}

export function formatComparison(comparison: ComparisonData): string {
  const lines: string[] = [];
  const currentLabel = `Current branch (${comparison.current.branch})`;
  const baselineLabel = `${comparison.baseline.branch} branch`;
  const width = Math.max(currentLabel.length, baselineLabel.length) + 2;

  lines.push(`Comparing current branch vs ${comparison.baseline.branch}...`);
  lines.push('');
  lines.push(`${currentLabel.padEnd(width)} Score: ${comparison.current.score.score}/100`);
  lines.push(`${baselineLabel.padEnd(width)} Score: ${comparison.baseline.score.score}/100`);
  lines.push('');
  lines.push('Regressions introduced in this branch:');
  if (comparison.regressions.length === 0) {
    lines.push(`  ${chalk.green('🟢')} none`);
  } else {
    for (const regression of comparison.regressions) {
      lines.push(`  ${chalk.red('🔴')} ${regression}`);
    }
  }
  lines.push('');
  lines.push('Improvements:');
  if (comparison.improvements.length === 0) {
    lines.push(`  ${chalk.yellow('🟡')} none`);
  } else {
    for (const improvement of comparison.improvements) {
      lines.push(`  ${chalk.green('🟢')} ${improvement}`);
    }
  }

  return lines.join('\n');
}

export function getRecommendations(report: ReportData): string[] {
  const recommendations: string[] = [];

  if (report.wipCommits.length > 0) {
    recommendations.push('Squash or amend WIP commits before merging.');
  }
  if (report.fixLoops.length > 0) {
    recommendations.push('Review fix-loop chains and consolidate repeated repair commits.');
  }
  if (report.lowInfo.percentage > 20) {
    recommendations.push('Require more descriptive commit messages for follow-up work.');
  }
  if (report.unstableFiles.length > 0) {
    recommendations.push('Investigate unstable files with repeated reverts before the next release.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No immediate cleanup actions recommended.');
  }

  return recommendations;
}

function formatMarkdownReport(report: ReportData, options: { showWhitespace?: boolean }): string {
  const lines: string[] = [];

  lines.push(`# commit-smell report: ${report.branch}`);
  lines.push('');
  lines.push(`Analyzed ${report.totalCommits} ${pluralize(report.totalCommits, 'commit')} from the last ${report.days} days.`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Score | ${report.score.score}/100 (${report.score.grade}) |`);
  lines.push(`| WIP commits | ${report.wipCommits.length} |`);
  lines.push(`| Whitespace-only commits | ${report.whitespaceOnlyCommits.length} |`);
  lines.push(`| Unstable files | ${report.unstableFiles.length} |`);
  lines.push(`| Fix-loop chains | ${report.fixLoops.length} |`);
  lines.push(`| Low-info rate | ${report.lowInfo.percentage}% |`);
  lines.push('');
  lines.push('## WIP commits');
  lines.push(...formatCommitList(report.wipCommits));
  lines.push('');
  lines.push('## Fix-loop chains');
  lines.push(...formatFixLoopList(report.fixLoops));
  lines.push('');
  lines.push('## Recommendations');
  lines.push(...getRecommendations(report).map((item) => `- ${item}`));

  if (options.showWhitespace) {
    lines.push('');
    lines.push('## Whitespace-only commits');
    lines.push(...formatCommitList(report.whitespaceOnlyCommits));
  }

  return lines.join('\n');
}

function formatHtmlReport(report: ReportData, options: { showWhitespace?: boolean }): string {
  const recommendations = getRecommendations(report)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const wipItems = formatCommitList(report.wipCommits, '<li>', '</li>', 'No WIP commits found.');
  const fixLoopItems = formatFixLoopList(report.fixLoops, '<li>', '</li>', 'No fix-loop chains found.');
  const whitespaceSection = options.showWhitespace
    ? `<section><h2>Whitespace-only commits</h2><ul>${formatCommitList(
        report.whitespaceOnlyCommits,
        '<li>',
        '</li>',
        'No whitespace-only commits found.'
      ).join('')}</ul></section>`
    : '';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <title>commit-smell report: ${escapeHtml(report.branch)}</title>`,
    '  <style>',
    '    body { font-family: Georgia, serif; margin: 2rem auto; max-width: 860px; color: #1f2933; background: linear-gradient(180deg, #f7f4ea 0%, #ffffff 100%); }',
    '    h1, h2 { font-family: "Avenir Next", "Segoe UI", sans-serif; }',
    '    table { border-collapse: collapse; width: 100%; background: #fff; }',
    '    th, td { border: 1px solid #d9d4c7; padding: 0.6rem; text-align: left; }',
    '    th { background: #efe6d2; }',
    '    section { margin-top: 2rem; }',
    '  </style>',
    '</head>',
    '<body>',
    `  <h1>commit-smell report: ${escapeHtml(report.branch)}</h1>`,
    `  <p>Analyzed ${report.totalCommits} ${escapeHtml(pluralize(report.totalCommits, 'commit'))} from the last ${report.days} days.</p>`,
    '  <table>',
    '    <thead><tr><th>Metric</th><th>Value</th></tr></thead>',
    '    <tbody>',
    `      <tr><td>Score</td><td>${report.score.score}/100 (${report.score.grade})</td></tr>`,
    `      <tr><td>WIP commits</td><td>${report.wipCommits.length}</td></tr>`,
    `      <tr><td>Whitespace-only commits</td><td>${report.whitespaceOnlyCommits.length}</td></tr>`,
    `      <tr><td>Unstable files</td><td>${report.unstableFiles.length}</td></tr>`,
    `      <tr><td>Fix-loop chains</td><td>${report.fixLoops.length}</td></tr>`,
    `      <tr><td>Low-info rate</td><td>${report.lowInfo.percentage}%</td></tr>`,
    '    </tbody>',
    '  </table>',
    `  <section><h2>WIP commits</h2><ul>${wipItems.join('')}</ul></section>`,
    `  <section><h2>Fix-loop chains</h2><ul>${fixLoopItems.join('')}</ul></section>`,
    `  <section><h2>Recommendations</h2><ul>${recommendations}</ul></section>`,
    `  ${whitespaceSection}`,
    '</body>',
    '</html>'
  ].join('\n');
}

function createSerializableReport(report: ReportData) {
  return {
    branch: report.branch,
    totalCommits: report.totalCommits,
    days: report.days,
    score: report.score,
    summary: {
      wipCommits: report.wipCommits.length,
      whitespaceOnlyCommits: report.whitespaceOnlyCommits.length,
      unstableFiles: report.unstableFiles.length,
      fixLoops: report.fixLoops.length,
      lowInfoPercentage: report.lowInfo.percentage
    },
    wipCommits: report.wipCommits,
    whitespaceOnlyCommits: report.whitespaceOnlyCommits,
    unstableFiles: report.unstableFiles,
    fixLoops: report.fixLoops,
    lowInfo: report.lowInfo,
    recommendations: getRecommendations(report)
  };
}

function formatCommitList(commits: CommitRecord[], prefix = '- ', suffix = '', empty = '- none'): string[] {
  if (commits.length === 0) {
    return [empty];
  }

  return commits.map((commit) => `${prefix}${escapeInlineText(commit.hash.slice(0, 7))} ${escapeInlineText(commit.subject)} (${commit.date})${suffix}`);
}

function formatFixLoopList(loops: FixLoop[], prefix = '- ', suffix = '', empty = '- none'): string[] {
  if (loops.length === 0) {
    return [empty];
  }

  return loops.map(
    (loop) =>
      `${prefix}${escapeInlineText(loop.file)}: ${loop.commits.length} commits (${loop.startDate} to ${loop.endDate})${suffix}`
  );
}

function escapeInlineText(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
