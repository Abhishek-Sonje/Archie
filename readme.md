# Archie

> Architecture documentation that writes — and updates — itself.

<!-- HERO: Record a terminal GIF using Vhs (https://github.com/charmbracelet/vhs) or Asciinema (https://asciinema.org).
     Show: `archie init` → spinner → "ARCHITECTURE.md written" banner.
     Export as GIF and drop it here:
![Archie demo](./docs/demo.gif) -->

Archie is a Node.js CLI that automatically generates and maintains an `ARCHITECTURE.md` in any Git repository. It reads your codebase, analyzes Git history, and uses Gemini 2.5 Flash to produce structured architecture documentation — then keeps it up to date on every meaningful commit via a post-commit hook.

Built for solo developers and small teams who use AI coding assistants and want living project context without manually writing docs.

---

## Why Archie?

Architecture docs go stale fast. You write one during setup, and by the time a new teammate — or an AI assistant — reads it three months later, half of it is wrong.

Archie makes your Git history the source of truth. It generates docs from your actual code and updates them surgically as you commit, touching only the sections that actually changed.

---

## Features

| | |
|---|---|
| **One-command init** | Generates a comprehensive `ARCHITECTURE.md` from your entire codebase in seconds |
| **Automatic hook updates** | Installs a `post-commit` hook that updates docs only when changes are architecturally significant |
| **Smart significance detection** | Skips typo fixes and minor refactors — only runs on changes that matter |
| **Dependency-aware context** | When a file changes, Archie also reads its import neighbors for richer, more accurate updates |
| **Fully local** | No server, no database, no account — just your machine, your repo, and a Gemini API key |
| **`.gitignore`-aware** | Never reads excluded files; stores its own state in `.git/` so nothing leaks into your commits |

---

## Prerequisites

- Node.js v18 or later
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

---

## Installation

```bash
npm install -g archie-cli
```

---

## Quick Start

**1. Add your Gemini API key**

Create a `.env` file in your repo root:

```bash
GEMINI_API_KEY=your_api_key_here
```

**2. Generate your initial architecture doc**

```bash
archie init
```

Archie reads your codebase, analyzes your Git history, and writes a structured `ARCHITECTURE.md` to your repo root. This takes 10–30 seconds depending on codebase size.

**3. Install the Git hook**

```bash
archie hook
```

Every `git commit` will now automatically check if the changes warrant an update. If they do, `ARCHITECTURE.md` is updated in the background. Done.

---

## Commands

### `archie init`

Generates `ARCHITECTURE.md` for the first time.

```
archie init
```

- Verifies you're inside a Git repository
- Prompts if an existing `ARCHITECTURE.md` is found
- Creates a starter `archie.config.md` if none exists
- Reads all source files, project identity files (`README.md`, `package.json`), and recent Git history
- Calls Gemini 2.5 Flash to generate the document
- Saves the current commit hash to `.git/archie/state.json` as a baseline

---

### `archie update`

Manually refreshes `ARCHITECTURE.md` without committing.

```
archie update
```

Useful after a batch of changes before pushing, or if the hook was skipped.

---

### `archie hook`

Installs a `post-commit` Git hook.

```
archie hook
```

The hook executes `npx archie run-hook` after each commit. If the changes aren't architecturally significant, Archie silently advances its state pointer and exits — no interruption to your commit flow.

---

## How It Works

### `archie init` — full generation

<!-- FLOW DIAGRAM: archie init
     Tools: Excalidraw (https://excalidraw.com), Mermaid Live (https://mermaid.live), or Whimsical (https://whimsical.com)
     Suggested Mermaid source:

flowchart TD
    A([archie init]) --> B[Pre-checks]
    B --> C{Gather in parallel}
    C --> D[Source files\n≤3MB · .gitignore-aware]
    C --> E[Git history\nRecent N commits]
    C --> F[Directory tree\nStructured prompt block]
    D & E & F --> G[Gemini 2.5 Flash\nGENERATE_SYSTEM_INSTRUCTION]
    G --> H[Write ARCHITECTURE.md\nSave HEAD hash to state.json]

     Render at https://mermaid.live and export as SVG or PNG, then embed:
![archie init flow](./docs/init-flow.png) -->

1. Reads all source files (up to 3 MB total, 100 KB per file), respecting `.gitignore`
2. Reads project identity files (`package.json`, `README.md`)
3. Generates a directory tree of the codebase
4. Fetches recent Git commit history
5. Sends everything to Gemini 2.5 Flash with the generation prompt
6. Writes `ARCHITECTURE.md` and saves the current commit hash to `.git/archie/state.json`

---

### `archie run-hook` — surgical update

<!-- FLOW DIAGRAM: post-commit hook
     Suggested Mermaid source:

flowchart TD
    A([git commit]) --> B[post-commit hook fires]
    B --> C[Read state.json\nlastProcessedCommit → HEAD diff]
    C --> D{Significant changes?}
    D -- No --> E[Advance state only]
    D -- Yes --> F[Gather context\nchanged files · neighbors · full snapshot]
    F --> G[Gemini 2.5 Flash\nUPDATE_SYSTEM_INSTRUCTION]
    G --> H[ARCHITECTURE.md updated\nstate.json saved]

     Embed export here:
![hook flow](./docs/hook-flow.png) -->

1. Reads `lastProcessedCommit` from `.git/archie/state.json`
2. Evaluates whether committed changes are "significant" (e.g. `package.json` changed, 5+ files modified, new modules added)
3. If not significant: silently advances the state pointer and exits
4. If significant: reads the changed files, their import neighbors via the dependency graph, and the full source snapshot
5. Sends the existing `ARCHITECTURE.md` plus new context to Gemini with the surgical update prompt
6. Writes the updated doc and saves the new HEAD hash

The two-mode design (full generation vs. incremental update) keeps your `ARCHITECTURE.md` stable — only affected sections are touched.

---

## Project Structure

```
src/
├── commands/
│   ├── init.ts          — archie init handler
│   ├── update.ts        — archie update handler
│   └── hook.ts          — hook installer + run-hook logic
│
├── core/
│   ├── gemini.ts        — Gemini API client, prompt construction, retry logic
│   ├── gitReader.ts     — commit history, changed files, current HEAD hash
│   ├── fileReader.ts    — source files, identity files, neighbor resolution
│   ├── dependencyGraph.ts — regex-based import graph for neighbor detection
│   └── writer.ts        — read / write ARCHITECTURE.md
│
├── utils/
│   ├── state.ts         — .git/archie/state.json (read, init, update)
│   ├── significant.ts   — significance heuristics (SIGNIFICANCE_RULES)
│   ├── config.ts        — archie.config.md parsing + template creation
│   └── ignore.ts        — file exclusion patterns
│
├── types/
│   └── index.ts         — FileNode · ArchieState · CommitRange · ArchieConfig
│
└── index.ts             — CLI entry point (Commander.js)
```

<!-- ARCHITECTURE DIAGRAM: Module map
     Tools: Eraser (https://www.eraser.io), Lucidchart (https://lucidchart.com), or Mermaid
     Show the folder containers above with arrows indicating which modules call which.
     Useful to illustrate how commands/ depends on core/, core/ depends on utils/, etc.
     Embed export here:
![module map](./docs/module-map.png) -->

---

## Configuration

After `archie init`, you'll find `archie.config.md` in your repo root. Use it to give Archie context that the code alone can't provide:

```md
# Archie Config

## Project Context
This is a B2B SaaS product for enterprise customers. The `src/billing/` module is
critical and should always be documented in detail.

## Documentation Style
Keep descriptions concise. Prefer bullet points over paragraphs.

## Sections to Always Include
- Tech Stack
- Core Flows
- Key Decisions and Tradeoffs
```

Archie reads this on every run and incorporates your instructions into its prompts. Use it to enforce documentation style, highlight important modules, or add context about non-obvious architectural decisions.

---

## State & Storage

Archie stores state at `.git/archie/state.json`, tracking the last processed commit hash and total run count. Because it lives inside `.git/`:

- It is never committed to your repository
- It is never visible to collaborators
- It requires no `.gitignore` entry

---

## Tech Stack

| Dependency | Role |
|---|---|
| **Node.js 18+** | Runtime — file system, network, Git |
| **TypeScript** (strict mode) | Language — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| **Commander.js** | CLI command definition and parsing |
| **@clack/prompts** | Terminal spinners and user confirmations |
| **@google/generative-ai** | Gemini API client |
| **simple-git** | Programmatic Git operations |
| **dotenv** | `GEMINI_API_KEY` loading from `.env` |

---

## Known Limitations

**File size caps** — Total source reading is capped at 3 MB; individual files at 100 KB. Very large repositories may not be fully analyzed. Chunked processing is planned for a future version.

**Significance heuristics** — The rules in `significant.ts` are heuristic-based. They may occasionally skip a relevant change or trigger on a trivial one.

**Import graph accuracy** — Dependency resolution uses regex-based extraction. Dynamic imports, aliased paths, and framework-specific import patterns may not be detected.

**Single output file** — V1 generates and maintains one `ARCHITECTURE.md`. Multi-file documentation wikis are planned for V2.

---

## FAQ

**Will Archie commit `ARCHITECTURE.md` automatically?**
No. Archie writes the file to disk but never stages or commits it. You decide when and how to commit it.

**Does the Git hook slow down my commits?**
The hook runs asynchronously after your commit completes — it doesn't block your terminal.

**What if I want to skip the hook on a specific commit?**
Pass `--no-verify` to bypass all Git hooks: `git commit --no-verify`.

**Is my code sent to Google?**
Yes — your source files are sent to the Gemini API. Review Google's [API data usage policies](https://ai.google.dev/gemini-api/terms) before use, especially for proprietary codebases.

**Can I use Archie without the Git hook?**
Yes. Use `archie init` for the initial doc and `archie update` to refresh it manually whenever you want.

