import { simpleGit } from "simple-git";
import type {
  CommitRange,
  FilesChanged,
  ProcessedCommit,
} from "../types/index.js";

// HELPER //

function parseNameStatus(raw: string): FilesChanged {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const line of raw.split("\n").filter(Boolean)) {
    const parts = line.trim().split(/\t/); // tabs, not spaces
    const status = parts[0];

    if (!status || !parts[1]) continue;

    if (status.startsWith("A")) {
      added.push(parts[1]);
    } else if (status.startsWith("M")) {
      modified.push(parts[1]);
    } else if (status.startsWith("D")) {
      deleted.push(parts[1]);
    } else if (status.startsWith("R")) {
      // R90, R100 etc — parts[1] is old path, parts[2] is new path
      if (parts[1]) deleted.push(parts[1]);
      if (parts[2]) added.push(parts[2]);
    }
  }

  return { added, modified, deleted };
}

async function getFilesForCommit(
  repoPath: string,
  hash: string,
): Promise<FilesChanged> {
  const git = simpleGit(repoPath);

  const raw = await git.raw([
    "diff-tree",
    "--no-commit-id",
    "-r",
    "--name-status",
    "--root", // FIX: handles initial commits that have no parent
    hash,
  ]);

  console.log("diff-tree raw:", JSON.stringify(raw));

  return parseNameStatus(raw);
}

async function batchedPromiseAll<T>(
  items: readonly T[],
  fn: (item: T) => Promise<unknown>,
  batchSize = 10,
): Promise<Awaited<ReturnType<typeof fn>>[]> {
  const results: Awaited<ReturnType<typeof fn>>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// EXPORT // 

export async function getCurrentHash(repoPath: string): Promise<string> {
  try {
    return await simpleGit(repoPath).revparse(["HEAD"]);
  } catch (err) {
    throw new Error(
      `Not a valid git repo at "${repoPath}": ${(err as Error).message}`,
    );
  }
}

export async function getCommitRange(
  repoPath: string,
  from: string,
  to: string,
): Promise<CommitRange> {
  try {
    const git = simpleGit(repoPath);

    // fetch meta data
    const log = await git.log({
      from,
      to,
      format: {
        hash: "%H",
        date: "%ai",
        message: "%s",
      },
    });

    // fetch files changed for each commit in parallel
    const commits: ProcessedCommit[] = (await batchedPromiseAll(
      log.all,
      async (commit) => ({
        hash: commit.hash,
        message: commit.message,
        timestamp: commit.date,
        filesChanged: await getFilesForCommit(repoPath, commit.hash),
      }),
    )) as ProcessedCommit[];

    return { from, to, commits };
  } catch (err) {
    throw new Error(
      `Failed to get commit range "${from}..${to}" in "${repoPath}": ${(err as Error).message}`,
    );
  }
}

export async function getRecentHistory(
  repoPath: string,
  maxCount = 50,
): Promise<ProcessedCommit[]> {
  try {
    const git = simpleGit(repoPath);

    const log = await git.log({
      maxCount,
      format: {
        hash: "%H",
        date: "%ai",
        message: "%s",
      },
    });

    // Parallel batched diff-tree calls per commit
    return (await batchedPromiseAll(log.all, async (commit) => ({
      hash: commit.hash,
      message: commit.message,
      timestamp: commit.date,
      filesChanged: await getFilesForCommit(repoPath, commit.hash),
    }))) as ProcessedCommit[];
  } catch (err) {
    throw new Error(
      `Failed to get history for "${repoPath}": ${(err as Error).message}`,
    );
  }
}

export function getChangedFilesInRange(range: CommitRange): FilesChanged {
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

  for (const commit of range.commits) {
    commit.filesChanged.added.forEach((f) => added.add(f));
    commit.filesChanged.modified.forEach((f) => modified.add(f));
    commit.filesChanged.deleted.forEach((f) => deleted.add(f));
  }

  // Cross-set deduplication — reflect the net state across the range:
  // added then modified  → net added   (remove from modified)
  // added then deleted   → net gone    (remove from both)
  // modified then deleted → net deleted (remove from modified)
  for (const f of added) {
    modified.delete(f);
    deleted.delete(f);
  }
  for (const f of deleted) {
    modified.delete(f);
  }

  return {
    added: [...added],
    modified: [...modified],
    deleted: [...deleted],
  };
}
