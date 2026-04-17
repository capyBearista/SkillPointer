import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyInitPlan,
  buildInitPlan,
  resolveDuplicateConflict,
  type InitPlan,
} from "./init-plan";
import type { PathProfile } from "./path-profiles";

type Workspace = {
  root: string;
  profileA: PathProfile;
  profileB: PathProfile;
};

function makeWorkspace(): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-init-plan-"));
  const activeA = path.join(root, "active-a");
  const activeB = path.join(root, "active-b");
  const sharedVault = path.join(root, "shared-vault");

  fs.mkdirSync(activeA, { recursive: true });
  fs.mkdirSync(activeB, { recursive: true });
  fs.mkdirSync(sharedVault, { recursive: true });

  fs.mkdirSync(path.join(activeA, "security-helper"), { recursive: true });
  fs.writeFileSync(path.join(activeA, "security-helper", "SKILL.md"), "---\nname: a\n---\n");

  fs.mkdirSync(path.join(activeB, "security-helper"), { recursive: true });
  fs.writeFileSync(path.join(activeB, "security-helper", "SKILL.md"), "---\nname: b\n---\n");

  const profileA: PathProfile = {
    id: "agents",
    label: "Agents",
    activeDir: activeA,
    vaultDir: sharedVault,
  };
  const profileB: PathProfile = {
    id: "claude",
    label: "Claude Code",
    activeDir: activeB,
    vaultDir: sharedVault,
  };

  return { root, profileA, profileB };
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function firstDuplicateConflict(plan: InitPlan): string {
  const duplicate = plan.conflicts.find((conflict) => conflict.kind === "duplicate-destination");
  assert.ok(duplicate, "expected a duplicate-destination conflict");
  return duplicate.id;
}

test("buildInitPlan is dry-run and reports duplicate destination conflicts", () => {
  const workspace = makeWorkspace();
  try {
    const plan = buildInitPlan({ profiles: [workspace.profileA, workspace.profileB] });

    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0]?.kind, "duplicate-destination");

    assert.ok(fs.existsSync(path.join(workspace.profileA.activeDir, "security-helper")));
    assert.ok(fs.existsSync(path.join(workspace.profileB.activeDir, "security-helper")));
    assert.ok(
      !fs.existsSync(path.join(workspace.profileA.vaultDir, "security", "security-helper")),
      "plan building must not mutate filesystem",
    );
  } finally {
    cleanup(workspace.root);
  }
});

test("buildInitPlan previews pointer outputs for final state after moves", () => {
  const workspace = makeWorkspace();
  try {
    const plan = buildInitPlan({ profiles: [workspace.profileA] });

    assert.equal(plan.moveOperations.length, 1);
    assert.equal(plan.pointerOperations.length, 1);

    const pointer = plan.pointerOperations[0];
    assert.equal(pointer.categoryName, "security");
    assert.equal(pointer.count, 1);
    assert.equal(pointer.skills.length, 1);
    assert.equal(pointer.skills[0]?.name, "security-helper");
    assert.ok(Array.isArray(pointer.skills[0]?.tags));
    assert.equal((pointer.skills[0]?.tags.length ?? 0) > 0, true);
    assert.equal(
      pointer.pointerPath,
      path.join(workspace.profileA.activeDir, "security-category-pointer", "SKILL.md"),
    );

    assert.ok(
      !fs.existsSync(pointer.pointerPath),
      "plan preview must not create pointer files before apply",
    );
  } finally {
    cleanup(workspace.root);
  }
});

test("applyInitPlan rejects apply when duplicate conflicts remain unresolved", () => {
  const workspace = makeWorkspace();
  try {
    const plan = buildInitPlan({ profiles: [workspace.profileA, workspace.profileB] });

    assert.throws(
      () => {
        applyInitPlan(plan, { batchConflictAction: "skip" });
      },
      /unresolved duplicate/i,
    );
  } finally {
    cleanup(workspace.root);
  }
});

