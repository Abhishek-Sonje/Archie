import path from "path";
import type { ArchieConfig } from "../types/index.js";
import fs from "fs";

const TEMPLATE_CONTENT = `# Archie Configuration

## Project Description

Describe the project in plain English.

* What is the project?
* Who uses it?
* What problem does it solve?
* Important business goals and requirements.

## Key Decisions

Document architectural and technical decisions that Archie should preserve.

Examples:

* Backend framework and architecture.
* Authentication strategy.
* Database choice.
* API design conventions.
* State management approach.
* Deployment strategy.

## Things To Track

List changes Archie should automatically monitor and document.

Examples:

* New API endpoints.
* Database schema changes.
* Environment variables.
* New services or integrations.
* Dependency additions/removals.
* Build configuration changes.

## Never Change

Sections, files, or decisions that Archie must never modify automatically.

Examples:

* Authentication flow.
* Security-sensitive code.
* Manually maintained documentation.
* Core business logic.
* Specific folders or files.

## Stack Context

Additional context that may not be obvious from the codebase.

Examples:

* Internal libraries.
* Private npm packages.
* Custom tooling.
* External services.
* Non-standard project conventions.
* Important infrastructure details.

## Notes

Optional section for additional instructions, constraints, or future plans.`;

function parseConfigMarkdown(content: string): ArchieConfig {
  // Split on any ## heading
  const sections = content.split(/^## /m);

  // Build a map of heading → content, case-insensitive
  const sectionMap = new Map<string, string>();

  for (const section of sections) {
    if (!section.trim()) continue;

    const newlineIndex = section.indexOf("\n");
    if (newlineIndex === -1) continue;

    const heading = section.slice(0, newlineIndex).trim().toLowerCase();
    const body = section.slice(newlineIndex + 1).trim();

    sectionMap.set(heading, body);
  }

  // Extract by normalized heading name — no order dependency
  return {
    projectDescription: sectionMap.get("project description") ?? null,
    keyDecisions: sectionMap.get("key decisions") ?? null,
    thingsToTrack: sectionMap.get("things to track") ?? null,
    neverChange: sectionMap.get("never change") ?? null,
    stackContext: sectionMap.get("stack context") ?? null,
    raw: content, // always store full content
  };
}
// CORRECT
export async function readConfigFile(
  repoPath: string,
): Promise<ArchieConfig | null> {
  const configFilePath = path.join(repoPath, "archie.config.md");
  try {
    const content = await fs.promises.readFile(configFilePath, "utf-8");
    return parseConfigMarkdown(content);
  } catch {
    return null;
  }
}
export async function createConfigTemplate(repoPath: string): Promise<void> {

  const configFilePath = path.join(repoPath, "archie.config.md");
  await fs.promises.writeFile(configFilePath, TEMPLATE_CONTENT, "utf-8");
}
