import { simpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import type {
  FileNode,
  FilesChanged,
} from "../types/index.js";
import { buildDependencyGraph } from "./dependencyGraph.js";

const MAX_TOTAL_BYTES = 3_000_000;

export interface DirectoryTree {
  name: string;
  type: "file" | "directory";
  children?: DirectoryTree[];
}

// Files that are always ignored
const ALWAYS_IGNORE = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv",
  ".DS_Store",
  "Thumbs.db",
  ".turbo",
  ".vercel",
  ".nuxt",
  "out",
]);

// File extensions that are binary / non-informative for LLM context
const IGNORE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".mp4",
  ".mp3",
  ".wav",
  ".mov",
  ".avi",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".exe",
  ".bin",
  ".dll",
  ".so",
  ".dylib",
  ".lock", // package-lock.json, yarn.lock etc. — huge, no context value
  ".map", // source maps
]);

async function getGitTrackedPaths(
  repoPath: string,
): Promise<Set<string> | undefined> {
  try {
    const git = simpleGit(repoPath);

    // ls-files lists every file git is currently tracking
    const raw = await git.raw(["ls-files"]);

    const tracked = new Set<string>();
    for (const line of raw.split("\n").filter(Boolean)) {
      // Add the file path AND every parent directory so we can include folders
      const parts = line.split("/");
      for (let i = 1; i <= parts.length; i++) {
        tracked.add(parts.slice(0, i).join("/"));
      }
    }

    return tracked;
  } catch {
    // Not a git repo — fall back to ALWAYS_IGNORE only
    return undefined;
  }
}

// TREE BUILDER //

function shouldIgnore(name: string, ext: string): boolean {
  return ALWAYS_IGNORE.has(name) || IGNORE_EXTENSIONS.has(ext);
}

function buildTree(
  dirPath: string,
  repoRoot: string,
  trackedPaths: Set<string> | undefined,
  depth: number,
  maxDepth: number,
): DirectoryTree[] {
  if (depth > maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: DirectoryTree[] = [];

  for (const entry of entries.sort((a, b) => {
    // Directories first, then files, both alphabetical
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  })) {
    const ext = path.extname(entry.name).toLowerCase();
    if (shouldIgnore(entry.name, ext)) continue;

    // Check against git-tracked paths if available
    const relativePath = path
      .relative(repoRoot, path.join(dirPath, entry.name))
      .replace(/\\/g, "/"); // normalize Windows paths

    if (trackedPaths && !trackedPaths.has(relativePath)) continue;

    if (entry.isDirectory()) {
      const children = buildTree(
        path.join(dirPath, entry.name),
        repoRoot,
        trackedPaths,
        depth + 1,
        maxDepth,
      );
      result.push({ name: entry.name, type: "directory", children });
    } else {
      result.push({ name: entry.name, type: "file" });
    }
  }

  return result;
}

// FORMATTERS //

export function treeToString(nodes: DirectoryTree[], indent = ""): string {
  let output = "";
  for (const node of nodes) {
    if (node.type === "directory") {
      output += `${indent}${node.name}/\n`;
      if (node.children?.length) {
        output += treeToString(node.children, indent + "  ");
      }
    } else {
      output += `${indent}${node.name}\n`;
    }
  }
  return output;
}

export function treeToFlatPaths(nodes: DirectoryTree[], prefix = ""): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "directory" && node.children) {
      paths.push(...treeToFlatPaths(node.children, fullPath));
    } else if (node.type === "file") {
      paths.push(fullPath);
    }
  }
  return paths;
}

// EXPORTS //

export interface RepoStructureResult {
  tree: DirectoryTree[];

  treeString: string;

  flatPaths: string[];

  stats: {
    totalFiles: number;
    totalDirectories: number;
    isGitRepo: boolean;
  };
}

export async function getRepoStructure(
  repoPath: string,
  maxDepth = 8,
): Promise<RepoStructureResult> {
  if (!fs.existsSync(repoPath)) {
    throw new Error(`Path does not exist: "${repoPath}"`);
  }

  // Try to get git-tracked paths — respects .gitignore automatically
  const trackedPaths = await getGitTrackedPaths(repoPath);

  // Build the nested tree
  const tree = buildTree(repoPath, repoPath, trackedPaths, 0, maxDepth);

  // Derive the other formats
  const treeString = treeToString(tree);
  const flatPaths = treeToFlatPaths(tree);

  // Count stats
  let totalFiles = 0;
  let totalDirectories = 0;
  function countNodes(nodes: DirectoryTree[]) {
    for (const node of nodes) {
      if (node.type === "file") totalFiles++;
      else {
        totalDirectories++;
        if (node.children) countNodes(node.children);
      }
    }
  }
  countNodes(tree);

  return {
    tree,
    treeString,
    flatPaths,
    stats: {
      totalFiles,
      totalDirectories,
      isGitRepo: trackedPaths !== undefined,
    },
  };
}

