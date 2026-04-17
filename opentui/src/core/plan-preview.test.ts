import assert from "node:assert/strict";
import test from "node:test";

import { buildInitPlan } from "./init-plan";
import { buildMaintainPlan } from "./maintain-plan";
import {
  buildInitPreviewLines,
  buildMaintainPreviewLines,
} from "./plan-preview";
import type { PathProfile } from "./path-profiles";

const PROFILE: PathProfile = {
  id: "agents",
  label: "Agents",
  activeDir: "/tmp/active",
  vaultDir: "/tmp/vault",
};

test("buildInitPreviewLines includes exact category and skill names", () => {
  const plan = {
    ...buildInitPlan({ profiles: [] }),
    moveOperations: [
      {
        id: "move:1",
        sourceProfileId: "agents",
        sourcePath: "/tmp/active/skill-a",
        destinationPath: "/tmp/vault/security/skill-a",
        category: "security",
        skillName: "skill-a",
      },
    ],
    pointerOperations: [
      {
        profileId: "agents",
        activeDir: "/tmp/active",
        pointerName: "security-category-pointer",
        pointerPath: "/tmp/active/security-category-pointer/SKILL.md",
        categoryName: "security",
        categoryTitle: "Security",
        count: 1,
        libraryPath: "/tmp/vault/security",
        skills: [
          {
            name: "auth-hardening",
            description: "An auth hardening skill",
            path: "/tmp/vault/security/auth-hardening",
            tags: ["auth", "security"],
          }
        ],
      },
    ],
  };

  const lines = buildInitPreviewLines(plan);
  assert.ok(lines.includes("  - [security] skill-a"));
  assert.ok(lines.includes("  - [security] 1 skill(s)"));
  assert.ok(lines.includes("Derived tags (pre-apply):"));
  assert.ok(lines.includes("  - auth-hardening: auth, security"));
});

test("buildInitPreviewLines includes destination conflict transparency", () => {
  const plan = {
    ...buildInitPlan({ profiles: [] }),
    conflicts: [
      {
        id: "destination:/tmp/vault/security/skill-a",
        kind: "destination-exists" as const,
        destinationPath: "/tmp/vault/security/skill-a",
        operationId: "move:1",
      },
    ],
  };

  const lines = buildInitPreviewLines(plan);
  assert.ok(lines.includes("Potential destination conflicts (policy-dependent outcome):"));
  assert.ok(lines.includes("  - /tmp/vault/security/skill-a"));
});

test("buildMaintainPreviewLines includes exact move transitions", () => {
  const plan = {
    ...buildMaintainPlan({
      profiles: [PROFILE],
      actions: { recategorize: false, regeneratePointers: false },
    }),
    moveOperations: [
      {
        id: "recategorize:1",
        profileId: "agents",
        sourcePath: "/tmp/vault/misc/skill-a",
        destinationPath: "/tmp/vault/security/skill-a",
        skillName: "skill-a",
        fromCategory: "misc",
        toCategory: "security",
      },
    ],
    pointerOperations: [
      {
        profileId: "agents",
        pointerPath: "/tmp/active/security-category-pointer/SKILL.md",
        categoryName: "security",
        categoryTitle: "Security",
        count: 3,
        libraryPath: "/tmp/vault/security",
        skills: [],
      },
    ],
  };

  const lines = buildMaintainPreviewLines(plan);
  assert.ok(lines.includes("  - skill-a: misc -> security"));
  assert.ok(lines.includes("  - [security] 3 skill(s)"));
});
