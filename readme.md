# Archie

> Architecture documentation that writes — and updates — itself.

Archie is a Node.js CLI that automatically generates and maintains an `ARCHITECTURE.md` in any Git repository. It reads your codebase, analyzes Git history, and uses Gemini 2.5 Flash to produce structured docs — then keeps them up to date on every meaningful commit via a post-commit hook.

Built for solo developers and small teams using AI coding assistants.

---

## Why Archie?

Architecture docs go stale fast. You write one during setup, and by the time a new teammate — or an AI assistant — reads it three months later, half of it is wrong.

Archie makes your Git history the source of truth. It generates docs from your actual code and updates them surgically on every commit, touching only the sections that changed.

---

## Install

Requires Node.js v18+ and a [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works).

```bash
npm install -g archie-ai
```

---

## Quick Start

```bash
# 1. Add your API key
echo "GEMINI_API_KEY=your_key_here" > .env

# 2. Generate your initial architecture doc
archie init

# 3. Install the Git hook for automatic updates
archie hook
```

That's it. Every `git commit` will now check if the changes are significant enough to warrant a doc update and handle it in the background.

---

## Commands

**`archie init`** — Generates `ARCHITECTURE.md` for the first time. Reads all source files, project identity files, and recent Git history, then calls Gemini to produce the document. Also creates a starter `archie.config.md` if one doesn't exist.

**`archie update`** — Manually refreshes `ARCHITECTURE.md` without committing. Useful after a batch of changes or if the hook was skipped.

**`archie hook`** — Installs a `post-commit` Git hook. After each commit, Archie checks whether the changes are significant. If not, it silently advances its state pointer. If yes, it updates the doc in the background.

---

## How It Works

### On `archie init`

Archie reads your source files (up to 3 MB total), project identity files, and recent Git history, then sends everything to Gemini 2.5 Flash to generate the initial `ARCHITECTURE.md`. The current commit hash is saved to `.git/archie/state.json` as a baseline.

### On every `git commit`

The post-commit hook compares the new commits against the last processed hash. If the changes aren't significant (a typo fix, a minor refactor), Archie advances the state pointer and exits silently. If they are — say, `package.json` changed or 5+ files were modified — it reads the changed files, their import neighbors, and the full source snapshot, then asks Gemini to perform a surgical update on the existing doc. Only the affected sections are touched.

State is stored in `.git/archie/` so it's never committed or visible to collaborators.

---

## Configuration

After `archie init`, you'll find `archie.config.md` in your repo root. Use it to give Archie context the code can't tell it:

```md
# Archie Config

## Project Context
B2B SaaS for enterprise customers. The `src/billing/` module is critical
and should always be documented in detail.

## Documentation Style
Keep descriptions concise. Prefer bullet points over paragraphs.

## Sections to Always Include
- Tech Stack
- Core Flows
- Key Decisions and Tradeoffs
```

---

## Project Structure

```
src/
├── commands/        — init · update · hook handlers
├── core/            — gemini · gitReader · fileReader · dependencyGraph · writer
├── utils/           — state · significant · config · ignore
├── types/           — shared TypeScript interfaces
└── index.ts         — CLI entry point (Commander.js)
```

---

## Limitations

- **File size caps** — total source capped at 3 MB, individual files at 100 KB. Very large repos may not be fully analyzed.
- **Significance heuristics** — rules in `significant.ts` may occasionally miss a relevant change or trigger on a trivial one.
- **Import graph** — built with regex extraction; dynamic imports and aliased paths may not be detected.
- **Single output** — V1 maintains one `ARCHITECTURE.md`. Multi-file wikis are planned for V2.

---

## FAQ

**Will Archie commit `ARCHITECTURE.md` automatically?**
No — it writes the file to disk but never stages or commits it.

**Does the hook slow down my commits?**
No — it runs asynchronously after the commit completes.

**How do I skip the hook on a specific commit?**
`git commit --no-verify`

**Is my code sent to Google?**
Yes — source files are sent to the Gemini API. Review [Google's API data usage policy](https://ai.google.dev/gemini-api/terms) before use.

