import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyMaintainPlan,
  buildMaintainPlan,
  type MaintainPlan,
  type MaintainConflict,
} from "./maintain-plan";
import type { PathProfile } from "./path-profiles";

type Fixture = {
  root: string;
  profile: PathProfile;
};

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-maintain-"));
  const activeDir = path.join(root, "active");
  const vaultDir = path.join(root, "vault");

  fs.mkdirSync(activeDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });

  const wrongCategorySkill = path.join(vaultDir, "misc", "security-helper");
  fs.mkdirSync(wrongCategorySkill, { recursive: true });
  fs.writeFileSync(path.join(wrongCategorySkill, "SKILL.md"), "---\nname: security-helper\n---\n");

  fs.mkdirSync(path.join(vaultDir, "security", "security-helper"), { recursive: true });
  fs.writeFileSync(
    path.join(vaultDir, "security", "security-helper", "SKILL.md"),
    "---\nname: security-helper\n---\n",
  );

  fs.mkdirSync(path.join(vaultDir, "security", "auth-hardening"), { recursive: true });
  fs.writeFileSync(
    path.join(vaultDir, "security", "auth-hardening", "SKILL.md"),
    "---\nname: auth-hardening\n---\n",
  );

  const profile: PathProfile = {
    id: "agents",
    label: "Agents",
    activeDir,
    vaultDir,
  };

  return { root, profile };
}

function createFixtureWithSharedVault(sharedVaultDir: string, id: PathProfile["id"]): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-maintain-shared-"));
  const activeDir = path.join(root, `active-${id}`);
  fs.mkdirSync(activeDir, { recursive: true });

  const profile: PathProfile = {
    id,
    label: id,
    activeDir,
    vaultDir: sharedVaultDir,
  };

  return { root, profile };
}

function destroyFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function destinationConflict(plan: MaintainPlan): string {
  const conflict = plan.conflicts.find(
    (item: MaintainConflict) => item.kind === "destination-exists",
  );
  assert.ok(conflict, "expected destination conflict");
  return conflict.id;
}

test("buildMaintainPlan respects toggleable actions in one plan", async () => {
  const fixture = createFixture();
  try {
    const plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: {
        recategorize: false,
        regeneratePointers: true,
      },
    });

    assert.equal(plan.moveOperations.length, 0);
    assert.equal(plan.pointerOperations.length, 2);
  } finally {
    destroyFixture(fixture.root);
  }
});

test("buildMaintainPlan creates preview-only recategorize move with destination conflict", async () => {
  const fixture = createFixture();
  try {
    const plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: {
        recategorize: true,
        regeneratePointers: true,
      },
    });

    assert.equal(plan.moveOperations.length, 1);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0]?.kind, "destination-exists");

    assert.ok(
      fs.existsSync(path.join(fixture.profile.vaultDir, "misc", "security-helper")),
      "plan generation must not mutate vault",
    );
  } finally {
    destroyFixture(fixture.root);
  }
});

test("applyMaintainPlan supports batch skip for destination conflicts", async () => {
  const fixture = createFixture();
  try {
    const plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: {
        recategorize: true,
        regeneratePointers: true,
      },
    });

    const result = await applyMaintainPlan(plan, { batchConflictAction: "skip", selectedMoves: new Set(plan.moveOperations.map(op => op.id)) });

    assert.equal(result.status, "applied");
    assert.equal(result.movedCount, 0);
    assert.ok(fs.existsSync(path.join(fixture.profile.vaultDir, "misc", "security-helper")));
    assert.ok(
      fs.existsSync(path.join(fixture.profile.activeDir, "security-category-pointer", "SKILL.md")),
    );

    const securityPointer = plan.pointerOperations.find(
      (pointer) => pointer.categoryName === "security",
    );
    assert.ok(securityPointer);
    assert.equal((securityPointer?.skills[0]?.tags.length ?? 0) > 0, true);

    const pointerContent = fs.readFileSync(
      path.join(fixture.profile.activeDir, "security-category-pointer", "SKILL.md"),
      "utf-8",
    );
    assert.match(pointerContent, /## Skills Index/);
    assert.match(pointerContent, /glob -> grep -> read/);

    const conflictId = destinationConflict(plan);
    assert.ok(conflictId.startsWith("destination:"));
  } finally {
    destroyFixture(fixture.root);
  }
});

test("buildMaintainPlan keeps pointer previews scoped per profile", async () => {
  const fixtureA = createFixture();
  const fixtureB = createFixture();
  try {
    const extraSkillDir = path.join(fixtureB.profile.vaultDir, "programming", "ts-helper");
    fs.mkdirSync(extraSkillDir, { recursive: true });
    fs.writeFileSync(path.join(extraSkillDir, "SKILL.md"), "---\nname: ts-helper\n---\n");

    const plan = await buildMaintainPlan({
      profiles: [fixtureA.profile, fixtureB.profile],
      actions: {
        recategorize: false,
        regeneratePointers: true,
      },
    });

    const pointersForA = plan.pointerOperations.filter((pointer) =>
      pointer.pointerPath.startsWith(fixtureA.profile.activeDir),
    );
    const pointersForB = plan.pointerOperations.filter((pointer) =>
      pointer.pointerPath.startsWith(fixtureB.profile.activeDir),
    );

    const namesA = pointersForA.map((pointer) => pointer.categoryName).sort();
    const namesB = pointersForB.map((pointer) => pointer.categoryName).sort();

    assert.deepEqual(namesA, ["misc", "security"]);
    assert.deepEqual(namesB, ["misc", "programming", "security"]);
  } finally {
    destroyFixture(fixtureA.root);
    destroyFixture(fixtureB.root);
  }
});

