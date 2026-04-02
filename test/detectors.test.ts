import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFixLoops, detectLowInformationMessages, detectWipCommits } from '../src/detectors.js';
import { calculateScore } from '../src/scorer.js';
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
