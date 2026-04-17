import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { PathProfile } from "./path-profiles";

export type PresetRule = {
  pattern: string;
  category: string;
};

export type PresetStore = {
  version: 1;
  updatedAt: string;
  rules: PresetRule[];
};

export type PresetMatch = {
  rule: PresetRule;
  specificity: number;
};

type PresetSaveMode = "save-all" | "save-selected" | "discard";

export type PresetCandidate = {
  skillName: string;
  category: string;
  path: string;
};

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegex(text: string): string {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (char === "?") {
      pattern += ".";
      continue;
    }

    pattern += escapeRegex(char);
  }

  return new RegExp(`^${pattern}$`);
}

function patternSpecificity(pattern: string): number {
  const wildcardPenalty = (pattern.match(/[?*]/g) ?? []).length * 10;
  return pattern.length - wildcardPenalty;
}

export function getVaultRootPath(profiles: PathProfile[] = []): string {
  const preferred = profiles.find((profile) => profile.id === "opencode")?.vaultDir;
  if (preferred) {
    return preferred;
  }

  const fallback = profiles[0]?.vaultDir;
  if (fallback) {
    return fallback;
  }

  const homeDir = process.env.HOME ?? os.homedir();
  return path.join(homeDir, ".skillcat-vault");
}

export function getPresetsFilePath(profiles: PathProfile[] = []): string {
  return path.join(getVaultRootPath(profiles), ".skillcat-presets.json");
}

export function defaultPresetStore(): PresetStore {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    rules: [],
  };
}

export function loadPresetStore(profiles: PathProfile[] = []): PresetStore {
  const filePath = getPresetsFilePath(profiles);
  if (!fs.existsSync(filePath)) {
    return defaultPresetStore();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<PresetStore>;
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules
          .filter((rule): rule is PresetRule => {
            return (
              typeof rule === "object" &&
              rule !== null &&
              typeof (rule as PresetRule).pattern === "string" &&
              typeof (rule as PresetRule).category === "string"
            );
          })
          .map((rule) => ({
            pattern: rule.pattern.trim(),
            category: rule.category.trim(),
          }))
          .filter((rule) => rule.pattern.length > 0 && rule.category.length > 0)
      : [];

    return {
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      rules,
    };
  } catch {
    return defaultPresetStore();
  }
}

export function savePresetStore(store: PresetStore, profiles: PathProfile[] = []): void {
  const filePath = getPresetsFilePath(profiles);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const normalized: PresetStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rules: [...store.rules]
      .map((rule) => ({
        pattern: rule.pattern.trim(),
        category: rule.category.trim(),
      }))
      .filter((rule) => rule.pattern.length > 0 && rule.category.length > 0)
      .sort((left, right) => left.pattern.localeCompare(right.pattern)),
  };

  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function findPresetMatches(targetPath: string, store: PresetStore): PresetMatch[] {
  const normalizedPath = toPosixPath(targetPath);

  const exactMatches = store.rules
    .filter((rule) => rule.pattern === normalizedPath)
    .map((rule) => ({
      rule,
      specificity: Number.MAX_SAFE_INTEGER,
    }));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const globMatches = store.rules
    .filter((rule) => rule.pattern.includes("*") || rule.pattern.includes("?"))
    .filter((rule) => globToRegex(toPosixPath(rule.pattern)).test(normalizedPath))
    .map((rule) => ({
      rule,
      specificity: patternSpecificity(rule.pattern),
    }));

  if (globMatches.length > 0) {
    return globMatches.sort((left, right) => right.specificity - left.specificity);
  }

  const ambiguousSubstring = store.rules
    .filter((rule) => !rule.pattern.includes("*") && !rule.pattern.includes("?"))
    .filter((rule) => normalizedPath.includes(toPosixPath(rule.pattern)))
    .map((rule) => ({
      rule,
      specificity: patternSpecificity(rule.pattern),
    }))
    .sort((left, right) => right.specificity - left.specificity);

  return ambiguousSubstring;
}

export function matchPresetCategory(targetPath: string, store: PresetStore): {
  category?: string;
  needsDisambiguation: boolean;
  matches: PresetMatch[];
} {
  const matches = findPresetMatches(targetPath, store);
  if (matches.length === 0) {
    return { needsDisambiguation: false, matches: [] };
  }

  const best = matches[0];
  if (!best) {
    return { needsDisambiguation: false, matches: [] };
  }

  const ties = matches.filter((match) => match.specificity === best.specificity);
  if (ties.length > 1) {
    return {
      needsDisambiguation: true,
      matches: ties,
    };
  }

  return {
    category: best.rule.category,
    needsDisambiguation: false,
    matches: [best],
  };
}

export function buildPresetRulesFromCandidates(
  candidates: PresetCandidate[],
  mode: PresetSaveMode,
  selectedIndices: number[] = [],
): PresetRule[] {
  if (mode === "discard") {
    return [];
  }

  const selectedSet = new Set(selectedIndices);
  const source =
    mode === "save-selected"
      ? candidates.filter((_, index) => selectedSet.has(index))
      : candidates;

  const rules = source.map((candidate) => ({
    pattern: toPosixPath(candidate.path),
    category: candidate.category,
  }));

  return rules.sort((left, right) => left.pattern.localeCompare(right.pattern));
}

export function mergePresetRules(existing: PresetStore, additions: PresetRule[]): PresetStore {
  const byPattern = new Map<string, PresetRule>();

  for (const rule of existing.rules) {
    byPattern.set(rule.pattern, rule);
  }
  for (const rule of additions) {
    byPattern.set(rule.pattern, rule);
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    rules: Array.from(byPattern.values()).sort((left, right) =>
      left.pattern.localeCompare(right.pattern),
    ),
  };
}
