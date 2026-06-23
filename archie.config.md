# Archie Configuration

## Project Description

Archie is a CLI tool that automatically generates and maintains an ARCHITECTURE.md file for any code repository. It reads the codebase and git history, uses the Gemini 1.5 Pro API to produce a structured architecture document, and keeps it updated automatically on every significant commit via a git post-commit hook.

Target users are solo developers and small teams who use AI coding tools like Cursor or Claude Code and want their AI agent to have accurate, structured context about the project. Archie solves the problem that architecture documentation always goes stale because the maintenance burden is too high for humans — Archie makes the AI do the maintenance instead.

This is V1. The goal is a working CLI that can be published to npm as archie-cli and used with npx archie init on any project.

## Key Decisions

- **No backend server** — runs entirely as a local CLI tool. No auth, no database, no hosted service. Zero setup friction for the user.
- **Gemini 2.5 Flash** — chosen for its 1M token context window which handles large codebases in a single pass without chunking.
- **State stored in .git/archie/state.json** — lives inside the .git directory intentionally so it is never committed to the repo and never requires a .gitignore entry.
- **Single ARCHITECTURE.md output** — V1 produces one file. The graph/wiki system with connected nodes is explicitly V2 and must not be built now.
- **TypeScript strict mode** — no any types, no unsafe casts, proper error handling throughout.
- **Commander.js for CLI** — most mature Node.js CLI library, simple API, well understood.
- **Two prompt modes** — generate mode for first init, update mode for subsequent changes. Update mode is surgical — it only modifies affected sections, never rewrites from scratch.

## Things To Track

- Changes to prompt strings in src/core/gemini.ts — these directly affect output quality
- New commands added to src/commands/ 
- Changes to the significance detection rules in src/utils/significant.ts
- Changes to src/types/index.ts — interface changes affect every other file
- New dependencies added to package.json
- Changes to the file ignore list in src/core/fileReader.ts
- Changes to state.json structure in src/utils/state.ts

## Never Change

- The two-prompt architecture (generate vs update) — this is a core product decision
- The state file location (.git/archie/state.json) — changing this breaks existing installations
- The ARCHITECTURE.md output section order — downstream tooling may depend on it
- The significance detection logic in src/utils/significant.ts — changing rules affects when Gemini gets called
- V2 features must not be introduced in V1 — no graph system, no multi-file wiki, no GitHub Action

## Stack Context

- This project is Archie itself — it is being run on its own codebase (dogfooding)
- The src/core/dependencyGraph.ts file builds an import graph used to find neighbor files during incremental updates — it is not a general purpose tool, only used by readNeighborFiles in fileReader.ts
- batchedPromiseAll in gitReader.ts is a custom batching utility to prevent hammering git with 50 parallel diff-tree calls — it is intentional, do not replace with raw Promise.all
- The @clack/prompts library handles all terminal UI — spinners, confirmations, intro/outro. Do not replace with console.log equivalents
- run-hook is a hidden Commander.js command — it does not appear in archie --help. It is called by the git post-commit hook script written to .git/hooks/post-commit

## Notes

This is a portfolio project built to demonstrate backend engineering depth and AI integration. The primary audience for the code itself is technical hiring managers and senior engineers reviewing the GitHub repo.

Code quality standards: no debug console.log left in production code, proper TypeScript types throughout, error messages that answer what/why/how to fix.

When updating documentation, prefer specific technical descriptions over generic ones. Every sentence in ARCHITECTURE.md should be specific enough that it could only apply to Archie — never generic enough to apply to any TypeScript CLI tool.