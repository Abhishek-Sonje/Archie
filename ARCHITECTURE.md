# Architecture
## What This Project Does
Archie is a Node.js CLI tool, `archie-cli`, designed to automatically generate and maintain an `ARCHITECTURE.md` file within any Git repository. It addresses the common problem of architecture documentation becoming stale by leveraging the Gemini 2.5 Flash API to read codebases, analyze Git history, and produce structured documentation that updates automatically. The tool is primarily for solo developers and small teams who use AI coding assistants and need up-to-date project context.

## Tech Stack
*   **Node.js**: As a CLI tool, Archie runs on Node.js, enabling file system access, Git interactions, and network requests to the Gemini API.
*   **TypeScript**: The entire codebase is written in TypeScript, strictly enforced by `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`, ensuring robust type safety and reducing runtime errors.
*   **Commander.js**: The `commander` library (`package.json`) is used in `src/index.ts` to define and parse CLI commands like `archie init`, `archie update`, and `archie hook`. It was chosen for its mature, simple API and widespread understanding within the Node.js ecosystem.
*   **@clack/prompts**: This library provides the interactive terminal user interface, including spinners for long-running operations and confirmations for user input, as seen in `src/commands/init.ts` and `src/commands/update.ts`, enhancing the user experience.
*   **@google/generative-ai**: This official client library (`src/core/gemini.ts`) facilitates interaction with the Gemini 2.5 Flash API, which was chosen for its 1M token context window allowing Archie to process large codebases in a single API call without complex chunking logic.
*   **simple-git**: Used extensively in `src/core/gitReader.ts` and `src/core/fileReader.ts`, this library provides a straightforward interface for programmatic Git repository operations, such as reading commit history, file changes, and current HEAD hashes.
*   **dotenv**: The `dotenv` package (`src/index.ts`) loads environment variables from a `.env` file, specifically used to manage the `GEMINI_API_KEY` required for authenticating with the Gemini API.
*   **tsx**: Listed as a development dependency in `package.json`, `tsx` is used for directly running TypeScript files without a prior compilation step, streamlining local development workflows.
*   **typescript**: The `typescript` package itself is a development dependency, responsible for compiling the TypeScript source code in `src/` into JavaScript in `dist/`, as configured by `tsconfig.json`.

## Project Structure
The Archie codebase is organized into several key directories under `src/`:

*   **`src/commands/`**: Contains the implementations for the various CLI commands:
    *   `init.ts`: Handles the first-time generation of `ARCHITECTURE.md`.
    *   `update.ts`: Manually refreshes `ARCHITECTURE.md` based on recent changes.
    *   `hook.ts`: Manages the installation of the Git `post-commit` hook and the logic for the `run-hook` command that performs automated updates.
*   **`src/core/`**: Houses the core business logic and integrations:
    *   `dependencyGraph.ts`: Builds an in-memory import graph of source files, used specifically by `src/core/fileReader.ts#readNeighborFiles` to identify files logically related to changed ones during updates. This is *not* a general-purpose graph tool.
    *   `fileReader.ts`: Responsible for reading files from the repository, including project identity files (`README.md`, `package.json`), all source files, and specifically changed files, while respecting Git ignore rules and size limits.
    *   `gemini.ts`: Abstracts the interaction with the Gemini API, including prompt construction for both initial generation and incremental updates, and handling API retries.
    *   `gitReader.ts`: Provides functions for interacting with the local Git repository, such as retrieving commit history, identifying changed files within commit ranges, and calculating current commit hashes.
    *   `writer.ts`: Handles writing the generated or updated architecture content to `ARCHITECTURE.md` and reading its existing content.
*   **`src/types/`**: Contains `index.ts`, which defines all shared TypeScript interfaces and types used across the project, such as `FileNode`, `ArchieState`, `CommitRange`, and `ArchieConfig`, ensuring consistent data structures.
*   **`src/utils/`**: Provides various utility functions:
    *   `config.ts`: Manages reading and parsing the `archie.config.md` file, which provides user-defined context and instructions for the AI. It also handles creating a template config file.
    *   `ignore.ts`: Contains a simple function to determine if a given file path should be ignored during processing, based on common patterns and extensions.
    *   `significant.ts`: Implements the logic to determine if a set of Git changes is "significant" enough to warrant an `ARCHITECTURE.md` update, based on predefined rules like changes to `package.json` or a large number of files.
    *   `state.ts`: Manages the `state.json` file, which stores Archie's internal state (e.g., `lastProcessedCommit`, `totalRuns`). This file is intentionally located at `.git/archie/state.json` to ensure it is never committed to the user's repository and does not require `.gitignore` entries.
