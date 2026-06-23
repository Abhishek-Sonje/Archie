import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  FileNode,
  ProcessedCommit,
  CommitRange,
  GeminiGenerateInput,
  GeminiUpdateInput,
} from "../types/index.js";

// ─── System prompts ───────────────────────────────────────────────

const GENERATE_SYSTEM_INSTRUCTION = `You are Archie, an expert software architect analyzing a codebase 
for the first time.

Your job is to produce an ARCHITECTURE.md that a new engineer 
joining this team could read in 10 minutes and understand:
- What this project does and why it exists
- How the main pieces fit together
- Why key technical decisions were made
- Where to look when something breaks

Rules you must follow:
- Every sentence must be specific to THIS codebase
- Reference actual file paths, function names, and package names
- Never write sentences that could apply to any project
- For tech stack: explain WHY each technology was chosen based on 
  evidence you see in the code — not just what it is
- For core flows: trace real code paths using actual file names
- If you see something unusual or clever, call it out explicitly
- If you see technical debt or known limitations, be honest about them
- Do not pad with obvious statements
- Do not use corporate speak or marketing language

If the user has provided context in archie.config.md, treat it as 
ground truth. Never contradict it. Never override sections marked 
as permanent.`;

const UPDATE_SYSTEM_INSTRUCTION = `You are Archie, maintaining an ARCHITECTURE.md you previously wrote.

Recent commits have changed parts of this codebase. Your job is to 
update the architecture document to reflect the current state.

Rules you must follow:
- Read the existing ARCHITECTURE.md carefully first
- Identify which sections are affected by the changed files
- Update ONLY those sections — leave everything else exactly as written
- Do not reorganize sections or change headings
- Do not remove accurate information just because files changed
- Add new information where the codebase has genuinely grown
- If a changed file introduces a new pattern, add it
- If a changed file removes something documented, remove that documentation
- Sections marked as permanent in archie.config.md must never be modified

You are a surgeon making precise edits — not a rewriter starting fresh.`;

const OUTPUT_INSTRUCTIONS = `
CRITICAL OUTPUT RULES — these override everything else:
- Output ONLY raw markdown. Nothing before # Architecture. Nothing after the last line.
- Do NOT write "Here is", "I've analyzed", "Based on", or any preamble whatsoever
- Do NOT wrap output in backticks or code fences
- Start your response with exactly: # Architecture
- Your response ends with the last content line — no closing remarks

Section order (mandatory):
# Architecture
## What This Project Does
## Tech Stack
## Project Structure
## Core Flows
## Key Decisions and Tradeoffs
## Known Gaps and Limitations

Do not add sections. Do not remove sections.
If a section has nothing to say, write: "Nothing to document here yet."
`.trim();

// ─── Formatting helpers ───────────────────────────────────────────

function formatFiles(files: FileNode[]): string {
  return files
    .map((file) => `=== ${file.path} ===\n${file.content}`)
    .join("\n\n");
}

function formatGitHistory(commits: ProcessedCommit[]): string {
  return commits
    .map((commit) => {
      const files = [
        ...commit.filesChanged.added.map((f) => `  + ${f}`),
        ...commit.filesChanged.modified.map((f) => `  ~ ${f}`),
        ...commit.filesChanged.deleted.map((f) => `  - ${f}`),
      ].join("\n");

      return files
        ? `[${commit.timestamp}] ${commit.message}\n${files}`
        : `[${commit.timestamp}] ${commit.message}`;
    })
    .join("\n\n");
}

function formatCommitRange(range: CommitRange): string {
  return [
    `Commits from ${range.from.slice(0, 7)} to ${range.to.slice(0, 7)}:`,
    "",
    ...range.commits.map((c) => {
      const total =
        c.filesChanged.added.length +
        c.filesChanged.modified.length +
        c.filesChanged.deleted.length;
      return `[${c.timestamp}] ${c.message} (${total} files)`;
    }),
  ].join("\n");
}

function cleanMarkdownResponse(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
}

// ─── Gemini client ────────────────────────────────────────────────

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Using Gemini model for ARCHITECTURE.md generation", apiKey ? "" : "(GEMINI_API_KEY not set, will fail)");
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not found.\n" +
        "Get your key at: https://aistudio.google.com/app/apikey\n" +
        "Then run: export GEMINI_API_KEY=your_key_here",
    );
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

async function callGemini(prompt: string): Promise<string> {
  const model = getModel();
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty response");
  return cleanMarkdownResponse(text);
}

async function callGeminiWithRetry(
  prompt: string,
  retries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGemini(prompt);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 2000 * Math.pow(2, attempt);
      console.log(`Gemini call failed, retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

// ─── Prompt builders ──────────────────────────────────────────────

function buildGeneratePrompt(input: GeminiGenerateInput): string {
  const sections: string[] = [];

  sections.push(GENERATE_SYSTEM_INSTRUCTION);

  if (input.userConfig) {
    sections.push(`<user_config>\n${input.userConfig}\n</user_config>`);
  }

  sections.push(
    `<identity_files>\n${formatFiles(input.identityFiles)}\n</identity_files>`,
  );
  sections.push(
    `<directory_structure>\n${input.treeString}\n</directory_structure>`,
  );
  sections.push(
    `<source_files>\n${formatFiles(input.sourceFiles)}\n</source_files>`,
  );
  sections.push(
    `<git_history>\n${formatGitHistory(input.gitHistory)}\n</git_history>`,
  );
  sections.push(OUTPUT_INSTRUCTIONS);

  return sections.join("\n\n");
}

function buildUpdatePrompt(input: GeminiUpdateInput): string {
  const sections: string[] = [];

  sections.push(UPDATE_SYSTEM_INSTRUCTION);

  if (input.userConfig) {
    sections.push(`<user_config>\n${input.userConfig}\n</user_config>`);
  }

  sections.push(
    `<existing_architecture>\n${input.existingArchitecture}\n</existing_architecture>`,
  );
  sections.push(
    `<recent_changes>\n${formatCommitRange(input.commitRange)}\n</recent_changes>`,
  );
  sections.push(
    `<changed_files>\n${formatFiles(input.changedFiles)}\n</changed_files>`,
  );
  sections.push(
    `<neighbor_files>\n${formatFiles(input.neighborFiles)}\n</neighbor_files>`,
  );
  sections.push(OUTPUT_INSTRUCTIONS);

  return sections.join("\n\n");
}

// ─── Public API ───────────────────────────────────────────────────

export async function generateArchitecture(
  input: GeminiGenerateInput,
): Promise<string> {
  const prompt = buildGeneratePrompt(input);
  return callGeminiWithRetry(prompt);
}

export async function updateArchitecture(
  input: GeminiUpdateInput,
): Promise<string> {
  const prompt = buildUpdatePrompt(input);
  return callGeminiWithRetry(prompt);
}
