export type ReadMode = "full" | "incremental";

export interface FileReaderOptions {
  mode: ReadMode;
  changedFiles?: string[]; // only used in incremental mode
  repoPath: string;
}

export interface ArchieState {
  lastProcessedCommit: string;
  lastUpdated: string; // ISO date string
  totalRuns: number;
  initialized: boolean;
}

export interface CommitRange {
  from: string;
  to: string;
  commits: ProcessedCommit[];
}

export interface ProcessedCommit {
  hash: string;
  message: string;
  timestamp: string; // ISO date string
  filesChanged: FilesChanged;
}

export interface FilesChanged {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface FileNode {
  path: string;
  content: string;
  sizeInBytes: number;
}

export interface RepoSnapshot {
  mode: ReadMode;
  repoPath: string;
  directoryTree: string;
  identityFile: FileNode[]; //Package.json, tsconfig.json, etc
  sourceFile: FileNode[];
  totalFiles: number;
  estimatedToken: number;
}

export interface GeminiInput {
  mode: "generate" | "update";
  repoSnapshot: RepoSnapshot;
  gitHistory: ProcessedCommit[];
  userConfig: string | null;
  existingArchitecture: string | null;
}

export interface GeminiOutput {
  tokenUsed: number;
  content: string;
}

export interface ArchieConfig {
  projectDescription: string | null;
  keyDecisions: string | null;
  thingsToTrack: string | null;
  neverChange: string | null; // sections Archie must not overwrite
  stackContext: string | null; // extra context about internal tools
  raw: string; // full raw content — passed to Gemini as-is
}