*   **`src/index.ts`**: This is the main entry point for the Archie CLI, where `commander` commands are defined and linked to their respective handler functions in `src/commands/`.

## Core Flows
### `archie init` (Initial Architecture Generation)
This flow is executed when a user first runs `archie init` to create their `ARCHITECTURE.md`.

1.  **Command Invocation**: The `src/index.ts` entry point dispatches to the `init` function in `src/commands/init.ts`.
2.  **Pre-checks**: `src/commands/init.ts` first verifies that the current directory is a Git repository using `src/core/gitReader.ts#getCurrentHash`. It also checks for an existing `ARCHITECTURE.md` and `archie.config.md`, prompting the user for action or creating a config template via `src/utils/config.ts#createConfigTemplate`.
3.  **Data Gathering**: The `init` function then concurrently gathers comprehensive project data:
    *   `src/core/fileReader.ts#readProjectIdentityFiles` reads key project files like `package.json` and `README.md`.
    *   `src/core/fileReader.ts#readAllSourceFiles` reads the content of all relevant source code files, respecting ignore lists and size limits.
    *   `src/core/fileReader.ts#getStructurePromptBlock` generates a directory tree string representation of the codebase.
    *   `src/core/gitReader.ts#getRecentHistory` fetches a predefined number of recent Git commits.
4.  **AI Generation**: All gathered data, along with any user configuration from `archie.config.md`, is passed to `src/core/gemini.ts#generateArchitecture`. This function constructs a detailed prompt for the Gemini API using `GENERATE_SYSTEM_INSTRUCTION` and calls `callGeminiWithRetry` to generate the initial `ARCHITECTURE.md` content.
5.  **Output & State Save**: The generated architecture is written to `ARCHITECTURE.md` in the repository root using `src/core/writer.ts#writeArchitecture`. Finally, `src/utils/state.ts#initializeState` saves the current Git HEAD hash to `.git/archie/state.json` to mark the last processed commit.

### `archie run-hook` (Automatic Architecture Update)
This hidden command is triggered by the Git `post-commit` hook installed via `archie hook` and is responsible for automatically updating `ARCHITECTURE.md`.

1.  **Hook Execution**: A Git `post-commit` hook (created by `src/commands/hook.ts#installHook`) executes `npx archie run-hook`. The `src/index.ts` entry point dispatches to `src/commands/hook.ts#runHook`.
2.  **State & Commit Check**: `runHook` first reads the last processed commit from `.git/archie/state.json` using `src/utils/state.ts#readState` and determines the current HEAD hash via `src/core/gitReader.ts#getCurrentHash`. If no new commits exist or `ARCHITECTURE.md` is missing, the process exits silently.
3.  **Significance Check**: `src/utils/significant.ts#isSignificant` evaluates whether the changes within the new commit range (obtained via `src/core/gitReader.ts#getCommitRange` and `getChangedFilesInRange`) meet the criteria for an architectural update. If not, only the `lastProcessedCommit` in state is advanced, and the process exits.
4.  **Contextual Data Gathering**: If changes are significant, `src/commands/hook.ts#runHook` gathers:
    *   `src/core/gitReader.ts#getChangedFilesInRange` identifies files modified, added, or deleted in the commit range.
    *   `src/core/fileReader.ts#readChangedFiles` retrieves the content of these files.
    *   `src/core/fileReader.ts#readAllSourceFiles` provides a full snapshot of the repository's source files.
    *   **Clever Detail**: `src/core/fileReader.ts#readNeighborFiles` (which internally leverages `src/core/dependencyGraph.ts#buildDependencyGraph`) identifies files that import or are imported by the changed files, providing critical adjacent context for surgical updates.
    *   `src/core/writer.ts#readExistingArchitecture` fetches the current `ARCHITECTURE.md` content.
