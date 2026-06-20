import {
  getCurrentHash,
  getRecentHistory,
  getCommitRange,
  getChangedFilesInRange,
} from "./core/gitReader.js";

import {getRepoStructure, readAllSourceFiles, } from "./core/fileReader.js";

async function main() {
  // Path to ANY git repo you want to test against
  const repoPath = "."; // test against this project itself

  console.log("\n🔹 Current HEAD:");
  const head = await getCurrentHash(repoPath);
  console.log(head);

  console.log("\n🔹 Recent commits:");
  const history = await getRecentHistory(repoPath, 5);
  console.dir(history, { depth: null });

  if (history.length >= 2) {
    console.log("\n🔹 Commit range diff:");
    const range = await getCommitRange(
      repoPath,
      history[1].hash,
      history[0].hash,
    ); 

    console.dir(range, { depth: null });

    console.log("\n🔹 Net changed files:");
    const net = getChangedFilesInRange(range);
    console.log(net);
  }

  // File Reader functions

  getRepoStructure(repoPath).then((structure) => {
    console.log("\n🔹 Repo structure:");
    console.dir(structure, { depth: null });
  });

  const file = readAllSourceFiles(repoPath).then((files) => {
    console.log("\n🔹 Source files:");
    console.dir(files, { depth: null });
  });

}



main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
