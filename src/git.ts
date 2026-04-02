import { execSync } from 'node:child_process';

export interface CommitRecord {
  hash: string;
  subject: string;
  date: string;
  body: string;
  files: string[];
}

const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';

function runGit(args: string[], cwd = process.cwd()): string {
  return execSync(`git ${args.join(' ')}`, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

export function getCurrentBranch(cwd = process.cwd()): string {
  try {
    return runGit(['symbolic-ref', '--short', 'HEAD'], cwd);
  } catch {
    return 'HEAD';
  }
}

export function getCommitHistory(options: {
  branch: string;
  days: number;
  limit: number;
  cwd?: string;
}): CommitRecord[] {
  const { branch, days, limit, cwd } = options;
  const format = ['%H', '%s', '%cs', '%b'].join(FIELD_SEPARATOR) + RECORD_SEPARATOR;
  let output = '';

  try {
    output = runGit([
      'log',
      quoteArg(branch),
      `--since=${quoteArg(`${days} days ago`)}`,
      `--max-count=${limit}`,
      `--date=short`,
      `--pretty=format:${format}`
    ], cwd);
  } catch {
    return [];
  }

  if (!output) {
    return [];
  }

  return output
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', subject = '', date = '', ...bodyParts] = entry.split(FIELD_SEPARATOR);
      const body = bodyParts.join(FIELD_SEPARATOR).trim();

      return {
        hash,
        subject,
        date,
        body,
        files: getFilesForCommit(hash, cwd)
      };
    });
}

export function isWhitespaceOnlyCommit(hash: string, cwd = process.cwd()): boolean {
  try {
    const diff = runGit([
      'diff',
      '--diff-filter=M',
      '-w',
      `${quoteArg(`${hash}^..${hash}`)}`
    ], cwd);

    return diff.length === 0;
  } catch {
    return false;
  }
}

export function getFilesForCommit(hash: string, cwd = process.cwd()): string[] {
  const output = runGit([
    'show',
    '--pretty=format:',
    '--name-only',
    quoteArg(hash)
  ], cwd);

  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
