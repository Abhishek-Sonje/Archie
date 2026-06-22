export type ReadMode = "full" | "incremental";

export interface FileReaderOptions {
  mode: ReadMode;
  changedFiles?: string[];
  repoPath: string;
}

export interface ArchieState {
  lastProcessedCommit: string;
  lastUpdated: string;
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
  timestamp: string;
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

export interface DependencyGraphNode {
  path: string;
  imports: string[];
  importedBy: string[];
}

export type DependencyGraph = Map<string, DependencyGraphNode>;

export interface ArchieConfig {
  projectDescription: string | null;
  keyDecisions: string | null;
  thingsToTrack: string | null;
  neverChange: string | null;
  stackContext: string | null;
  raw: string;
}

export interface GeminiGenerateInput {
  userConfig: string | null; 
  identityFiles: FileNode[];
  treeString: string;
  sourceFiles: FileNode[];
  gitHistory: ProcessedCommit[];
}

export interface GeminiUpdateInput {
  userConfig: string | null; 
  existingArchitecture: string;
  commitRange: CommitRange;
  changedFiles: FileNode[];
  neighborFiles: FileNode[];
}
