import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBranch, compareReports } from '../src/comparer.js';
import type { ReportData } from '../src/formatter.js';
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
  const commits = overrides.commits ?? [makeCommit()];

  return {
    branch: overrides.branch ?? 'feat/branch',
    totalCommits: overrides.totalCommits ?? commits.length,
    days: overrides.days ?? 90,
    commits,
    wipCommits: overrides.wipCommits ?? [],
    whitespaceOnlyCommits: overrides.whitespaceOnlyCommits ?? [],
    unstableFiles: overrides.unstableFiles ?? [],
    fixLoops: overrides.fixLoops ?? [],
    lowInfo: overrides.lowInfo ?? {
      percentage: 0,
      matches: [],
      offenders: []
    },
    score: overrides.score ?? {
      score: 100,
      grade: 'A',
      criticalIssues: 0,
      warnings: 0,
      penalties: {
        wip: 0,
        unstable: 0,
        fixLoops: 0,
        lowInfo: 0
      }
    }
  };
}

test('analyzeBranch builds a report from injected git data', () => {
  const branchHistories = new Map<string, CommitRecord[]>([
    [
      'feat/new-auth',
      [
        makeCommit({ hash: '1', subject: 'wip', files: ['src/auth.ts'] }),
        makeCommit({ hash: '2', subject: 'fix', files: ['src/auth.ts'] }),
        makeCommit({ hash: '3', subject: 'fix', files: ['src/auth.ts'] }),
        makeCommit({ hash: '4', subject: 'fix', files: ['src/auth.ts'] }),
        makeCommit({ hash: '5', subject: 'fix', files: ['src/auth.ts'] }),
        makeCommit({ hash: '6', subject: 'fix', files: ['src/auth.ts'] }),
        makeCommit({ hash: '7', subject: 'feat: auth polish', files: ['src/ui.ts'] })
      ]
    ]
  ]);

  const report = analyzeBranch(
    {
      days: 30,
      limit: 50
    },
    {
      getCurrentBranch: () => 'feat/new-auth',
      getCommitHistory: ({ branch }) => branchHistories.get(branch) ?? [],
      isWhitespaceOnlyCommit: (hash) => hash === '7'
    }
  );

  assert.equal(report.branch, 'feat/new-auth');
  assert.equal(report.wipCommits.length, 1);
  assert.equal(report.fixLoops.length, 1);
  assert.equal(report.whitespaceOnlyCommits.length, 1);
  assert.equal(report.lowInfo.percentage, 86);
});

test('compareReports highlights regressions and non-regressions', () => {
  const current = makeReport({
    branch: 'feat/new-auth',
    wipCommits: [makeCommit({ hash: 'a', subject: 'wip' }), makeCommit({ hash: 'b', subject: 'WIP: auth' })],
    lowInfo: {
      percentage: 31,
      matches: [makeCommit({ subject: 'fix' })],
      offenders: [{ message: 'fix', count: 1 }]
    },
    score: {
      score: 78,
      grade: 'C',
      criticalIssues: 2,
      warnings: 1,
      penalties: {
        wip: 10,
        unstable: 0,
        fixLoops: 0,
        lowInfo: 10
      }
    }
  });
  const baseline = makeReport({
    branch: 'main',
    lowInfo: {
      percentage: 15,
      matches: [],
      offenders: []
    },
    score: {
      score: 91,
      grade: 'A',
      criticalIssues: 0,
      warnings: 0,
      penalties: {
        wip: 0,
        unstable: 0,
        fixLoops: 0,
        lowInfo: 0
      }
    }
  });

  const result = compareReports(current, baseline);

  assert.deepEqual(result.regressions, [
    '2 new WIP commits (were 0 on main)',
    'Low-info rate increased: 15% -> 31%'
  ]);
  assert.deepEqual(result.improvements, ['No new fix-loop chains']);
});
