# Archie — Architecture Document (V1)

> "Your codebase explains itself."

---

## What Archie Is

Archie is a CLI tool that automatically generates and maintains an `ARCHITECTURE.md` file for any code repository. It reads your codebase and git history, uses the Gemini 1.5 Pro API to produce a structured, human-readable architecture document, and keeps it updated automatically on every significant commit via a git hook.

It is not a README generator. It is not a documentation site builder. It is a persistent, living architecture document that stays accurate without any manual effort from the developer.

---

## What Archie Is NOT (Scope Boundaries for V1)

- NOT a backend service — runs entirely locally as a CLI tool
- NOT a SaaS product — no auth, no database, no server
- NOT a graph/wiki system — that is V2
- NOT a code explainer or chatbot — it writes docs, not answers
- NOT a linter or code reviewer — it documents, not judges

---

## Problem Being Solved

Developers know why they made architectural decisions when they make them. Six months later, they don't. New team members have no way to understand the reasoning behind a codebase. AI coding agents have no structured context about the project they're working in.

Existing solutions fail because:
- Wikis and Notion docs go stale — maintenance burden kills them
- README files are too high level
- Inline comments explain what, not why
- ADR (Architecture Decision Records) require manual effort nobody does

Archie solves this by making the AI do all the maintenance. Zero developer effort after setup.

---

## Target User (V1)

- Solo developers and small teams (2–5 engineers)
- Developers using AI coding tools (Cursor, Claude Code, Copilot) who want to give their AI agent structured project context
- Any developer who has ever joined a codebase and had no idea why decisions were made

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript (Node.js) | Type safety, npm ecosystem, developer tooling standard |
| CLI Framework | Commander.js | Most mature Node.js CLI library, simple API |
| AI | Gemini 1.5 Pro API | 1M token context window handles large codebases in one pass |
| Git Integration | simple-git | Clean TypeScript wrapper over git CLI, no shell exec needed |
| File System | Node.js native fs/path | No dependencies needed for file walking |
| Distribution | npm (npx) | Zero install friction — `npx archie init` just works |
| Config Format | Markdown (.md) | Human readable, git-diffable, no JSON/YAML friction |

---

## Project Structure

```
archie/
├── src/
│   ├── index.ts              # CLI entry point, Commander.js setup
│   ├── commands/
│   │   ├── init.ts           # devcontext init command
│   │   ├── update.ts         # devcontext update command
│   │   └── hook.ts           # devcontext hook command
│   ├── core/
│   │   ├── fileReader.ts     # Walks repo, reads source files, filters noise
│   │   ├── gitReader.ts      # Reads commit history via simple-git
│   │   ├── gemini.ts         # Gemini API client, prompt construction
│   │   └── writer.ts         # Writes/updates ARCHITECTURE.md to disk
│   ├── utils/
│   │   ├── ignore.ts         # Decides what files to skip
│   │   ├── significant.ts    # Detects if a commit is significant
│   │   └── config.ts         # Reads archie.config.md if present
│   └── types/
│       └── index.ts          # All TypeScript interfaces and types
├── templates/
│   └── config-template.md    # Template copied on first init
├── package.json
├── tsconfig.json
└── README.md
```

---

## Three CLI Commands (Complete V1 Surface Area)

### `npx archie init`
First-time setup. Runs once per project.

Flow:
1. Check if `ARCHITECTURE.md` already exists — if yes, confirm overwrite
2. Check if `archie.config.md` exists — if no, copy from template with instructions
3. Run fileReader on current directory
4. Run gitReader on current repo
5. Read `archie.config.md` if present
6. Send everything to Gemini with the generation prompt
7. Write output to `ARCHITECTURE.md`
8. Print success message with summary of what was generated

### `npx archie update`
Manual trigger. Runs anytime developer wants to refresh docs.

Flow:
1. Identical to init flow but never asks for overwrite confirmation
2. Reads existing `ARCHITECTURE.md` and passes it to Gemini as current state
3. Gemini updates rather than regenerates from scratch — preserves user edits
4. Writes updated file

### `npx archie hook`
Installs a git post-commit hook for automatic updates.

Flow:
1. Check if `.git` directory exists — error if not a git repo
2. Check if `.git/hooks/post-commit` already exists — if yes, append, don't overwrite
3. Write hook script that:
   - Runs significance check on the commit
   - If significant: runs `archie update` silently
   - If not significant: does nothing
4. `chmod +x` the hook file
5. Print confirmation

---

## User Configuration — archie.config.md

This file lives in the repo root. It is optional but powerful. Gemini reads it before generating anything. User context always overrides AI assumptions.

Template structure (copied on first init):

