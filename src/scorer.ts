import type { FixLoop, LowInfoSummary, UnstableFile } from './detectors.js';
import type { CommitRecord } from './git.js';

export interface ScoreBreakdown {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  criticalIssues: number;
  warnings: number;
  penalties: {
    wip: number;
    unstable: number;
    fixLoops: number;
    lowInfo: number;
  };
}

export interface ScoreInput {
  wipCommits: CommitRecord[];
  unstableFiles: UnstableFile[];
  fixLoops: FixLoop[];
  lowInfo: LowInfoSummary;
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const wipPenalty = Math.min(input.wipCommits.length * 5, 25);
  const unstablePenalty = Math.min(input.unstableFiles.length * 10, 30);
  const fixLoopPenalty = Math.min(input.fixLoops.length * 5, 20);
  const lowInfoPenalty = input.lowInfo.percentage > 40 ? 20 : input.lowInfo.percentage > 20 ? 10 : 0;
  const score = Math.max(0, 100 - wipPenalty - unstablePenalty - fixLoopPenalty - lowInfoPenalty);

  return {
    score,
    grade: getGrade(score),
    criticalIssues: input.wipCommits.length + input.unstableFiles.length,
    warnings: Number(input.fixLoops.length > 0) + Number(input.lowInfo.percentage > 20),
    penalties: {
      wip: wipPenalty,
      unstable: unstablePenalty,
      fixLoops: fixLoopPenalty,
      lowInfo: lowInfoPenalty
    }
  };
}

export function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) {
    return 'A';
  }
  if (score >= 80) {
    return 'B';
  }
  if (score >= 70) {
    return 'C';
  }
  if (score >= 60) {
    return 'D';
  }
  return 'F';
}
