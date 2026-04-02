import { detectFixLoops, detectLowInformationMessages, detectUnstableFiles, detectWipCommits } from './detectors.js';
import { type ReportData } from './formatter.js';
import { getCommitHistory, getCurrentBranch, isWhitespaceOnlyCommit, type CommitRecord } from './git.js';
import { calculateScore } from './scorer.js';

export interface AnalyzeBranchOptions {
  branch?: string;
  days: number;
  limit: number;
  cwd?: string;
}

export interface ComparisonData {
  current: ReportData;
  baseline: ReportData;
  regressions: string[];
  improvements: string[];
}

interface AnalyzerDependencies {
  getCurrentBranch: (cwd?: string) => string;
  getCommitHistory: (options: { branch: string; days: number; limit: number; cwd?: string }) => CommitRecord[];
  isWhitespaceOnlyCommit: (hash: string, cwd?: string) => boolean;
}

const defaultDependencies: AnalyzerDependencies = {
  getCurrentBranch,
  getCommitHistory,
  isWhitespaceOnlyCommit
};

export function analyzeBranch(
  options: AnalyzeBranchOptions,
  dependencies: AnalyzerDependencies = defaultDependencies
): ReportData {
  const branch = options.branch ?? dependencies.getCurrentBranch(options.cwd);
  const commits = dependencies.getCommitHistory({
    branch,
    days: options.days,
    limit: options.limit,
    cwd: options.cwd
  });
  const wipCommits = detectWipCommits(commits);
  const whitespaceOnlyCommits = commits.filter((commit) => dependencies.isWhitespaceOnlyCommit(commit.hash, options.cwd));
  const unstableFiles = detectUnstableFiles(commits);
  const fixLoops = detectFixLoops(commits);
  const lowInfo = detectLowInformationMessages(commits);
  const score = calculateScore({ wipCommits, unstableFiles, fixLoops, lowInfo });

  return {
    branch,
    totalCommits: commits.length,
    days: options.days,
    commits,
    wipCommits,
    whitespaceOnlyCommits,
    unstableFiles,
    fixLoops,
    lowInfo,
    score
  };
}

export function compareReports(current: ReportData, baseline: ReportData): ComparisonData {
  const regressions: string[] = [];
  const improvements: string[] = [];

  pushDeltaMessages({
    currentValue: current.wipCommits.length,
    baselineValue: baseline.wipCommits.length,
    regressions,
    improvements,
    increased: (delta) => `${delta} new WIP ${pluralize(delta, 'commit')} (were ${baseline.wipCommits.length} on ${baseline.branch})`,
    decreased: (delta) => `${delta} fewer WIP ${pluralize(delta, 'commit')} (${baseline.wipCommits.length} -> ${current.wipCommits.length})`
  });

  pushDeltaMessages({
    currentValue: current.lowInfo.percentage,
    baselineValue: baseline.lowInfo.percentage,
    regressions,
    improvements,
    increased: () => `Low-info rate increased: ${baseline.lowInfo.percentage}% -> ${current.lowInfo.percentage}%`,
    decreased: () => `Low-info rate improved: ${baseline.lowInfo.percentage}% -> ${current.lowInfo.percentage}%`
  });

  pushDeltaMessages({
    currentValue: current.unstableFiles.length,
    baselineValue: baseline.unstableFiles.length,
    regressions,
    improvements,
    increased: () => `Unstable files increased: ${baseline.unstableFiles.length} -> ${current.unstableFiles.length}`,
    decreased: () => `Unstable files reduced: ${baseline.unstableFiles.length} -> ${current.unstableFiles.length}`
  });

  pushDeltaMessages({
    currentValue: current.fixLoops.length,
    baselineValue: baseline.fixLoops.length,
    regressions,
    improvements,
    increased: (delta) => `${delta} new fix-loop ${pluralize(delta, 'chain')} (was ${baseline.fixLoops.length} on ${baseline.branch})`,
    decreased: () => `Fix-loop chains reduced: ${baseline.fixLoops.length} -> ${current.fixLoops.length}`
  });

  if (current.fixLoops.length <= baseline.fixLoops.length && current.fixLoops.length === 0) {
    improvements.unshift('No new fix-loop chains');
  }

  if (regressions.length === 0 && improvements.length === 0) {
    improvements.push('No material changes in tracked commit-quality signals');
  }

  return {
    current,
    baseline,
    regressions,
    improvements
  };
}

export function compareBranches(
  options: AnalyzeBranchOptions & { compareBranch: string },
  dependencies: AnalyzerDependencies = defaultDependencies
): ComparisonData {
  const current = analyzeBranch(options, dependencies);
  const baseline = analyzeBranch(
    {
      branch: options.compareBranch,
      days: options.days,
      limit: options.limit,
      cwd: options.cwd
    },
    dependencies
  );

  return compareReports(current, baseline);
}

function pushDeltaMessages(options: {
  currentValue: number;
  baselineValue: number;
  regressions: string[];
  improvements: string[];
  increased: (delta: number) => string;
  decreased: (delta: number) => string;
}): void {
  const delta = options.currentValue - options.baselineValue;

  if (delta > 0) {
    options.regressions.push(options.increased(delta));
  } else if (delta < 0) {
    options.improvements.push(options.decreased(Math.abs(delta)));
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
