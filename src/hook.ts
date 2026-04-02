import { execSync as nodeExecSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HOOK_FILENAME = 'commit-msg';
const BLACKLIST = ['fix', 'update', 'changes', 'misc', 'stuff', 'wip', 'done'] as const;

type ExecSync = typeof nodeExecSync;

export interface HookDependencies {
  cwd?: string;
  execSync?: ExecSync;
  mkdirSync?: typeof mkdirSync;
  writeFileSync?: typeof writeFileSync;
  chmodSync?: typeof chmodSync;
  existsSync?: typeof existsSync;
  rmSync?: typeof rmSync;
}

export interface HookResult {
  hookPath: string;
  relativeHookPath: string;
}

export function generateCommitMsgHookScript(): string {
  const pattern = BLACKLIST.join('|');

  return `#!/bin/sh
set -eu

message_file="$1"
message=$(sed '/^#/d' "$message_file" | tr -d '\\r' | head -n 1 | xargs)

if [ -z "$message" ]; then
  echo "commit-smell: commit message cannot be empty" >&2
  exit 1
fi

if [ \${#message} -le 10 ]; then
  echo "commit-smell: commit message must be longer than 10 characters" >&2
  exit 1
fi

if printf '%s' "$message" | grep -Eiq '^(${pattern})$'; then
  echo "commit-smell: low-information commit message: $message" >&2
  exit 1
fi
`;
}

export function resolveGitHooksDir(cwd = process.cwd(), execSync: ExecSync = nodeExecSync): string {
  return execSync('git rev-parse --git-path hooks', {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function resolveHookPath(cwd: string, hooksDir: string): string {
  return path.isAbsolute(hooksDir) ? path.join(hooksDir, HOOK_FILENAME) : path.join(cwd, hooksDir, HOOK_FILENAME);
}

export function installCommitMsgHook(deps: HookDependencies = {}): HookResult {
  const cwd = deps.cwd ?? process.cwd();
  const execSync = deps.execSync ?? nodeExecSync;
  const mkdir = deps.mkdirSync ?? mkdirSync;
  const write = deps.writeFileSync ?? writeFileSync;
  const chmod = deps.chmodSync ?? chmodSync;

  const hooksDir = resolveGitHooksDir(cwd, execSync);
  const hookPath = resolveHookPath(cwd, hooksDir);

  mkdir(path.dirname(hookPath), { recursive: true });
  write(hookPath, generateCommitMsgHookScript(), { encoding: 'utf8', mode: 0o755 });
  chmod(hookPath, 0o755);

  return {
    hookPath,
    relativeHookPath: path.relative(cwd, hookPath) || HOOK_FILENAME
  };
}

export function uninstallCommitMsgHook(deps: HookDependencies = {}): HookResult {
  const cwd = deps.cwd ?? process.cwd();
  const execSync = deps.execSync ?? nodeExecSync;
  const exists = deps.existsSync ?? existsSync;
  const remove = deps.rmSync ?? rmSync;

  const hooksDir = resolveGitHooksDir(cwd, execSync);
  const hookPath = resolveHookPath(cwd, hooksDir);

  if (exists(hookPath)) {
    remove(hookPath);
  }

  return {
    hookPath,
    relativeHookPath: path.relative(cwd, hookPath) || HOOK_FILENAME
  };
}
