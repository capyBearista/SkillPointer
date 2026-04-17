import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildKnownPathProfiles,
  createInitialPathSelection,
  detectPathProfiles,
  getSelectedProfiles,
  type PathProfile,
} from "./path-profiles";

test("buildKnownPathProfiles can disable sandbox profile when needed", () => {
  const homeDir = makeTempHome();
  try {
    const profiles = buildKnownPathProfiles({ homeDir, includeSandbox: false });
    assert.equal(profiles.some((profile) => profile.id === "sandbox"), false);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-paths-"));
}

test("detectPathProfiles returns only existing supported active skill directories", () => {
  const homeDir = makeTempHome();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-workspace-"));

  try {
    fs.mkdirSync(path.join(homeDir, ".config", "opencode", "skills"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(homeDir, ".claude", "skills"), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, ".skill-test", "skills"), { recursive: true });

    const detected = detectPathProfiles({ homeDir, workspaceRoot });
    const ids = detected.map((profile: PathProfile) => profile.id).sort();

    assert.deepEqual(ids, ["claude", "opencode", "sandbox"]);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("createInitialPathSelection has no preselected defaults", () => {
  const homeDir = makeTempHome();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-workspace-"));
  try {
    const profiles = buildKnownPathProfiles({ homeDir, workspaceRoot });
    const selection = createInitialPathSelection(profiles);

    for (const profile of profiles) {
      assert.equal(selection[profile.id], false);
    }
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("getSelectedProfiles reflects checkbox-style selections", () => {
  const homeDir = makeTempHome();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-workspace-"));
  try {
    const profiles = buildKnownPathProfiles({ homeDir, workspaceRoot });
    const selection = createInitialPathSelection(profiles);
    selection.opencode = true;
    selection.agents = true;

    const selected = getSelectedProfiles(profiles, selection);
    const ids = selected.map((profile: PathProfile) => profile.id).sort();

    assert.deepEqual(ids, ["agents", "opencode"]);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
