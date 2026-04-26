import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureSandboxEnvironment,
  getSandboxPaths,
  resetSandboxEnvironment,
} from "./sandbox";

test("ensureSandboxEnvironment seeds sample skills and snapshot", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-sandbox-"));
  try {
    const result = ensureSandboxEnvironment(workspace);
    assert.equal(result.skillCount > 0, true);
    assert.ok(fs.existsSync(result.skillsDir));
    assert.ok(fs.existsSync(result.snapshotDir));
    assert.ok(fs.existsSync(result.vaultDir));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("resetSandboxEnvironment restores skills and clears vault", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-sandbox-reset-"));
  try {
    const setup = ensureSandboxEnvironment(workspace);
    const sampleSkill = path.join(setup.skillsDir, "ad-hoc-skill");
    fs.mkdirSync(sampleSkill, { recursive: true });
    fs.writeFileSync(path.join(sampleSkill, "SKILL.md"), "---\nname: ad-hoc\n---\n", "utf8");

    const vaultTemp = path.join(setup.vaultDir, "security", "temp-skill");
    fs.mkdirSync(vaultTemp, { recursive: true });
    fs.writeFileSync(path.join(vaultTemp, "SKILL.md"), "---\nname: temp\n---\n", "utf8");

    const reset = resetSandboxEnvironment(workspace);
    assert.equal(reset.restoredSkillCount, setup.skillCount);
    assert.ok(!fs.existsSync(sampleSkill));

    const vaultEntries = fs.readdirSync(reset.vaultDir);
    assert.equal(vaultEntries.length, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("getSandboxPaths uses project-relative directories", () => {
  const root = "/tmp/skillcat-project";
  const paths = getSandboxPaths(root);
  assert.equal(paths.skillsDir, path.join(root, ".test", "skills"));
  assert.equal(paths.vaultDir, path.join(root, ".test-vault"));
});
