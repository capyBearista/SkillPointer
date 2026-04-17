import fs from "node:fs";
import path from "node:path";

import type { PathProfile } from "./path-profiles";
import { getVaultRootPath } from "./presets";

export type StatsRun = {
  id: string;
  timestamp: string;
  operation: "init" | "maintain";
  movedCount: number;
  pointerCount: number;
  skippedCount: number;
  overrideCounts: Record<string, number>;
};

export type StatsStore = {
  version: 1;
  updatedAt: string;
  runs: StatsRun[];
};

const MAX_RUNS = 100;

export function getStatsFilePath(profiles: PathProfile[] = []): string {
  return path.join(getVaultRootPath(profiles), ".skillcat-stats.json");
}

export function defaultStatsStore(): StatsStore {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    runs: [],
  };
}

export function loadStatsStore(profiles: PathProfile[] = []): StatsStore {
  const statsPath = getStatsFilePath(profiles);
  if (!fs.existsSync(statsPath)) {
    return defaultStatsStore();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statsPath, "utf8")) as Partial<StatsStore>;
    const runs = Array.isArray(parsed.runs)
      ? parsed.runs.filter(
          (run): run is StatsRun =>
            typeof run === "object" &&
            run !== null &&
            typeof (run as StatsRun).id === "string" &&
            typeof (run as StatsRun).timestamp === "string" &&
            ((run as StatsRun).operation === "init" || (run as StatsRun).operation === "maintain") &&
            typeof (run as StatsRun).movedCount === "number" &&
            typeof (run as StatsRun).pointerCount === "number" &&
            typeof (run as StatsRun).skippedCount === "number" &&
            typeof (run as StatsRun).overrideCounts === "object",
        )
      : [];

    return {
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      runs,
    };
  } catch {
    return defaultStatsStore();
  }
}

export function saveStatsStore(store: StatsStore, profiles: PathProfile[] = []): void {
  const statsPath = getStatsFilePath(profiles);
  fs.mkdirSync(path.dirname(statsPath), { recursive: true });

  const normalized: StatsStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    runs: [...store.runs].slice(-MAX_RUNS),
  };

  fs.writeFileSync(statsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function appendRunStat(
  run: Omit<StatsRun, "id" | "timestamp">,
  profiles: PathProfile[] = [],
): StatsStore {
  const current = loadStatsStore(profiles);
  const nextRun: StatsRun = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    operation: run.operation,
    movedCount: run.movedCount,
    pointerCount: run.pointerCount,
    skippedCount: run.skippedCount,
    overrideCounts: run.overrideCounts,
  };

  const updated: StatsStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    runs: [...current.runs, nextRun].slice(-MAX_RUNS),
  };
  saveStatsStore(updated, profiles);
  return updated;
}

export function resetStats(profiles: PathProfile[] = []): StatsStore {
  const empty = defaultStatsStore();
  saveStatsStore(empty, profiles);
  return empty;
}

export function summarizeCategoryOverrides(runs: StatsRun[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const run of runs) {
    for (const [category, count] of Object.entries(run.overrideCounts)) {
      totals[category] = (totals[category] ?? 0) + count;
    }
  }
  return totals;
}