test("applyInitPlan applies resolved duplicate and generates pointers", () => {
  const workspace = makeWorkspace();
  try {
    const initialPlan = buildInitPlan({ profiles: [workspace.profileA, workspace.profileB] });
    const duplicateId = firstDuplicateConflict(initialPlan);

    const resolvedPlan = resolveDuplicateConflict(
      initialPlan,
      duplicateId,
      path.join(workspace.profileB.activeDir, "security-helper"),
    );

    const result = applyInitPlan(resolvedPlan, { batchConflictAction: "skip" });

    assert.equal(result.status, "applied");
    assert.ok(fs.existsSync(path.join(workspace.profileB.vaultDir, "security", "security-helper")));
    assert.ok(fs.existsSync(path.join(workspace.profileA.activeDir, "security-category-pointer", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(workspace.profileB.activeDir, "security-category-pointer", "SKILL.md")));

    const pointerContent = fs.readFileSync(
      path.join(workspace.profileA.activeDir, "security-category-pointer", "SKILL.md"),
      "utf-8",
    );
    assert.match(pointerContent, /## Skills Index/);
    assert.match(pointerContent, /\*\*security-helper\*\*/);
    assert.match(pointerContent, /glob -> grep -> read/);

    assert.ok(
      fs.existsSync(path.join(workspace.profileA.activeDir, "security-helper")),
      "non-selected duplicate source should stay in-place",
    );
    assert.ok(!fs.existsSync(path.join(workspace.profileB.activeDir, "security-helper")));
  } finally {
    cleanup(workspace.root);
  }
});

test("applyInitPlan abort policy exits before mutation when destination conflict exists", () => {
  const workspace = makeWorkspace();
  try {
    const destination = path.join(workspace.profileA.vaultDir, "security", "security-helper");
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, "SKILL.md"), "---\nname: existing\n---\n");

    const plan = buildInitPlan({ profiles: [workspace.profileA] });
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0]?.kind, "destination-exists");

    const result = applyInitPlan(plan, { batchConflictAction: "abort" });
    assert.equal(result.status, "aborted");
    assert.equal(result.movedCount, 0);
    assert.equal(result.pointerCount, 0);

    assert.ok(fs.existsSync(path.join(workspace.profileA.activeDir, "security-helper")));
    assert.ok(fs.existsSync(destination));
  } finally {
    cleanup(workspace.root);
  }
});

test("applyInitPlan removes stale pointer folders during pointer regeneration", () => {
  const workspace = makeWorkspace();
  try {
    const stalePointer = path.join(workspace.profileA.activeDir, "stale-category-pointer");
    fs.mkdirSync(stalePointer, { recursive: true });
    fs.writeFileSync(path.join(stalePointer, "SKILL.md"), "stale");

    const plan = buildInitPlan({ profiles: [workspace.profileA] });
    const result = applyInitPlan(plan, { batchConflictAction: "skip" });
    assert.equal(result.status, "applied");

    assert.ok(!fs.existsSync(stalePointer));
    assert.ok(
      fs.existsSync(path.join(workspace.profileA.activeDir, "security-category-pointer", "SKILL.md")),
    );
  } finally {
    cleanup(workspace.root);
  }
});

test("buildInitPlan deduplicates planning for shared vault profiles", () => {
  const workspace = makeWorkspace();
  try {
    const profileA: PathProfile = {
      ...workspace.profileA,
      activeDir: workspace.profileA.activeDir,
      vaultDir: workspace.profileA.vaultDir,
    };
    const profileB: PathProfile = {
      ...workspace.profileB,
      activeDir: workspace.profileB.activeDir,
      vaultDir: workspace.profileA.vaultDir,
    };

    const plan = buildInitPlan({ profiles: [profileA, profileB] });
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.moveOperations.length, 0);

    const duplicateId = firstDuplicateConflict(plan);
    const resolved = resolveDuplicateConflict(
      plan,
      duplicateId,
      path.join(profileA.activeDir, "security-helper"),
    );

    assert.equal(resolved.moveOperations.length, 1);
    assert.equal(resolved.pointerOperations.length, 2);
    assert.ok(
      resolved.pointerOperations.every((operation) => operation.count === 1),
      "shared vault pointer preview should not double-count skills",
    );
  } finally {
    cleanup(workspace.root);
  }
});
