import path from "path";
import type {
  FileNode,
  DependencyGraph,
  DependencyGraphNode,
} from "../types/index.js";
export function extractImports(content: string): string[] {
  const imports: string[] = [];

  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];

      if (!importPath) continue;
      if (!importPath.startsWith(".")) continue;

      imports.push(importPath);
    }
  }

  return imports;
}

export function resolveImport(
  importPath: string,
  fromFile: string, // file doing the importing: "src/lib/auth.ts"
  allFilePaths: Set<string>, // every file in the repo
): string | null {
  const fromDir = path.dirname(fromFile);

  const resolved = path
    .normalize(path.join(fromDir, importPath))
    .replace(/\\/g, "/");

  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.js`,
  ];

  for (const candidate of candidates) {
    if (allFilePaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildDependencyGraph(files: FileNode[]): DependencyGraph {
  const graph = new Map<string, DependencyGraphNode>();
  const allPaths = files.map((f) => f.path);
  const allPathsSet = new Set(allPaths);

  // First pass — initialize all nodes
  for (const file of files) {
    graph.set(file.path, {
      path: file.path,
      imports: [],
      importedBy: [],
    });
  }

  // Second pass — populate edges
  for (const file of files) {
    const rawImports = extractImports(file.content);

    for (const rawImport of rawImports) {
      const resolved = resolveImport(rawImport, file.path, allPathsSet);
      if (!resolved) continue;

      const fileNode = graph.get(file.path);
      const resolvedNode = graph.get(resolved);
      if (!fileNode || !resolvedNode) continue;
      
      // file imports resolved
      fileNode.imports.push(resolved);

      // resolved is importedBy file
      resolvedNode.importedBy.push(file.path);
    }
  }

  return graph;
}
