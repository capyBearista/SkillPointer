#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const entrypoint = path.join(projectRoot, "opentui", "src", "index.tsx");

function run() {
  const args = process.argv.slice(2);
  const child = spawn("bun", ["run", entrypoint, ...args], {
    stdio: "inherit",
  });

  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      console.error("SkillCat requires Bun for interactive mode.");
      console.error("Install Bun: https://bun.sh/docs/installation");
      process.exitCode = 1;
      return;
    }
    console.error(`Failed to start SkillCat: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 0;
  });
}

run();