// FOR PROMPTS //
export async function getStructurePromptBlock(
  repoPath: string,
): Promise<string> {
  const { treeString, stats } = await getRepoStructure(repoPath);
  const repoName = path.basename(repoPath);

  return [
    `<repository_structure name="${repoName}">`,
    `Files: ${stats.totalFiles} | Directories: ${stats.totalDirectories}`,
    ``,
    treeString.trimEnd(),
    `</repository_structure>`,
  ].join("\n");
}

export async function readProjectIdentityFiles(
  repoPath: string,
): Promise<FileNode[]> {
  const IDENTITY_FILES = [
    // Universal
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    ".env.example",

    // JS / TS
    "package.json",
    "tsconfig.json",

    // Python
    "pyproject.toml",
    "requirements.txt",

    // Go
    "go.mod",

    // Rust
    "Cargo.toml",

    // Java
    "pom.xml",
    "build.gradle",

    // DevOps
    "Dockerfile",
    "docker-compose.yml",
  ];

  const IDENTITY_FILES_GLOB = [
    "vite.config", // check .ts and .js variants
    "next.config",
  ];

  const files: FileNode[] = [];
  for (const fileName of IDENTITY_FILES) {
    const filePath = path.join(repoPath, fileName);
    if (fs.existsSync(filePath)) {
      const fileContent = await fs.promises.readFile(filePath, "utf-8");
      files.push({
        path: fileName,
        content: fileContent,
        sizeInBytes: Buffer.byteLength(fileContent),
      });
    }
  }

  for (const base of IDENTITY_FILES_GLOB) {
    for (const ext of [".ts", ".js", ".mjs", ".cjs"]) {
      const filePath = path.join(repoPath, `${base}${ext}`);
      if (fs.existsSync(filePath)) {
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        files.push({
          path: base + ext,
          content: fileContent,
          sizeInBytes: Buffer.byteLength(fileContent),
        });
        break; // only need one variant
      }
    }
  }
  return files;
}

export async function readAllSourceFiles(
  repoPath: string,
): Promise<FileNode[]> {
  const sourceExtensions = new Set([
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".kt",
    ".scala",
    ".go",
    ".rs",
    ".rb",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".fs",
    ".php",
    ".vue",
    ".svelte",
    ".astro",
  ]);
  const { flatPaths } = await getRepoStructure(repoPath);

  let totalBytes = 0;
  const files: FileNode[] = [];
  for (const flatPath of flatPaths) {
    if (totalBytes >= MAX_TOTAL_BYTES) break;
    const filePath = path.join(repoPath, flatPath);
    const stats = fs.statSync(filePath);
    if (stats.size > 100_000) continue; // skip files larger than 100KB

    if (sourceExtensions.has(path.extname(flatPath))) {
      const fileContent = await fs.promises.readFile(filePath, "utf-8");
      files.push({
        path: flatPath,
        content: fileContent,
        sizeInBytes: Buffer.byteLength(fileContent),
      });
    }
  }
  return files;
}

export async function readChangedFiles(
  repoPath: string,
  files: FilesChanged,
): Promise<FileNode[]> {
  const allChanged = [...files.added, ...files.modified];

  const result: FileNode[] = [];
  for (const file of allChanged) {
    const filePath = path.join(repoPath, file);
    try {
      const fileContent = await fs.promises.readFile(filePath, "utf-8");
      result.push({
        path: file,
        content: fileContent,
        sizeInBytes: Buffer.byteLength(fileContent),
      });
    } catch (err) {
      console.error("Error reading changed files:", err);
    }
    }
  return result;
}

export async function readNeighborFiles(
  changedFiles: FilesChanged,
  allSourceFiles: FileNode[],
): Promise<FileNode[]> {
  // Build the graph once
  const graph = buildDependencyGraph(allSourceFiles);

  // Collect all changed file paths
  const changedPaths = new Set([
    ...changedFiles.added,
    ...changedFiles.modified,
  ]);

  // Find neighbors — one hop in either direction
  const neighborPaths = new Set<string>();

  for (const changedPath of changedPaths) {
    const node = graph.get(changedPath);
    if (!node) continue;

    // Files this changed file imports
    for (const imp of node.imports) {
      if (!changedPaths.has(imp)) {
        // don't add files already in changed set
        neighborPaths.add(imp);
      }
    }

    // Files that import this changed file
    for (const dep of node.importedBy) {
      if (!changedPaths.has(dep)) {
        neighborPaths.add(dep);
      }
    }
  }

  // Return FileNodes for all neighbors
  const neighborFiles: FileNode[] = [];

  for (const neighborPath of neighborPaths) {
    const fileNode = allSourceFiles.find((f) => f.path === neighborPath);
    if (fileNode) {
      neighborFiles.push(fileNode);
    }
  }

  return neighborFiles;
}