```markdown
# Archie Configuration

## What this project is
[Describe your project in plain English. Who uses it, what problem it solves.]

## Key architectural decisions I've made
[Decisions you want documented and preserved. AI will not second-guess these.]

## Things Archie should always track
[Specific things to watch — e.g. "every new API endpoint", "DB schema changes"]

## Things Archie should never change
[Sections of ARCHITECTURE.md that are manually written and should not be overwritten]

## Stack context AI might not know
[Internal libraries, private packages, non-obvious dependencies and why they exist]
```

---

## What ARCHITECTURE.md Looks Like (Output Format)

Every generated file has exactly these sections in exactly this order:

```markdown
# Architecture

> Last updated: [date] | Generated by Archie

## What This Project Does
One paragraph. Plain English. No jargon. 
What it does, who uses it, what problem it solves.

## Tech Stack
| Technology | Purpose | Why This Choice |
|---|---|---|
| ... | ... | ... |

## Project Structure
Key directories only. Not every file.
What lives where and why.

## Core Flows
How the main features work end to end.
Referenced by actual file paths.

## Key Decisions & Tradeoffs
What was considered. What was chosen. Why.
References commit history where relevant.

## Known Gaps & Limitations
Honest. What's missing, what's hacky, what needs work.

---
*Generated by [Archie](https://github.com/your-username/archie). 
Do not edit above this line — changes will be overwritten.
Add permanent context to archie.config.md instead.*
```

---

## Core Logic — fileReader.ts

**Purpose:** Produce a clean, structured map of the codebase for Gemini.

**What it does:**
- Walks directory tree recursively from repo root
- Returns `{ filePath: string, content: string }[]`

**What it skips (ignore list):**
```
node_modules/     dist/           build/          .git/
.next/            .cache/         coverage/       *.min.js
*.lock            *.log           .env*           *.png
*.jpg             *.svg           *.ico           *.woff
*.ttf             *.mp4           *.zip           *.pdf
```

**Size limits:**
- Skip any single file over 100KB
- If total content exceeds 600K tokens (estimated), prioritize:
  1. Entry points (index.ts, main.ts, app.ts, server.ts)
  2. Files changed most recently in git history
  3. Files with the most imports (most connected)
  4. Everything else

**Output structure passed to Gemini:**
```
=== FILE: src/index.ts ===
[content]

=== FILE: src/lib/auth.ts ===
[content]
```

---

## Core Logic — gitReader.ts

**Purpose:** Give Gemini understanding of project evolution, not just current state.

**What it reads:**
- Last 50 commit messages with timestamps and author
- Files changed per commit (not diffs — too large)
- Current branch name
- Tags if any exist
- First commit date (project age)

**Output structure passed to Gemini:**
```
Branch: main
Project age: 8 months (first commit: 2025-10-01)
Total commits: 234

Recent history (last 50 commits):
[2026-06-01] feat: add stripe webhook handler (files: src/webhooks/stripe.ts, src/db/payments.ts)
[2026-05-29] fix: race condition in session refresh (files: src/middleware/auth.ts)
[2026-05-28] refactor: split user service into separate module (files: 8 files changed)
...
```

---

## Core Logic — significant.ts

**Purpose:** Decide if a commit is significant enough to trigger an update.

**Significant = true if ANY of these:**
- More than 5 files changed in the commit
- A new directory was created
- `package.json` was modified (dependency change)
- Any file matching `*schema*`, `*migration*`, `*model*` was changed
- Any file matching `*config*`, `*env*` was changed (except .env itself)
- A file was deleted (not just modified)

**Significant = false if ALL of these:**
- 5 or fewer files changed
- Only existing files modified
- No config/schema/package changes
- Commit message starts with `docs:`, `style:`, `chore:`, `test:`

Silent on non-significant commits. Developer never knows Archie is running.

---

## Core Logic — gemini.ts

**Purpose:** Construct the prompt and call Gemini API.

**Model:** `gemini-1.5-pro`

**Two prompt modes:**

### Mode 1: Generate (used by init)
```
You are an expert software architect documenting a codebase.

Analyze the following project and generate a structured ARCHITECTURE.md.

Rules:
- Be specific. Reference actual file paths and function names.
- Every sentence must be specific to THIS project, never generic.
- For tech stack, explain WHY each technology was chosen based on evidence in the code.
- For core flows, trace actual code paths using real file names.
- Be honest about gaps and limitations you can see.
- Write for a new developer joining this project, not for the original author.

${userConfig ? `User-provided context (treat as ground truth, do not contradict):\n${userConfig}` : ''}

--- PROJECT FILE STRUCTURE ---
${fileTree}

--- GIT HISTORY ---
${gitHistory}

--- SOURCE CODE ---
${sourceCode}

Generate the ARCHITECTURE.md now. Follow the exact section structure provided.
Output only the markdown content. No preamble. No explanation.
```

