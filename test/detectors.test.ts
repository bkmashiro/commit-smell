import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFixLoops,
  detectLowInformationMessages,
  detectUnstableFiles,
  detectWipCommits,
  isRevertCommit
} from '../src/detectors.js';
import { calculateScore, getGrade } from '../src/scorer.js';
import type { CommitRecord } from '../src/git.js';

function makeCommit(overrides: Partial<CommitRecord> = {}): CommitRecord {
  return {
    hash: overrides.hash ?? 'abcdef0',
    subject: overrides.subject ?? 'feat: something useful',
    date: overrides.date ?? '2024-03-10',
    body: overrides.body ?? '',
    files: overrides.files ?? ['src/app.ts']
  };
}

test('WIP detection flags WIP subject', () => {
  const commits = [
    makeCommit({ subject: 'WIP: refactor' }),
    makeCommit({ hash: '1234567', subject: 'feat: add auth' })
  ];

  const result = detectWipCommits(commits);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.subject, 'WIP: refactor');
});

test('low-info detection only flags bare generic message', () => {
  const commits = [
    makeCommit({ subject: 'fix' }),
    makeCommit({ hash: '1234567', subject: 'fix: auth token null check' })
  ];

  const result = detectLowInformationMessages(commits);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.subject, 'fix');
});

test('fix-loop detects five sequential fix commits on the same file', () => {
  const commits = Array.from({ length: 5 }, (_, index) =>
    makeCommit({
      hash: `abcde${index}`,
      subject: index === 4 ? 'hotfix' : `fix ${index + 1}`,
      date: `2024-03-0${index + 1}`,
      files: ['src/db.ts']
    })
  );

  const result = detectFixLoops(commits);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.file, 'src/db.ts');
  assert.equal(result[0]?.commits.length, 5);
});

test('fix-loop does not detect four sequential fix commits', () => {
  const commits = Array.from({ length: 4 }, (_, index) =>
    makeCommit({
      hash: `fffff${index}`,
      subject: `fix ${index + 1}`,
      date: `2024-03-0${index + 1}`,
      files: ['src/db.ts']
    })
  );

  const result = detectFixLoops(commits);
  assert.equal(result.length, 0);
});

test('score calculation returns 100 without issues and 75 for five WIPs', () => {
  const base = {
    unstableFiles: [],
    fixLoops: [],
    lowInfo: {
      percentage: 0,
      matches: [],
      offenders: []
    }
  };

  const perfect = calculateScore({
    ...base,
    wipCommits: []
  });
  assert.equal(perfect.score, 100);

  const fiveWips = calculateScore({
    ...base,
    wipCommits: Array.from({ length: 5 }, (_, index) => makeCommit({ hash: `wip${index}`, subject: 'wip' }))
  });
  assert.equal(fiveWips.score, 75);
});

test('low-info detection reports zero percent for empty history', () => {
  const result = detectLowInformationMessages([]);

  assert.equal(result.percentage, 0);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.offenders, []);
});

test('low-info detection aggregates and sorts offenders', () => {
  const commits = [
    makeCommit({ subject: ' update ' }),
    makeCommit({ hash: '1', subject: 'fix' }),
    makeCommit({ hash: '2', subject: 'Update' }),
    makeCommit({ hash: '3', subject: 'misc' }),
    makeCommit({ hash: '4', subject: 'feat: useful context' })
  ];

  const result = detectLowInformationMessages(commits);

  assert.equal(result.percentage, 80);
  assert.deepEqual(result.offenders, [
    { message: 'update', count: 2 },
    { message: 'fix', count: 1 },
    { message: 'misc', count: 1 }
  ]);
});

test('revert detection matches subject and body markers', () => {
  assert.equal(isRevertCommit(makeCommit({ subject: 'Revert "feat: auth"' })), true);
  assert.equal(isRevertCommit(makeCommit({ subject: 'feat: auth', body: 'This reverts commit deadbeef.' })), true);
  assert.equal(isRevertCommit(makeCommit({ subject: 'feat: auth', body: 'normal body' })), false);
});

test('unstable file detection counts repeated revert files once per commit and filters below threshold', () => {
  const commits = [
    makeCommit({ hash: 'r1', subject: 'revert: breakage', files: ['src/a.ts', 'src/a.ts', 'src/b.ts'] }),
    makeCommit({ hash: 'r2', subject: 'feat: work', files: ['src/a.ts'] }),
    makeCommit({ hash: 'r3', subject: 'revert follow-up', files: ['src/b.ts', 'src/a.ts'] }),
    makeCommit({ hash: 'r4', subject: 'chore', body: 'This reverts commit 1234567.', files: ['src/b.ts', 'src/c.ts'] }),
    makeCommit({ hash: 'r5', subject: 'revert final', files: ['src/a.ts'] })
  ];

  const result = detectUnstableFiles(commits);

  assert.deepEqual(result, [
    { file: 'src/a.ts', count: 3 },
    { file: 'src/b.ts', count: 3 }
  ]);
});

