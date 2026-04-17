import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPresetRulesFromCandidates,
  defaultPresetStore,
  findPresetMatches,
  getPresetsFilePath,
  loadPresetStore,
  matchPresetCategory,
  mergePresetRules,
  savePresetStore,
  type PresetStore,
} from "./presets";
import type { PathProfile } from "./path-profiles";

function makeProfile(vaultDir: string): PathProfile {
  return {
    id: "agents",
    label: "Agents",
    activeDir: path.join(vaultDir, "active"),
    vaultDir,
  };
}

test("save/load preset store persists rules to vault root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-presets-"));
  try {
    const profile = makeProfile(path.join(root, "vault"));
    const store: PresetStore = {
      version: 1,
      updatedAt: new Date().toISOString(),
      rules: [
        { pattern: "**/*react*", category: "frontend" },
        { pattern: "aws-skill", category: "devops" },
      ],
    };

    savePresetStore(store, [profile]);
    const loaded = loadPresetStore([profile]);

    assert.equal(loaded.rules.length, 2);
    assert.equal(loaded.rules[0]?.category.length ? true : false, true);
    assert.ok(fs.existsSync(getPresetsFilePath([profile])));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preset matching precedence exact over glob and picks most specific pattern", () => {
  const store: PresetStore = {
    ...defaultPresetStore(),
    rules: [
      { pattern: "**/*auth*", category: "security" },
      { pattern: "/tmp/skills/security-auth-skill", category: "security" },
      { pattern: "**/*skill", category: "programming" },
      { pattern: "**/*security-auth*", category: "security" },
    ],
  };

  const exact = matchPresetCategory("/tmp/skills/security-auth-skill", store);
  assert.equal(exact.needsDisambiguation, false);
  assert.equal(exact.category, "security");

  const glob = matchPresetCategory("/tmp/skills/security-auth-helper", store);
  assert.equal(glob.needsDisambiguation, false);
  assert.equal(glob.category, "security");
});

test("matchPresetCategory signals disambiguation when patterns tie", () => {
  const store: PresetStore = {
    ...defaultPresetStore(),
    rules: [
      { pattern: "security", category: "security" },
      { pattern: "security", category: "backend-dev" },
    ],
  };

  const result = matchPresetCategory("/tmp/vault/security/my-skill", store);
  assert.equal(result.needsDisambiguation, true);
  assert.equal(result.matches.length, 2);
});

test("buildPresetRulesFromCandidates supports save-all save-selected and discard", () => {
  const candidates = [
    { skillName: "a", category: "security", path: "/tmp/a" },
    { skillName: "b", category: "frontend", path: "/tmp/b" },
  ];

  const all = buildPresetRulesFromCandidates(candidates, "save-all");
  assert.equal(all.length, 2);

  const selected = buildPresetRulesFromCandidates(candidates, "save-selected", [1]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.pattern, "/tmp/b");

  const discarded = buildPresetRulesFromCandidates(candidates, "discard");
  assert.equal(discarded.length, 0);
});

test("mergePresetRules overwrites by pattern deterministically", () => {
  const base: PresetStore = {
    ...defaultPresetStore(),
    rules: [
      { pattern: "/tmp/a", category: "security" },
      { pattern: "/tmp/b", category: "frontend" },
    ],
  };

  const merged = mergePresetRules(base, [
    { pattern: "/tmp/b", category: "web-dev" },
    { pattern: "/tmp/c", category: "backend-dev" },
  ]);

  assert.equal(merged.rules.length, 3);
  const ruleB = merged.rules.find((rule) => rule.pattern === "/tmp/b");
  assert.equal(ruleB?.category, "web-dev");

  const sorted = [...merged.rules].sort((left, right) => left.pattern.localeCompare(right.pattern));
  assert.deepEqual(merged.rules, sorted);
});

test("findPresetMatches supports glob syntax", () => {
  const store: PresetStore = {
    ...defaultPresetStore(),
    rules: [{ pattern: "**/*react*", category: "frontend" }],
  };

  const matches = findPresetMatches("/tmp/skills/my-react-tool", store);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule.category, "frontend");
});
