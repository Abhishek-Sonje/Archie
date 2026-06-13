export type ReadMode = "full" | "incremental";

export interface FileReaderOptions {
  mode: ReadMode;
  changedFiles: string[]; // only used in incremental mode
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
  filesChanged: string[];
}