test('fix-loop records a loop when a non-fix commit breaks the streak', () => {
  const commits = [
    makeCommit({ hash: '1', subject: 'chore: prep', date: '2024-03-01', files: ['src/api.ts'] }),
    makeCommit({ hash: '2', subject: 'fix 1', date: '2024-03-02', files: ['src/api.ts'] }),
    makeCommit({ hash: '3', subject: 'fix 2', date: '2024-03-03', files: ['src/api.ts'] }),
    makeCommit({ hash: '4', subject: 'fix 3', date: '2024-03-04', files: ['src/api.ts'] }),
    makeCommit({ hash: '5', subject: 'fix 4', date: '2024-03-05', files: ['src/api.ts'] }),
    makeCommit({ hash: '6', subject: 'fix 5', date: '2024-03-06', files: ['src/api.ts'] }),
    makeCommit({ hash: '7', subject: 'feat: stabilize', date: '2024-03-07', files: ['src/api.ts'] })
  ];

  const result = detectFixLoops(commits);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.startDate, '2024-03-06');
  assert.equal(result[0]?.endDate, '2024-03-02');
});

test('fix-loop sorts longer loops ahead of shorter ones', () => {
  const commits = [
    makeCommit({ hash: 'a1', subject: 'fix 1', date: '2024-03-01', files: ['src/z.ts'] }),
    makeCommit({ hash: 'a2', subject: 'fix 2', date: '2024-03-02', files: ['src/z.ts'] }),
    makeCommit({ hash: 'a3', subject: 'fix 3', date: '2024-03-03', files: ['src/z.ts'] }),
    makeCommit({ hash: 'a4', subject: 'fix 4', date: '2024-03-04', files: ['src/z.ts'] }),
    makeCommit({ hash: 'a5', subject: 'fix 5', date: '2024-03-05', files: ['src/z.ts'] }),
    makeCommit({ hash: 'b1', subject: 'fix 1', date: '2024-03-01', files: ['src/a.ts'] }),
    makeCommit({ hash: 'b2', subject: 'fix 2', date: '2024-03-02', files: ['src/a.ts'] }),
    makeCommit({ hash: 'b3', subject: 'fix 3', date: '2024-03-03', files: ['src/a.ts'] }),
    makeCommit({ hash: 'b4', subject: 'fix 4', date: '2024-03-04', files: ['src/a.ts'] }),
    makeCommit({ hash: 'b5', subject: 'fix 5', date: '2024-03-05', files: ['src/a.ts'] }),
    makeCommit({ hash: 'b6', subject: 'fix 6', date: '2024-03-06', files: ['src/a.ts'] })
  ];

  const result = detectFixLoops(commits);

  assert.equal(result.length, 2);
  assert.equal(result[0]?.file, 'src/a.ts');
  assert.equal(result[0]?.commits.length, 6);
  assert.equal(result[1]?.file, 'src/z.ts');
});

test('score calculation applies capped penalties and grade thresholds', () => {
  const result = calculateScore({
    wipCommits: Array.from({ length: 8 }, (_, index) => makeCommit({ hash: `w${index}`, subject: 'wip' })),
    unstableFiles: [
      { file: 'src/a.ts', count: 3 },
      { file: 'src/b.ts', count: 4 },
      { file: 'src/c.ts', count: 5 },
      { file: 'src/d.ts', count: 6 }
    ],
    fixLoops: [
      { file: 'src/a.ts', commits: Array.from({ length: 5 }, () => makeCommit()), startDate: '2024-03-01', endDate: '2024-03-05' },
      { file: 'src/b.ts', commits: Array.from({ length: 5 }, () => makeCommit()), startDate: '2024-03-01', endDate: '2024-03-05' },
      { file: 'src/c.ts', commits: Array.from({ length: 5 }, () => makeCommit()), startDate: '2024-03-01', endDate: '2024-03-05' },
      { file: 'src/d.ts', commits: Array.from({ length: 5 }, () => makeCommit()), startDate: '2024-03-01', endDate: '2024-03-05' },
      { file: 'src/e.ts', commits: Array.from({ length: 5 }, () => makeCommit()), startDate: '2024-03-01', endDate: '2024-03-05' }
    ],
    lowInfo: {
      percentage: 41,
      matches: [],
      offenders: []
    }
  });

  assert.equal(result.score, 5);
  assert.equal(result.grade, 'F');
  assert.equal(result.criticalIssues, 12);
  assert.equal(result.warnings, 2);
  assert.deepEqual(result.penalties, {
    wip: 25,
    unstable: 30,
    fixLoops: 20,
    lowInfo: 20
  });
});

test('grade boundaries map scores to the expected letter', () => {
  assert.equal(getGrade(90), 'A');
  assert.equal(getGrade(80), 'B');
  assert.equal(getGrade(70), 'C');
  assert.equal(getGrade(60), 'D');
  assert.equal(getGrade(59), 'F');
});
