import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "./app";
import { buildCatExitCard, renderBigExitBanner } from "./exit-message";
import { isRouteName, isSetupFlag, type RouteName } from "./routes";

function resolveRoute(argv: string[]): RouteName {
  const candidate = argv[2];

  if (candidate && isSetupFlag(candidate)) {
    console.error("SkillCat setup path is Python-backed in this phase.");
    console.error("Run: python -m skillcat --run-setup --agent opencode");
    console.error("   or: python -m skillcat --run-setup --agent claude");
    process.exit(2);
  }

  if (!candidate) {
    return "home";
  }
  if (isRouteName(candidate)) {
    return candidate;
  }
  return "home";
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  autoFocus: true,
});

let exitPrinted = false;

async function printFarewellAndExit(exitCode: number): Promise<void> {
  if (exitPrinted) {
    return;
  }
  exitPrinted = true;

  await renderer.destroy();
  const catCard = await buildCatExitCard();
  console.log(`\n${catCard}\n`);
  const fallbackBanner = await renderBigExitBanner();
  if (fallbackBanner) {
    console.log(`\n${fallbackBanner}\n`);
  } else {
    console.log("\n  SkillCat signs off with warm paws and clean terminals.\n");
  }
  process.exit(exitCode);
}

const startRoute = resolveRoute(process.argv);
createRoot(renderer).render(
  <App
    startRoute={startRoute}
    onExit={() => {
      void printFarewellAndExit(0);
    }}
  />,
);

renderer.keyInput.on("keypress", async (key) => {
  if (key.ctrl && key.name === "c") {
    await printFarewellAndExit(130);
  }
});

process.on("SIGINT", async () => {
  await printFarewellAndExit(130);
});

process.on("SIGTERM", async () => {
  await printFarewellAndExit(143);
});
