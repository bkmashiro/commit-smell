import test from 'node:test';
import assert from 'node:assert/strict';
import { getSuggestedRebaseCommand, runFixMode, type FixerIo } from '../src/fixer.js';
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
  const commits = overrides.commits ?? [
    makeCommit({ hash: 'aaaaaaa', subject: 'feat: latest change' }),
    makeCommit({ hash: 'bbbbbbb', subject: 'WIP: middle change' }),
    makeCommit({ hash: 'ccccccc', subject: 'feat: older change' }),
    makeCommit({ hash: 'ddddddd', subject: 'wip' })
  ];

  return {
    branch: overrides.branch ?? 'main',
    totalCommits: overrides.totalCommits ?? commits.length,
    days: overrides.days ?? 90,
    commits,
    wipCommits: overrides.wipCommits ?? [commits[1]!, commits[3]!],
    whitespaceOnlyCommits: overrides.whitespaceOnlyCommits ?? [],
    unstableFiles: overrides.unstableFiles ?? [],
    fixLoops: overrides.fixLoops ?? [],
    lowInfo: overrides.lowInfo ?? {
      percentage: 25,
      matches: [commits[3]!],
      offenders: [{ message: 'wip', count: 1 }]
    },
    score: overrides.score ?? {
      score: 85,
      grade: 'B',
      criticalIssues: 2,
      warnings: 1,
      penalties: {
        wip: 10,
        unstable: 0,
        fixLoops: 0,
        lowInfo: 10
      }
    }
  };
}

function createIo(answers: string[]) {
  const prompts: string[] = [];
  const writes: string[] = [];
  let index = 0;

  const io: FixerIo = {
    async prompt(question: string): Promise<string> {
      prompts.push(question);
      return answers[index++] ?? '';
    },
    write(text: string): void {
      writes.push(text);
    }
  };

  return { io, prompts, writes };
}

test('getSuggestedRebaseCommand uses the furthest WIP commit depth', () => {
  const report = makeReport();

  assert.equal(getSuggestedRebaseCommand(report), 'git rebase -i HEAD~4');
});

test('runFixMode prints a rebase suggestion and installs hook when confirmed', async () => {
  const report = makeReport();
  const { io, prompts, writes } = createIo(['2', 'y']);
  const installs: Array<{ cwd?: string }> = [];

  await runFixMode(report, {
    cwd: '/repo',
    io,
    installHook(options) {
      installs.push(options ?? {});
      return {
        hookPath: '/repo/.git/hooks/commit-msg',
        relativeHookPath: '.git/hooks/commit-msg'
      };
    }
  });

  assert.deepEqual(prompts, ['\n> ', '  Generate hook? [y/n] ']);
  assert.match(writes.join(''), /Found 2 WIP commits/);
  assert.match(writes.join(''), /git rebase -i HEAD~4/);
  assert.match(writes.join(''), /Written to \.git\/hooks\/commit-msg/);
  assert.deepEqual(installs, [{ cwd: '/repo' }]);
});

test('runFixMode can show WIP commits and skip hook installation', async () => {
  const report = makeReport({
    lowInfo: {
      percentage: 34,
      matches: [makeCommit({ hash: 'eeeeeee', subject: 'fix' })],
      offenders: [{ message: 'fix', count: 1 }]
    }
  });
  const { io, writes } = createIo(['1', 'n']);

  await runFixMode(report, {
    io,
    installHook() {
      assert.fail('installHook should not be called when the user declines');
    }
  });

  assert.match(writes.join(''), /bbbbbbb/);
  assert.match(writes.join(''), /ddddddd/);
  assert.doesNotMatch(writes.join(''), /Written to/);
});
