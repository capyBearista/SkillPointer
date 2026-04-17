import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendRunStat,
  defaultStatsStore,
  getStatsFilePath,
  loadStatsStore,
  resetStats,
  saveStatsStore,
  summarizeCategoryOverrides,
  type StatsStore,
} from "./stats";
import type { PathProfile } from "./path-profiles";

function makeProfile(vaultDir: string): PathProfile {
  return {
    id: "agents",
    label: "Agents",
    activeDir: path.join(vaultDir, "active"),
    vaultDir,
  };
}

test("stats persistence keeps rolling 100 runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-stats-"));
  try {
    const profile = makeProfile(path.join(root, "vault"));

    for (let index = 0; index < 120; index += 1) {
      appendRunStat(
        {
          operation: index % 2 === 0 ? "init" : "maintain",
          movedCount: index,
          pointerCount: 1,
          skippedCount: 0,
          overrideCounts: { security: 1 },
        },
        [profile],
      );
    }

    const stats = loadStatsStore([profile]);
    assert.equal(stats.runs.length, 100);
    assert.ok(fs.existsSync(getStatsFilePath([profile])));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("summarizeCategoryOverrides aggregates per-category counts", () => {
  const stats: StatsStore = {
    ...defaultStatsStore(),
    runs: [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        operation: "init",
        movedCount: 1,
        pointerCount: 2,
        skippedCount: 0,
        overrideCounts: { security: 2, frontend: 1 },
      },
      {
        id: "2",
        timestamp: new Date().toISOString(),
        operation: "maintain",
        movedCount: 1,
        pointerCount: 2,
        skippedCount: 0,
        overrideCounts: { security: 1 },
      },
    ],
  };

  const summary = summarizeCategoryOverrides(stats.runs);
  assert.equal(summary.security, 3);
  assert.equal(summary.frontend, 1);
});

test("resetStats clears stats file contents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcat-stats-reset-"));
  try {
    const profile = makeProfile(path.join(root, "vault"));
    const seeded: StatsStore = {
      ...defaultStatsStore(),
      runs: [
        {
          id: "seed",
          timestamp: new Date().toISOString(),
          operation: "init",
          movedCount: 2,
          pointerCount: 2,
          skippedCount: 0,
          overrideCounts: { backend: 1 },
        },
      ],
    };

    saveStatsStore(seeded, [profile]);
    const reset = resetStats([profile]);
    assert.equal(reset.runs.length, 0);

    const loaded = loadStatsStore([profile]);
    assert.equal(loaded.runs.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
