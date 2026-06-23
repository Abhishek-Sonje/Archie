import { intro, outro, spinner, note, log } from "@clack/prompts";
import path from "path";
import fs from "fs";
import {
  getChangedFilesInRange,
  getCommitRange,
  getCurrentHash,
} from "../core/gitReader.js";
import { readConfigFile, createConfigTemplate } from "../utils/config.js";
import {
  readAllSourceFiles,
  readNeighborFiles,
  readChangedFiles,
} from "../core/fileReader.js";
import { updateArchitecture } from "../core/gemini.js";
import { readExistingArchitecture, writeArchitecture } from "../core/writer.js";
import {
  readState,
  updateState,
} from "../utils/state.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getRange(repoPath: string): Promise<[string, string]> {
  const state = await readState(repoPath);
  const headHash = await getCurrentHash(repoPath);
  if (!state) {
    throw new Error("State not found. Run archie init first.");
  }
  return [state.lastProcessedCommit, headHash];
}

export async function update(repoPath: string): Promise<void> {
  intro("Updating your project architecture.");

  // ── 1. Git check ──────────────────────────────────────────────────
  let headHash: string;
  try {
    headHash = await getCurrentHash(repoPath);
  } catch {
    log.error("Not a git repository.");
    log.info(
      "Run git init first, make at least one commit, then run archie update.",
    );
    outro("Update aborted.");
    return;
  }

  // ── 2. Existing ARCHITECTURE.md check ─────────────────────────────
  if (!(await fileExists(path.join(repoPath, "ARCHITECTURE.md")))) {
    log.error("ARCHITECTURE.md not found.");
    log.info("Run archie init first to create the architecture file.");
    outro("Update aborted.");
    return;
  }

  // ── 3. Config check ───────────────────────────────────────────────
  const configExists = await fileExists(
    path.join(repoPath, "archie.config.md"),
  );

  if (!configExists) {
    await createConfigTemplate(repoPath);
    note(
      "archie.config.md has been created.\n" +
        "Fill it in with context about your project,\n" +
        "then run archie update again.",
      "Action required",
    );
    outro("Update paused.");
    return;
  }

  const userConfig = await readConfigFile(repoPath);

  // ── 4. Gather data ────────────────────────────────────────────────
  const gatherSpinner = spinner();
  gatherSpinner.start("Reading codebase...");

  let from, to;
  try {
    [from, to] = await getRange(repoPath);
  } catch (err) {
    note("Archie state is missing , run archie init first.");
    gatherSpinner.stop();
    return;
  }
  const commitRange = await getCommitRange(repoPath, from, to);
  if (commitRange.commits.length === 0) {
    log.info("No new commits since last update. Nothing to do.");
    gatherSpinner.stop();
    return;
  }
  const changedFilePaths = getChangedFilesInRange(commitRange);
  const changedFiles = await readChangedFiles(repoPath, changedFilePaths);
  const allSourceFiles = await readAllSourceFiles(repoPath);
  const neighborFiles = await readNeighborFiles(
    changedFilePaths,
    allSourceFiles,
  );

  const existingArchitecture = await readExistingArchitecture(repoPath);

  gatherSpinner.stop(`Read ${allSourceFiles.length} files`);

  // ── 5. Generate ───────────────────────────────────────────────────
  const genSpinner = spinner();
  genSpinner.start("Generating architecture with Gemini (this takes ~15s)...");

  let architecture: string;
  try {
    architecture = await updateArchitecture({
      userConfig: userConfig?.raw ?? null,
      existingArchitecture: existingArchitecture || " ",
      commitRange,
      changedFiles,
      neighborFiles,
    });
    genSpinner.stop("Architecture generated");
  } catch (err) {
    genSpinner.stop("Generation failed");
    log.error(`Gemini error: ${(err as Error).message}`);
    outro("Update failed.");
    return;
  }

  // ── 6. Write outputs ──────────────────────────────────────────────
  await writeArchitecture(repoPath, architecture);
  await updateState(repoPath, headHash);

  // ── 7. Done ───────────────────────────────────────────────────────
  outro(
    "Done! ARCHITECTURE.md has been updated.\n" +
      "Run archie hook to enable auto-updates on every commit.",
  );
}
