import chalk from 'chalk';
import type { FixLoop, LowInfoSummary, UnstableFile } from './detectors.js';
import type { CommitRecord } from './git.js';
import type { ScoreBreakdown } from './scorer.js';

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
