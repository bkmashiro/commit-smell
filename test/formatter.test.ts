import test from 'node:test';
import assert from 'node:assert/strict';
import { formatComparison, formatReportOutput, type ReportData } from '../src/formatter.js';
import type { CommitRecord } from '../src/git.js';

function makeCommit(overrides: Partial<CommitRecord> = {}): CommitRecord {
  return {
    hash: overrides.hash ?? 'abcdef0',
    subject: overrides.subject ?? 'feat: useful change',
    date: overrides.date ?? '2024-03-10',
    body: overrides.body ?? '',
    files: overrides.files ?? ['src/app.ts']
  };
}

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  const commits = overrides.commits ?? [makeCommit({ hash: 'aaaaaaa' }), makeCommit({ hash: 'bbbbbbb', subject: 'wip' })];

  return {
    branch: overrides.branch ?? 'main',
    totalCommits: overrides.totalCommits ?? commits.length,
    days: overrides.days ?? 90,
    commits,
    wipCommits: overrides.wipCommits ?? [commits[1]!],
    whitespaceOnlyCommits: overrides.whitespaceOnlyCommits ?? [],
    unstableFiles: overrides.unstableFiles ?? [],
    fixLoops: overrides.fixLoops ?? [
      {
        file: 'src/app.ts',
        commits: Array.from({ length: 5 }, (_, index) => makeCommit({ hash: `fix${index}`, subject: `fix ${index + 1}` })),
        startDate: '2024-03-01',
        endDate: '2024-03-05'
      }
    ],
    lowInfo: overrides.lowInfo ?? {
      percentage: 50,
      matches: [commits[1]!],
      offenders: [{ message: 'wip', count: 1 }]
    },
    score: overrides.score ?? {
      score: 75,
      grade: 'C',
      criticalIssues: 1,
      warnings: 2,
      penalties: {
        wip: 5,
        unstable: 0,
        fixLoops: 5,
        lowInfo: 20
      }
    }
  };
}

test('formatReportOutput renders markdown report sections', () => {
  const output = formatReportOutput(makeReport(), 'markdown');

  assert.match(output, /# commit-smell report: main/);
  assert.match(output, /\| Score \| 75\/100 \(C\) \|/);
  assert.match(output, /## WIP commits/);
  assert.match(output, /## Fix-loop chains/);
  assert.match(output, /## Recommendations/);
});

test('formatReportOutput renders structured json report', () => {
  const output = formatReportOutput(makeReport(), 'json');
  const parsed = JSON.parse(output) as { summary: { wipCommits: number }; recommendations: string[] };

  assert.equal(parsed.summary.wipCommits, 1);
  assert.equal(parsed.recommendations.length > 0, true);
});

test('formatReportOutput renders html report', () => {
  const output = formatReportOutput(makeReport(), 'html', { showWhitespace: true });

  assert.match(output, /<!doctype html>/i);
  assert.match(output, /<h1>commit-smell report: main<\/h1>/);
  assert.match(output, /<h2>Recommendations<\/h2>/);
});

test('formatComparison renders side-by-side branch scores', () => {
  const output = formatComparison({
    current: makeReport({
      branch: 'feat/new-auth',
      score: {
        score: 78,
        grade: 'C',
        criticalIssues: 2,
        warnings: 1,
        penalties: { wip: 10, unstable: 0, fixLoops: 0, lowInfo: 10 }
      }
    }),
    baseline: makeReport({
      branch: 'main',
      score: {
        score: 91,
        grade: 'A',
        criticalIssues: 0,
        warnings: 0,
        penalties: { wip: 0, unstable: 0, fixLoops: 0, lowInfo: 0 }
      }
    }),
    regressions: ['2 new WIP commits (were 0 on main)'],
    improvements: ['No new fix-loop chains']
  });

  assert.match(output, /Comparing current branch vs main/);
  assert.match(output, /Current branch \(feat\/new-auth\)/);
  assert.match(output, /main branch/);
  assert.match(output, /2 new WIP commits/);
  assert.match(output, /No new fix-loop chains/);
});
