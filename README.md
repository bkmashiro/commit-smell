[![npm](https://img.shields.io/npm/v/commit-smell)](https://www.npmjs.com/package/commit-smell) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# commit-smell

`commit-smell` is a CLI that audits git history for commit quality problems and produces a simple scorecard.

## Install

```bash
pnpm add -g commit-smell
```

## Usage

```bash
commit-smell [options]
```

Options:

```text
--branch <name>   Branch to analyze (default: current)
--days <n>        Look back N days (default: 90)
--limit <n>       Max commits to analyze (default: 500)
--fix             Interactively suggest fixes for detected issues
--hook <action>   Install or uninstall commit-msg hook
--json            JSON output
--show-whitespace List whitespace-only commits
--no-fail         Don't exit 1 on issues
```

Examples:

```bash
commit-smell --fix
commit-smell --hook install
commit-smell --hook uninstall
```

## What It Detects

- WIP commits that reached the analyzed branch.
- Whitespace-only commits by checking whether a commit becomes empty when whitespace is ignored.
- Revert instability where the same file is reverted 3 or more times in the lookback window.
- Fix-loop chains where the same file is touched by 5 or more sequential fix-oriented commits.
- Low-information commit messages such as `fix`, `update`, `misc`, or `refactor` with no context.

## Remediation

`commit-smell --fix` keeps the normal analysis report, then offers interactive follow-up actions:

- Show WIP commits so you can manually squash or amend them.
- Generate a `git rebase -i HEAD~N` command that covers the oldest WIP commit in the analyzed range.
- Install a `commit-msg` hook when low-information messages are detected.

`commit-smell --hook install` writes `.git/hooks/commit-msg` and rejects commit messages that are 10 characters or shorter, or bare low-information messages such as `fix`, `update`, `changes`, `misc`, `stuff`, `wip`, and `done`.

## Scoring

Scores start at `100`.

- Each WIP commit: `-5` up to `-25`
- Each unstable file: `-10` up to `-30`
- Each fix-loop: `-5` up to `-20`
- Low-information messages: `-10` above 20%, `-20` above 40%

Grades:

- `90-100` = `A`
- `80-89` = `B`
- `70-79` = `C`
- `60-69` = `D`
- `<60` = `F`
