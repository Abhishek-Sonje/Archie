import fs from "fs";
import path from "path";
export async function writeArchitecture(
  repoPath: string,
  content: string,
): Promise<void> {
  const outputPath = path.join(repoPath, "ARCHITECTURE.md");
  await fs.promises.writeFile(outputPath, content);
}

export async function readExistingArchitecture(
  repoPath: string,
): Promise<string | null> {
  const archPath = path.join(repoPath, "ARCHITECTURE.md");
  try {
    return await fs.promises.readFile(archPath, "utf-8");
  } catch (err) {
    return null;
  }
}
