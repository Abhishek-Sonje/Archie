import type { ArchieState } from "../types/index.js";
import path from "path";
import * as fs from "fs";

function getStatePath(repoPath: string): string {
  return path.join(repoPath, ".git", "archie", "state.json");
}

function getStateDir(repoPath: string): string {
  return path.join(repoPath, ".git", "archie");
}

function isValidState(obj: unknown): obj is ArchieState {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "lastProcessedCommit" in obj &&
    "initialized" in obj &&
    "totalRuns" in obj &&
    "lastUpdated" in obj
  );
}

export async function readState(repoPath: string): Promise<ArchieState | null> {
  try {
    const stateData = await fs.promises.readFile(
      getStatePath(repoPath),
      "utf-8",
    );
    const parsed = JSON.parse(stateData);

    if (!isValidState(parsed)) {
      console.error("State file corrupted. Run archie init again.");
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

export async function writeState(
  repoPath: string,
  state: ArchieState,
): Promise<void> {
  const statePath = getStatePath(repoPath);
  await fs.promises.mkdir(getStateDir(repoPath), { recursive: true });
  await fs.promises.writeFile(
    statePath,
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

export async function initializeState(
  repoPath: string,
  commitHash: string,
): Promise<ArchieState | null> {
  const state: ArchieState = {
    lastProcessedCommit: commitHash,
    lastUpdated: new Date().toISOString(),
    totalRuns: 0,
    initialized: true,
  };
  await writeState(repoPath, state);
  return state;
}

export async function updateState(
  repoPath: string,
  newCommitHash: string,
): Promise<void> {
  const existing = await readState(repoPath)
  if (!existing) throw new Error('No state found. Run archie init first.')
  
  await writeState(repoPath, {
    ...existing,
    lastProcessedCommit: newCommitHash,
    lastUpdated: new Date().toISOString(),
    totalRuns: existing.totalRuns + 1,
  })
}

