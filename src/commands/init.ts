import { confirm, intro, outro, spinner, note, log } from "@clack/prompts";
import path from "path";
import fs from "fs";
import { getCurrentHash, getRecentHistory } from "../core/gitReader.js";
import { readConfigFile, createConfigTemplate } from "../utils/config.js";
import {
  readProjectIdentityFiles,
  readAllSourceFiles,
  getStructurePromptBlock,
} from "../core/fileReader.js";
import { generateArchitecture } from "../core/gemini.js";
import { writeArchitecture } from "../core/writer.js";
import { initializeState } from "../utils/state.js";
import type { ArchieConfig, FileNode } from "../types/index.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function init(repoPath: string): Promise<void> {
  intro("Welcome to Archie! Initializing your project architecture.");

  // ── 1. Git check ──────────────────────────────────────────────────
  let headHash: string;
  try {
    headHash = await getCurrentHash(repoPath);
  } catch {
    log.error("Not a git repository.");
    log.info(
      "Run git init first, make at least one commit, then run archie init.",
    );
    outro("Initialization aborted.");
    return;
  }

  // ── 2. Existing ARCHITECTURE.md check ─────────────────────────────
  if (await fileExists(path.join(repoPath, "ARCHITECTURE.md"))) {
    const overwrite = await confirm({
      message: "ARCHITECTURE.md already exists. Overwrite it?",
    });

    if (!overwrite) {
      log.info("Run archie update to refresh your existing docs instead.");
      outro("Initialization aborted.");
      return;
    }
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
        "then run archie init again.",
      "Action required",
    );
    outro("Initialization paused.");
    return;
  }

  const userConfig = await readConfigFile(repoPath);

  // ── 4. Gather data ────────────────────────────────────────────────
  const gatherSpinner = spinner();
  gatherSpinner.start("Reading codebase...");

  const [identityFiles, sourceFiles, treeString, gitHistory] =
    await Promise.all([
      readProjectIdentityFiles(repoPath),
      readAllSourceFiles(repoPath),
      getStructurePromptBlock(repoPath),
      getRecentHistory(repoPath),
    ]);

  gatherSpinner.stop(`Read ${sourceFiles.length} files`);

  // ── 5. Generate ───────────────────────────────────────────────────
  const genSpinner = spinner();
  genSpinner.start("Generating architecture with Gemini (this takes ~15s)...");

  let architecture: string;
  try {
    architecture = await generateArchitecture({
      userConfig : userConfig?.raw ?? null,
      identityFiles,
      treeString,
      sourceFiles,
      gitHistory,
    });
    genSpinner.stop("Architecture generated");
  } catch (err) {
    genSpinner.stop("Generation failed");
    log.error(`Gemini error: ${(err as Error).message}`);
    outro("Initialization failed.");
    return;
  }

  // ── 6. Write outputs ──────────────────────────────────────────────
  await writeArchitecture(repoPath, architecture);
  await initializeState(repoPath, headHash);

  // ── 7. Done ───────────────────────────────────────────────────────
  outro(
    "Done! ARCHITECTURE.md has been created.\n" +
      "Run archie hook to enable auto-updates on every commit.",
  );
}
