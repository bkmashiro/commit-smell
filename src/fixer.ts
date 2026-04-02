import readline from 'node:readline/promises';
import type { ReportData } from './formatter.js';
import { installCommitMsgHook, type HookResult } from './hook.js';

export interface FixerIo {
  prompt(question: string): Promise<string>;
  write(text: string): void;
  close?(): void;
}

export interface FixerDependencies {
  cwd?: string;
  io?: FixerIo;
  installHook?: (options?: { cwd?: string }) => HookResult;
}

export function createFixerIo(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): FixerIo {
  const rl = readline.createInterface({ input, output });

  return {
    async prompt(question: string): Promise<string> {
      const answer = await rl.question(question);
      return answer.trim();
    },
    write(text: string): void {
      output.write(text);
    },
    close(): void {
      rl.close();
    }
  };
}

export function getSuggestedRebaseCommand(report: ReportData): string | null {
  if (report.wipCommits.length === 0) {
    return null;
  }

  const wipHashes = new Set(report.wipCommits.map((commit) => commit.hash));
  const furthestIndex = report.commits.reduce((maxIndex, commit, index) => {
    return wipHashes.has(commit.hash) ? index : maxIndex;
  }, -1);

  if (furthestIndex === -1) {
    return null;
  }

  return `git rebase -i HEAD~${furthestIndex + 1}`;
}

async function chooseWipAction(io: FixerIo): Promise<'show' | 'rebase' | 'skip'> {
  for (;;) {
    const answer = (await io.prompt('\n> ')).toLowerCase();

    if (answer === '1') {
      return 'show';
    }
    if (answer === '2') {
      return 'rebase';
    }
    if (answer === '3' || answer === '') {
      return 'skip';
    }
  }
}

async function shouldGenerateHook(io: FixerIo): Promise<boolean> {
  for (;;) {
    const answer = (await io.prompt('  Generate hook? [y/n] ')).toLowerCase();

    if (answer === 'y' || answer === 'yes') {
      return true;
    }
    if (answer === 'n' || answer === 'no' || answer === '') {
      return false;
    }
  }
}

function formatWipList(report: ReportData): string {
  return report.wipCommits
    .map((commit) => `  ${commit.hash.slice(0, 7)}  ${JSON.stringify(commit.subject)}  (${commit.date})`)
    .join('\n');
}

export async function runFixMode(report: ReportData, deps: FixerDependencies = {}): Promise<void> {
  const io = deps.io ?? createFixerIo();
  const installHook = deps.installHook ?? ((options?: { cwd?: string }) => installCommitMsgHook(options));

  try {
    if (report.wipCommits.length > 0) {
      io.write(`\nFound ${report.wipCommits.length} WIP commits. Options:\n`);
      io.write('  1. Show them (to manually squash/amend)\n');
      io.write('  2. Generate git rebase command to squash them\n');
      io.write('  3. Skip\n');

      const action = await chooseWipAction(io);

      if (action === 'show') {
        io.write(`${formatWipList(report)}\n`);
      } else if (action === 'rebase') {
        const command = getSuggestedRebaseCommand(report);
        if (command) {
          io.write('Run this to squash WIP commits:\n');
          io.write(`  ${command}\n`);
          io.write("  (mark wip commits as 'fixup' or 'squash')\n");
        }
      }
    }

    if (report.lowInfo.matches.length > 0) {
      io.write(`\nFound ${report.lowInfo.percentage}% low-info commits. Suggestion:\n`);
      io.write('  Add a git commit-msg hook to enforce format.\n');

      if (await shouldGenerateHook(io)) {
        const result = installHook({ cwd: deps.cwd });
        io.write(`  ✓ Written to ${result.relativeHookPath}\n`);
      }
    }
  } finally {
    io.close?.();
  }
}
