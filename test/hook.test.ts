import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCommitMsgHookScript, installCommitMsgHook, uninstallCommitMsgHook } from '../src/hook.js';

test('generateCommitMsgHookScript enforces length and low-info blacklist', () => {
  const script = generateCommitMsgHookScript();

  assert.match(script, /longer than 10 characters/);
  assert.match(script, /\^\(fix\|update\|changes\|misc\|stuff\|wip\|done\)\$/);
  assert.match(script, /sed '\/\^#\/d'/);
});

test('installCommitMsgHook writes an executable hook into the git hooks directory', () => {
  const writes: Array<{ path: string; content: string; options: { encoding: string; mode: number } }> = [];
  const mkdirs: Array<{ path: string; options: { recursive: boolean } }> = [];
  const chmods: Array<{ path: string; mode: number }> = [];

  const result = installCommitMsgHook({
    cwd: '/repo',
    execSync() {
      return '.git/hooks';
    },
    mkdirSync(path, options) {
      mkdirs.push({ path: String(path), options: options as { recursive: boolean } });
      return undefined;
    },
    writeFileSync(path, content, options) {
      writes.push({
        path: String(path),
        content: String(content),
        options: options as { encoding: string; mode: number }
      });
    },
    chmodSync(path, mode) {
      chmods.push({ path: String(path), mode });
    }
  });

  assert.equal(result.relativeHookPath, '.git/hooks/commit-msg');
  assert.deepEqual(mkdirs, [{ path: '/repo/.git/hooks', options: { recursive: true } }]);
  assert.equal(writes[0]?.path, '/repo/.git/hooks/commit-msg');
  assert.match(writes[0]?.content ?? '', /commit-smell: low-information commit message/);
  assert.deepEqual(chmods, [{ path: '/repo/.git/hooks/commit-msg', mode: 0o755 }]);
});

test('uninstallCommitMsgHook removes the hook when it exists', () => {
  const removed: string[] = [];

  const result = uninstallCommitMsgHook({
    cwd: '/repo',
    execSync() {
      return '.git/hooks';
    },
    existsSync(path) {
      assert.equal(String(path), '/repo/.git/hooks/commit-msg');
      return true;
    },
    rmSync(path) {
      removed.push(String(path));
    }
  });

  assert.equal(result.relativeHookPath, '.git/hooks/commit-msg');
  assert.deepEqual(removed, ['/repo/.git/hooks/commit-msg']);
});
