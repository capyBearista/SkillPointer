import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildBrowseIndex, type BrowseCategory } from "./browse-data";
import type { PathProfile } from "./path-profiles";

function setupVaultFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-browse-"));
  const vault = path.join(root, "vault");
  fs.mkdirSync(vault, { recursive: true });

  const securitySkillDir = path.join(vault, "security", "security-helper");
  fs.mkdirSync(securitySkillDir, { recursive: true });
  fs.writeFileSync(
    path.join(securitySkillDir, "SKILL.md"),
    "---\nname: security-helper\ndescription: Harden auth flows\n---\n\n# Security Helper\n",
    "utf-8",
  );

  const programmingSkillDir = path.join(vault, "programming", "typescript-tooling");
  fs.mkdirSync(programmingSkillDir, { recursive: true });
  fs.writeFileSync(
    path.join(programmingSkillDir, "SKILL.md"),
    "---\nname: typescript-tooling\ndescription: Improve TS ergonomics\n---\n",
    "utf-8",
  );

  const profile: PathProfile = {
    id: "opencode",
    label: "OpenCode",
    activeDir: path.join(root, "active"),
    vaultDir: vault,
  };

  return { root, profile };
}

test("buildBrowseIndex groups by category and exposes name description path", () => {
  const fixture = setupVaultFixture();

  try {
    const index = buildBrowseIndex([fixture.profile]);

    assert.equal(index.categories.length, 2);
    assert.equal(index.totalSkills, 2);

    const securityCategory = index.categories.find(
      (category: BrowseCategory) => category.name === "security",
    );
    assert.ok(securityCategory, "security category should exist");
    assert.equal(securityCategory.skills.length, 1);

    const skill = securityCategory.skills[0];
    assert.equal(skill.name, "security-helper");
    assert.equal(skill.description, "Harden auth flows");
    assert.equal(
      skill.path,
      path.join(fixture.profile.vaultDir, "security", "security-helper"),
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("buildBrowseIndex deduplicates entries when profiles share the same vault", () => {
  const fixture = setupVaultFixture();

  try {
    const mirrorProfile: PathProfile = {
      id: "claude",
      label: "Claude Code",
      activeDir: path.join(fixture.root, "another-active"),
      vaultDir: fixture.profile.vaultDir,
    };

    const index = buildBrowseIndex([fixture.profile, mirrorProfile]);
    assert.equal(index.totalSkills, 2);

    const allPaths = index.categories.flatMap((category) =>
      category.skills.map((skill) => skill.path),
    );
    const uniquePaths = new Set(allPaths);
    assert.equal(uniquePaths.size, allPaths.length);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