test("buildMaintainPlan deduplicates recategorize moves for shared vault profiles", async () => {
  const fixture = createFixture();
  const sharedA = createFixtureWithSharedVault(fixture.profile.vaultDir, "agents");
  const sharedB = createFixtureWithSharedVault(fixture.profile.vaultDir, "claude");

  try {
    const plan = await buildMaintainPlan({
      profiles: [sharedA.profile, sharedB.profile],
      actions: {
        recategorize: true,
        regeneratePointers: false,
      },
    });

    assert.equal(plan.moveOperations.length, 1);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.moveOperations[0]?.sourcePath, path.join(fixture.profile.vaultDir, "misc", "security-helper"));
  } finally {
    destroyFixture(sharedA.root);
    destroyFixture(sharedB.root);
    destroyFixture(fixture.root);
  }
});

test("applyMaintainPlan abort policy exits before mutation when conflicts exist", async () => {
  const fixture = createFixture();
  try {
    const plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: {
        recategorize: true,
        regeneratePointers: false,
      },
    });

    const result = await applyMaintainPlan(plan, { batchConflictAction: "abort", selectedMoves: new Set(plan.moveOperations.map(op => op.id)) });
    assert.equal(result.status, "aborted");
    assert.equal(result.movedCount, 0);
    assert.equal(result.pointerCount, 0);

    assert.ok(fs.existsSync(path.join(fixture.profile.vaultDir, "misc", "security-helper")));
  } finally {
    destroyFixture(fixture.root);
  }
});

import crypto from "node:crypto";

function computeHash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

test("buildMaintainPlan semantic override logic", async (t) => {
  const fixture = createFixture();
  try {
    const unknownSkill = path.join(fixture.profile.vaultDir, "misc", "unknown-tool");
    fs.mkdirSync(unknownSkill, { recursive: true });
    fs.writeFileSync(path.join(unknownSkill, "SKILL.md"), "---\nname: unknown-tool\n---\n");

    const authContent = "---\nname: auth-hardening\n---\n";
    const authDesc = "No description provided.";
    const authContentHash = computeHash(authContent);
    const authDescHash = computeHash(authDesc);

    const unkContent = "---\nname: unknown-tool\n---\n";
    const unkDesc = "No description provided.";
    const unkContentHash = computeHash(unkContent);
    const unkDescHash = computeHash(unkDesc);

    const writeIndex = (authConf: number, authAltConf: number, unkConf: number) => {
      const indexData = {
        version: 1,
        model: { id: "test", revision: "1", dim: 0 },
        updatedAt: new Date().toISOString(),
        skills: {
          "auth-hardening": {
            name: "auth-hardening",
            descriptionHash: authDescHash,
            contentHash: authContentHash,
            tags: [],
            predictedCategory: {
              name: "ai-ml",
              confidence: authConf,
              alternatives: [{ name: "web-dev", confidence: authAltConf }],
            },
            lastComputedAt: new Date().toISOString(),
            source: { provider: "local-ml", fallbackUsed: false }
          },
          "unknown-tool": {
            name: "unknown-tool",
            descriptionHash: unkDescHash,
            contentHash: unkContentHash,
            tags: [],
            predictedCategory: {
              name: "ai-ml",
              confidence: unkConf,
              alternatives: [],
            },
            lastComputedAt: new Date().toISOString(),
            source: { provider: "local-ml", fallbackUsed: false }
          }
        }
      };
      fs.writeFileSync(path.join(fixture.profile.vaultDir, ".skillcat-index.json"), JSON.stringify(indexData));
    };

    // Test 1: 0.75 vs 0.70 (margin 0.05) -> FAILS
    writeIndex(0.75, 0.70, 0.0);
    let plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: { recategorize: true, regeneratePointers: false },
    });
    let move = plan.moveOperations.find(m => m.skillName === "auth-hardening");
    assert.equal(move, undefined);

    // Test 2: 0.75 vs 0.60 (margin 0.15) -> PASSES
    writeIndex(0.75, 0.60, 0.0);
    plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: { recategorize: true, regeneratePointers: false },
    });
    move = plan.moveOperations.find(m => m.skillName === "auth-hardening");
    assert.equal(move?.toCategory, "ai-ml");
    assert.equal(move?.isSemanticOverride, true);

    // Test 3: 0.65 on _uncategorized -> PASSES
    writeIndex(0.0, 0.0, 0.65);
    plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: { recategorize: true, regeneratePointers: false },
    });
    move = plan.moveOperations.find(m => m.skillName === "unknown-tool");
    assert.equal(move?.toCategory, "ai-ml");
    assert.equal(move?.isSemanticOverride, true);

  } finally {
    destroyFixture(fixture.root);
  }
});

test("applyMaintainPlan removes stale pointer folders during regeneration", async () => {
  const fixture = createFixture();
  try {
    const stalePointerDir = path.join(fixture.profile.activeDir, "orphan-category-pointer");
    fs.mkdirSync(stalePointerDir, { recursive: true });
    fs.writeFileSync(path.join(stalePointerDir, "SKILL.md"), "orphan\n");

    const plan = await buildMaintainPlan({
      profiles: [fixture.profile],
      actions: {
        recategorize: false,
        regeneratePointers: true,
      },
    });
    const result = await applyMaintainPlan(plan, { batchConflictAction: "skip", selectedMoves: new Set(plan.moveOperations.map(op => op.id)) });

    assert.equal(result.status, "applied");
    assert.ok(!fs.existsSync(stalePointerDir));
  } finally {
    destroyFixture(fixture.root);
  }
});
