import { Command } from "commander";
import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { installHook, runHook } from "./commands/hook.js";

function main() {
  const program = new Command();

  program
    .name("archie")
    .description(
      "Auto-generates and maintains ARCHITECTURE.md for any codebase.",
    )
    .version("1.0.0");

  program
    .command("init")
    .description("Initialize Archie and generate ARCHITECTURE.md")
    .action(async () => {
      await init(process.cwd());
    });

  program
    .command("update")
    .description("Manually refresh ARCHITECTURE.md")
    .action(async () => {
      await update(process.cwd());
    });

  program
    .command("hook")
    .description("Install git post-commit hook for auto-updates")
    .action(async () => {
      await installHook(process.cwd());
    });

  program
    .command("run-hook", { hidden: true })
    .description("Internal: called by git post-commit hook")
    .action(async () => {
      await runHook(process.cwd());
    });

  program.parseAsync(process.argv).catch((err) => {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  });
}

main();
