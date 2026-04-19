import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanState,
  onHomeEnter,
  onInitSelectPathsEnter,
  type InitStep,
} from "./init-flow";
import type { PathProfile, PathSelectionState } from "./path-profiles";

const PROFILES: PathProfile[] = [
  {
    id: "agents",
    label: "Agents",
    activeDir: "/tmp/agents",
    vaultDir: "/tmp/vault",
  },
  {
    id: "opencode",
    label: "OpenCode",
    activeDir: "/tmp/opencode",
    vaultDir: "/tmp/vault",
  },
];

function selectionState(overrides: Partial<PathSelectionState>): PathSelectionState {
  return {
    agents: false,
    opencode: false,
    claude: false,
    sandbox: false,
    ...overrides,
  };
}

test("home enter transitions to init select-paths and page focus", async () => {
  const selected = [PROFILES[1]!];
  const result = onHomeEnter(PROFILES, selected, selectionState({ agents: true }));

  assert.equal(result.route, "init");
  assert.equal(result.focusMode, "page");
  assert.equal(result.pathCursor, 0);
  assert.equal(result.initStep, "select-paths");
  assert.deepEqual(result.nextSelection, selectionState({ opencode: true }));
});

test("init enter with no selected path moves to result with guidance", async () => {
  const result = await onInitSelectPathsEnter(PROFILES, selectionState({}));

  assert.equal(result.nextStep, "result");
  assert.equal(result.resultLines[0], "Select at least one source path before continuing.");
  assert.equal(result.plan, null);
});

test("init enter with selected path builds plan and advances", async () => {
  const result = await onInitSelectPathsEnter(PROFILES, selectionState({ agents: true }));

  assert.ok(result.plan, "expected plan to be generated");
  assert.equal(result.nextStep === "resolve-duplicates" || result.nextStep === "ready", true);
  assert.equal(result.duplicateCursor, 0);
  assert.equal(result.duplicateChoiceCursor, 0);
});

test("buildPlanState advances to resolve-duplicates when unresolved duplicates exist", async () => {
  const step = buildPlanState({
    conflicts: [{ kind: "duplicate-destination" }],
  });

  assert.equal(step, "resolve-duplicates");
});

test("buildPlanState advances to ready when no duplicate conflicts exist", async () => {
  const step: InitStep = buildPlanState({ conflicts: [] });
  assert.equal(step, "ready");
});
