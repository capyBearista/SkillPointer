import { useEffect, useMemo, useState } from "react";

import {
  getPresetsFilePath,
  loadPresetStore,
  type PresetStore,
} from "../core/presets";
import type { PathProfile } from "../core/path-profiles";
import type { ThemePack } from "../theme-registry";

export type PresetsRouteProps = {
  theme: ThemePack;
  profiles: PathProfile[];
  refreshNonce?: number;
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toISOString();
}

export function PresetsRoute({ theme, profiles, refreshNonce = 0 }: PresetsRouteProps) {
  const [store, setStore] = useState<PresetStore>(loadPresetStore(profiles));

  useEffect(() => {
    setStore(loadPresetStore(profiles));
  }, [profiles, refreshNonce]);

  const presetPath = useMemo(() => getPresetsFilePath(profiles), [profiles]);

  return (
    <>
      <text fg={theme.tokens.text}>Saved preset mappings (pattern to category).</text>
      <text fg={theme.tokens.textMuted}>File: {presetPath}</text>
      <text fg={theme.tokens.textMuted}>Updated: {formatUpdatedAt(store.updatedAt)}</text>

      {store.rules.length === 0 ? (
        <text fg={theme.tokens.warning}>No presets saved yet.</text>
      ) : (
        <>
          <text fg={theme.tokens.accentStrong}>Rules ({store.rules.length})</text>
          {store.rules.map((rule) => (
            <text key={`${rule.pattern}:${rule.category}`} fg={theme.tokens.textMuted}>
              - {rule.pattern} {"->"} {rule.category}
            </text>
          ))}
        </>
      )}
    </>
  );
}
