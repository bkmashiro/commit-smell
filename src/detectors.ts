import type { CommitRecord } from './git.js';

export interface FixLoop {
  file: string;
  commits: CommitRecord[];
  startDate: string;
  endDate: string;
}

export interface UnstableFile {
  file: string;
  count: number;
}

export interface LowInfoSummary {
  percentage: number;
  matches: CommitRecord[];
  offenders: Array<{ message: string; count: number }>;
}

const LOW_INFO_MESSAGES = new Set([
  'fix',
  'update',
  'changes',
  'misc',
  'stuff',
  'wip',
  'done',
  'cleanup',
  'refactor'
]);

const FIX_SUBJECT_RE = /fix/i;
const WIP_SUBJECT_RE = /(^wip\b|^wip$|\bWIP\b)/i;

export function isWipSubject(subject: string): boolean {
  return WIP_SUBJECT_RE.test(subject.trim());
}

export function detectWipCommits(commits: CommitRecord[]): CommitRecord[] {
  return commits.filter((commit) => isWipSubject(commit.subject));
}

export function isLowInformationSubject(subject: string): boolean {
  return LOW_INFO_MESSAGES.has(subject.trim().toLowerCase());
}

export function detectLowInformationMessages(commits: CommitRecord[]): LowInfoSummary {
  const matches = commits.filter((commit) => isLowInformationSubject(commit.subject));
  const counts = new Map<string, number>();

  for (const commit of matches) {
    const key = commit.subject.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const offenders = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([message, count]) => ({ message, count }));

  return {
    percentage: commits.length === 0 ? 0 : Math.round((matches.length / commits.length) * 100),
    matches,
    offenders
  };
}

export function isRevertCommit(commit: CommitRecord): boolean {
  return /^revert\b/i.test(commit.subject) || /This reverts commit /i.test(commit.body);
}

export function detectUnstableFiles(commits: CommitRecord[]): UnstableFile[] {
  const counts = new Map<string, number>();

  for (const commit of commits) {
    if (!isRevertCommit(commit)) {
      continue;
    }

    for (const file of new Set(commit.files)) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([file, count]) => ({ file, count }));
}

export function detectFixLoops(commits: CommitRecord[]): FixLoop[] {
  const chronological = [...commits].reverse();
  const files = new Set(chronological.flatMap((commit) => commit.files));
  const loops: FixLoop[] = [];

  for (const file of files) {
    let streak: CommitRecord[] = [];

    for (const commit of chronological) {
      const touchesFile = commit.files.includes(file);
      const isFix = FIX_SUBJECT_RE.test(commit.subject);

      if (touchesFile && isFix) {
        streak.push(commit);
        continue;
      }

      if (streak.length >= 5) {
        loops.push({
          file,
          commits: [...streak],
          startDate: streak[0].date,
          endDate: streak[streak.length - 1].date
        });
      }

      streak = [];
    }

    if (streak.length >= 5) {
      loops.push({
        file,
        commits: [...streak],
        startDate: streak[0].date,
        endDate: streak[streak.length - 1].date
      });
    }
  }

  return loops.sort((left, right) => right.commits.length - left.commits.length || left.file.localeCompare(right.file));
}