5.  **AI Update**: The existing architecture, commit range details, changed files, neighbor files, and user configuration are passed to `src/core/gemini.ts#updateArchitecture`. This uses `UPDATE_SYSTEM_INSTRUCTION` to instruct Gemini to perform precise edits rather than a full rewrite.
6.  **Output & State Save**: The updated architecture content is written to `ARCHITECTURE.md` by `src/core/writer.ts#writeArchitecture`. Finally, `src/utils/state.ts#updateState` updates `lastProcessedCommit` in `.git/archie/state.json` to reflect the new HEAD hash.
    *   **Unusual Detail**: `src/core/gitReader.ts#batchedPromiseAll` is a custom utility that processes Git commands in batches (defaulting to 10) to prevent hammering the Git binary with too many concurrent `diff-tree` calls, which could cause resource exhaustion or errors on some systems.

## Key Decisions and Tradeoffs
*   **No Backend Server**: Archie is designed as a purely local CLI tool (`src/index.ts`). This decision eliminates server-side operational costs, database management, authentication, and significantly reduces setup friction for the user, requiring only Node.js and a Gemini API key. The tradeoff is that advanced features like centralized reporting or multi-user collaboration are not supported in V1.
*   **Gemini 2.5 Flash**: The selection of Gemini 2.5 Flash for the AI generation (`src/core/gemini.ts`) is critical for its large (1M token) context window. This allows the tool to submit an entire codebase or significant portions of it in a single API request, avoiding the complexity and potential information loss associated with chunking and merging responses from smaller models.
*   **State Stored in `.git/archie/state.json`**: Archie's internal state, managed by `src/utils/state.ts`, is persisted within the `.git/archie/` directory. This clever placement ensures that the state file is never inadvertently committed to the user's repository and automatically bypasses the need for manual `.gitignore` entries.
*   **Single `ARCHITECTURE.md` Output**: The V1 scope explicitly limits Archie to generating and maintaining a single `ARCHITECTURE.md` file. This decision prioritizes delivering a focused, working product and avoids the complexity of building a multi-file graph or wiki system (a V2 feature).
*   **TypeScript Strict Mode**: The project embraces TypeScript's strict mode, as evidenced by `tsconfig.json` (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`). This decision mandates explicit types, disallows implicit `any`s, and enforces rigorous error checking, leading to higher code quality, fewer bugs, and improved maintainability at the cost of slightly more verbose code.
*   **Commander.js for CLI**: `Commander.js` was chosen for its mature and simple API, which makes defining and managing CLI commands in `src/index.ts` straightforward and aligns with common Node.js CLI development patterns. This reduces the learning curve for contributors.
*   **Two Prompt Modes (Generate vs. Update)**: `src/core/gemini.ts` implements distinct system instructions (`GENERATE_SYSTEM_INSTRUCTION` and `UPDATE_SYSTEM_INSTRUCTION`) for initial architecture generation and subsequent incremental updates. This core product decision allows for comprehensive analysis during `init` and surgical, precise modifications during `update` or `run-hook`, significantly improving the quality and stability of updates.
*   **Custom Batched Git Calls**: The `src/core/gitReader.ts#batchedPromiseAll` utility is an intentional implementation choice to prevent the CLI from overwhelming the Git process with too many concurrent requests (e.g., `diff-tree` calls for each commit). This custom batching logic improves stability and resource usage when analyzing large commit ranges.

## Known Gaps and Limitations
*   **Significance Detection Heuristics**: The `SIGNIFICANCE_RULES` array in `src/utils/significant.ts` uses heuristics (e.g., changes to `package.json`, 5+ changed files) to decide if an `ARCHITECTURE.md` update is necessary. These rules may occasionally miss subtle but architecturally relevant changes or trigger unnecessary updates for minor code modifications that don't impact the architecture, leading to potential "noise" in the update cycle.
*   **File Size and Count Limits**: `src/core/fileReader.ts` imposes a `MAX_TOTAL_BYTES` (3MB) limit for all source files and a 100KB individual file size limit when reading source code for the AI. While necessary to manage context window usage, this means extremely large repositories or very large individual files might not be fully considered by Gemini, potentially leading to incomplete architectural understanding.
*   **Import Extraction Robustness**: The `extractImports` function in `src/core/dependencyGraph.ts` relies on regular expressions (`/from\s+['"]([^'"]+)['"]/g`, `/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g`) to identify module imports. This approach might not capture all possible JavaScript/TypeScript import syntaxes (e.g., dynamic imports, aliased imports, or specific framework-level imports) and could lead to an incomplete dependency graph, impacting the accuracy of `readNeighborFiles`.