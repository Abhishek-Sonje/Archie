import path from "path";
import fs from "fs";
import { getCurrentHash, getCommitRange, getChangedFilesInRange } from "../core/gitReader.js";
import { readState, updateState } from "../utils/state.js";
import isSignificant from "../utils/significant.js";
import { createConfigTemplate, readConfigFile} from "../utils/config.js";
import { readAllSourceFiles, readChangedFiles, readNeighborFiles } from "../core/fileReader.js";
import { readExistingArchitecture, writeArchitecture } from "../core/writer.js";
import { updateArchitecture } from "../core/gemini.js";


async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function installHook(repoPath: string): Promise<void> {
  const gitHookDir = path.join(repoPath, ".git", "hooks");
  await fs.promises.mkdir(gitHookDir, { recursive: true });

  const hookFilePath = path.join(gitHookDir, "post-commit");
  const hookLine = "npx archie run-hook";

  // Check if hook already exists
  try {
    const existing = await fs.promises.readFile(hookFilePath, "utf-8");

    if (existing.includes("archie run-hook")) {
      console.log("Archie hook already installed.");
      return;
    }

    // Append to existing hook — don't overwrite
    await fs.promises.writeFile(
      hookFilePath,
      `${existing.trimEnd()}\n${hookLine}\n`,
      "utf-8",
    );
  } catch {
    // Hook doesn't exist — create fresh
    await fs.promises.writeFile(
      hookFilePath,
      `#!/bin/sh\n${hookLine}\n`,
      "utf-8",
    );
  }

  await fs.promises.chmod(hookFilePath, 0o755);
  console.log("✓ Archie hook installed.");
}


export async function runHook(repoPath: string): Promise<void> {
  // Silent exits — hook runs after every commit, must never crash or spam
  const state = await readState(repoPath);
  if (!state) return;

  let headHash: string;
  try {
    headHash = await getCurrentHash(repoPath);
  } catch {
    return;
  }

  if (headHash === state.lastProcessedCommit) return;

  if (!(await fileExists(path.join(repoPath, "ARCHITECTURE.md")))) return;

  const commitRange = await getCommitRange(
    repoPath,
    state.lastProcessedCommit,
    headHash,
  );
  if (commitRange.commits.length === 0) return;

  // Always advance the pointer
  if (!isSignificant(commitRange, state)) {
    await updateState(repoPath, headHash);
    return;
  }

  const config = await readConfigFile(repoPath);
  const changedFilePaths = getChangedFilesInRange(commitRange);
  const [changedFiles, allSourceFiles, existingArchitecture] =
    await Promise.all([
      readChangedFiles(repoPath, changedFilePaths),
      readAllSourceFiles(repoPath),
      readExistingArchitecture(repoPath),
    ]);

  const neighborFiles = await readNeighborFiles(
    changedFilePaths,
    allSourceFiles,
  );

  let architecture: string;
  try {
    architecture = await updateArchitecture({
      userConfig: config?.raw ?? null,
      existingArchitecture: existingArchitecture ?? " ",
      commitRange,
      changedFiles,
      neighborFiles,
    });
  } catch {
    return; // Silent fail — don't interrupt the commit
  }

  await writeArchitecture(repoPath, architecture);
  await updateState(repoPath, headHash);
  console.log("✓ Archie updated ARCHITECTURE.md");
}
