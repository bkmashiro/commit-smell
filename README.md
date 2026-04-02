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
--json            JSON output
--show-whitespace List whitespace-only commits
--no-fail         Don't exit 1 on issues
```

## What It Detects

- WIP commits that reached the analyzed branch.
- Whitespace-only commits by checking whether a commit becomes empty when whitespace is ignored.
- Revert instability where the same file is reverted 3 or more times in the lookback window.
- Fix-loop chains where the same file is touched by 5 or more sequential fix-oriented commits.
- Low-information commit messages such as `fix`, `update`, `misc`, or `refactor` with no context.

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
