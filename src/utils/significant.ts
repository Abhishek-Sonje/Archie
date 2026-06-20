import type { CommitRange, ArchieState } from "../types/index.js";

export default function isSignificant(
  commitRange: CommitRange,
  archieState: ArchieState,
): boolean {
  if (commitRange.commits.length === 0) {
    return false;
  }

  if (commitRange.to === archieState.lastProcessedCommit) {
    return false;
  }

  const allChangedFiles = commitRange.commits.flatMap((commit) => [
    ...commit.filesChanged.added,
    ...commit.filesChanged.modified,
    ...commit.filesChanged.deleted,
  ]);

  const uniqueChangedFiles = [...new Set(allChangedFiles)];

  const SIGNIFICANCE_RULES = [
    (files: string[]) => files.includes("package.json"),
    (files: string[]) => files.includes("archie.config.md"),
    (files: string[]) => files.some((f) => f.includes("schema")),
    (files: string[]) => files.some((f) => f.includes("migration")),
    (files: string[]) => files.some((f) => f.includes("model")),
    (files: string[]) => files.length >= 5,
  ];

  return SIGNIFICANCE_RULES.some((rule) => rule(uniqueChangedFiles));
}