### Mode 2: Update (used by update and hook)
```
You are maintaining an existing ARCHITECTURE.md for a codebase.

The codebase has changed. Update the architecture document to reflect current state.

Rules:
- Preserve all sections marked "do not change" in user config.
- Update only sections that are affected by the changes.
- Do not remove information that is still accurate.
- Add new information where the codebase has grown.
- Keep the exact same section structure.

${userConfig ? `User-provided context (treat as ground truth):\n${userConfig}` : ''}

--- EXISTING ARCHITECTURE.md ---
${existingArchitecture}

--- RECENT CHANGES (last 10 commits) ---
${recentGitHistory}

--- CHANGED FILES (content) ---
${changedFilesContent}

Update the ARCHITECTURE.md now. Output only the markdown. No preamble.
```

---

## Environment and Configuration

**Environment variable:**
```
GEMINI_API_KEY=your_key_here
```

Archie checks for this on startup. If missing, prints a clear error with instructions to get a key. Never crashes silently.

**No `.archierc` or complex config.** Everything user-facing goes in `archie.config.md`. Keeps it simple and human-readable.

---

## Error Handling Philosophy

Every error message must answer three questions:
1. What went wrong
2. Why it went wrong  
3. Exactly what to do to fix it

Example — good error:
```
✗ Gemini API key not found.
  Archie needs a GEMINI_API_KEY environment variable.
  Get your key at: https://aistudio.google.com/app/apikey
  Then run: export GEMINI_API_KEY=your_key_here
```

Example — bad error (never do this):
```
Error: Missing API key
```

---

## What Success Looks Like for V1

A developer should be able to:

1. `cd` into any existing project
2. Run `npx archie init`
3. Have a genuinely useful `ARCHITECTURE.md` in under 60 seconds
4. Run `npx archie hook` once
5. Never think about documentation again

If step 3 produces a generic, vague, could-apply-to-any-project document — V1 has failed. The output must be specific enough that someone reading it without access to the codebase understands exactly how it works.

---

## V2 Vision (Do Not Build Now — Context Only)

V2 introduces the node graph system discussed during product design:

- `devcontext/` directory replaces single `ARCHITECTURE.md`
- Each concept, flow, and entity gets its own markdown file
- Files link to each other via frontmatter `relates_to` field
- On commit, only affected nodes are updated — not the entire graph
- `archie browse` command — terminal graph explorer
- GitHub Action for CI integration

V2 is only built after V1 has real users and feedback. Do not scope creep into V2 during V1 development.

---

## Development Phases

### Week 1 — Core Works Locally
- Project scaffolding (Commander.js, TypeScript, npm)
- `fileReader.ts` — walks repo, filters noise, structures output
- `gitReader.ts` — reads history via simple-git
- `gemini.ts` — API client, both prompt modes
- `init` command wired end to end
- Tested on 3 real repos including Numatix project

### Week 2 — Git Integration Complete
- `significant.ts` — commit significance detection
- `hook` command — installs post-commit hook
- `update` command — incremental update mode
- `config.ts` — reads `archie.config.md`
- Template file for `archie.config.md`
- Error handling across all commands

### Week 3 — Polish and Edge Cases
- Large repo handling (token limit management)
- Monorepo support (multiple package.json)
- Binary file detection and skipping
- Works correctly on repos with no git history
- Works correctly on brand new projects (few files)
- Good error messages everywhere

### Week 4 — Ship
- Published on npm as `archie-cli`
- README.md written (ironic — the tool that writes docs needs good docs)
- Demo video recorded on real project
- Posted on X and LinkedIn
- Submitted to relevant communities (r/webdev, Hacker News Show HN)

---

## Decisions Made and Why

**Why CLI and not a VS Code extension?**
CLI works everywhere — any editor, any CI system, any OS. VS Code extension locks you into one editor and has a complex publishing/update cycle. Start CLI, add editor integrations later.

**Why local and not a GitHub App?**
GitHub Apps require a backend, auth, webhooks infrastructure, and user accounts. A local CLI has zero setup friction. Developer runs one command and it works. Distribution via npx means no installation required.

**Why Gemini and not OpenAI?**
1M token context window. Large codebases can be sent in a single pass without chunking. GPT-4 has a 128K limit which requires complex chunking logic that adds failure modes. Gemini handles it in one shot.

**Why single ARCHITECTURE.md and not multiple files (V1)?**
Simplicity of first version. One file is universally understood, works in every editor, easy to git diff, and requires no tooling to read. The graph system (V2) is better but significantly more complex to build correctly.

**Why Markdown for user config and not JSON/YAML?**
Developers actually write in Markdown config files. JSON/YAML configs feel like configuration — Markdown feels like documentation. The psychological difference matters for adoption.

---

*This document is the source of truth for Archie V1 development.
Any AI agent working on this codebase should read this file first.
Last updated: June 2026*
