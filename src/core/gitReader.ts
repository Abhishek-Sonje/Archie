import { simpleGit, type DefaultLogFields, type ListLogLine } from "simple-git";
import type {
  CommitRange,
  FilesChanged,
  ProcessedCommit,
} from "../types/index.js";

function parseCommitBody(commit: {
  hash: string;
  date: string;
  message: string;
  body: string;
}): FilesChanged {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  if (!commit.body) return { added, modified, deleted };

  const lines = commit.body.split("\n").filter(Boolean);

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const status = parts[0];
    const filePath = parts[1];

    if (!status || !filePath) continue;

    if (status.startsWith("A")) {
      added.push(filePath);
    } else if (status.startsWith("M")) {
      modified.push(filePath);
    } else if (status.startsWith("D")) {
      deleted.push(filePath);
    } else if (status.startsWith("R")) {
      const oldPath = parts[1];
      const newPath = parts[2];
      if (oldPath) deleted.push(oldPath);
      if (newPath) added.push(newPath);
    }
  }

  return { added, modified, deleted };
}

// Now both functions use it cleanly
function formatCommit(commit: {
  hash: string;
  date: string;
  message: string;
  body: string;
}): ProcessedCommit {
  return {
    hash: commit.hash,
    message: commit.message,
    timestamp: commit.date,
    filesChanged: parseCommitBody(commit),
  };
}

export async function getCurrentHash(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  return await git.revparse(["HEAD"]);
}

export async function getCommitRange(
  repoPath: string,
  from: string,
  to: string,
): Promise<CommitRange> {
  const git = simpleGit(repoPath);

  const log = await git.log({
    from: from,
    to: to,
    // Define a custom format for the commit metadata, leaving the files to the body
    format: {
      hash: "%H",
      date: "%ai",
      message: "%s",
      body: "%b",
    },
    // This forces git to append the raw 'A', 'M', 'D' statuses to the output
    "--name-status": null,
  });

  const formattedCommits = log.all.map(formatCommit);

  return {
    from,
    to,
    commits: formattedCommits,
  };
}

export async function getFullHistory(
  repoPath: string,
): Promise<ProcessedCommit[]> {
  const git = simpleGit(repoPath);
  const log = await git.log({
    maxCount: 50,
    format: {
      hash: "%H",
      date: "%ai",
      message: "%s",
      body: "%b",
    },
    "--name-status": null,
  });

  const formattedCommits = log.all.map(formatCommit);

  return formattedCommits;
}

export function getChangedFilesInRange(range: CommitRange): FilesChanged {
  const added = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

  for (const commit of range.commits) {
    commit.filesChanged.added.forEach((file) => added.add(file));
    commit.filesChanged.modified.forEach((file) => modified.add(file));
    commit.filesChanged.deleted.forEach((file) => deleted.add(file));
  }

  return {
    added: [...added],
    modified: [...modified],
    deleted: [...deleted],
  };
}
