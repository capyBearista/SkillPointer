import { useEffect, useMemo, useState } from "react";

import {
  getStatsFilePath,
  loadStatsStore,
  summarizeCategoryOverrides,
  type StatsStore,
} from "../core/stats";
import type { PathProfile } from "../core/path-profiles";
import type { ThemePack } from "../theme-registry";

export type StatsRouteProps = {
  theme: ThemePack;
  profiles: PathProfile[];
  resetArmed: boolean;
  resetInput: string;
  resetPhrase: string;
  refreshNonce?: number;
};

function formatBar(value: number, max: number, width = 20): string {
  if (max <= 0) {
    return "-".repeat(width);
  }
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

export function StatsRoute({
  theme,
  profiles,
  resetArmed,
  resetInput,
  resetPhrase,
  refreshNonce = 0,
}: StatsRouteProps) {
  const [store, setStore] = useState<StatsStore>(loadStatsStore(profiles));

  useEffect(() => {
    setStore(loadStatsStore(profiles));
  }, [profiles, refreshNonce]);

  const filePath = useMemo(() => getStatsFilePath(profiles), [profiles]);
  const recentRuns = useMemo(() => [...store.runs].slice(-10).reverse(), [store.runs]);
  const overridesByCategory = useMemo(
    () => summarizeCategoryOverrides(store.runs),
    [store.runs],
  );

  const runActivityBars = useMemo(() => {
    const recent = [...store.runs].slice(-20);
    const counts = recent.map((run) => run.movedCount + run.pointerCount + run.skippedCount);
    const max = counts.reduce((acc, value) => Math.max(acc, value), 0);
    return counts.map((value) => formatBar(value, max, 8));
  }, [store.runs]);

  const overrideEntries = Object.entries(overridesByCategory).sort((left, right) =>
    right[1] - left[1],
  );
  const maxOverride = overrideEntries.reduce((acc, [, count]) => Math.max(acc, count), 0);

  return (
    <>
      <text fg={theme.tokens.text}>Run stats (rolling 100) and category override trends.</text>
      <text fg={theme.tokens.textMuted}>File: {filePath}</text>
      <text fg={theme.tokens.textMuted}>Runs stored: {store.runs.length}/100</text>

      <text fg={theme.tokens.accentStrong}>Activity Chart (last 20 runs)</text>
      {runActivityBars.length === 0 ? (
        <text fg={theme.tokens.warning}>No runs yet.</text>
      ) : (
        <text fg={theme.tokens.textMuted}>{runActivityBars.join(" ")}</text>
      )}

      <text fg={theme.tokens.accentStrong}>Override Chart (per category)</text>
      {overrideEntries.length === 0 ? (
        <text fg={theme.tokens.warning}>No override data yet.</text>
      ) : (
        overrideEntries.map(([category, count]) => (
          <text key={category} fg={theme.tokens.textMuted}>
            {category.padEnd(20, " ")} {formatBar(count, maxOverride)} {count}
          </text>
        ))
      )}

      <text fg={theme.tokens.accentStrong}>Recent Runs (latest 10)</text>
      {recentRuns.length === 0 ? (
        <text fg={theme.tokens.warning}>No runs recorded.</text>
      ) : (
        recentRuns.map((run) => (
          <text key={run.id} fg={theme.tokens.textMuted}>
            - {run.timestamp} [{run.operation}] moved={run.movedCount} pointers={run.pointerCount} skipped={run.skippedCount}
          </text>
        ))
      )}

      <text fg={theme.tokens.warning}>Reset safeguard phrase: {resetPhrase}</text>
      {resetArmed ? (
        <text fg={theme.tokens.textMuted}>Typed: {resetInput || "(empty)"}</text>
      ) : null}
    </>
  );
}
