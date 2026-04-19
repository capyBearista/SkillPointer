import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import os from "node:os";

import {
  buildBrowseIndex,
  type BrowseCategory,
  type BrowseSkill,
} from "./core/browse-data";
import {
  appendRunStat,
  resetStats,
} from "./core/stats";
import {
  buildPresetRulesFromCandidates,
  loadPresetStore,
  mergePresetRules,
  savePresetStore,
  type PresetCandidate,
} from "./core/presets";
import {
  applyInitPlan,
  resolveDuplicateConflict,
  type InitPlan,
  type PlanConflictAction,
} from "./core/init-plan";
import {
  applyMaintainPlan,
  buildMaintainPlan,
  type MaintainPlan,
  type MaintainConflictAction,
} from "./core/maintain-plan";
import { buildInitPreviewLines, buildMaintainPreviewLines } from "./core/plan-preview";
import {
  onHomeEnter,
  onInitSelectPathsEnter,
  type InitStep,
} from "./core/init-flow";
import {
  createInitialPathSelection,
  detectPathProfiles,
  getSelectedProfiles,
  toggleProfileSelection,
  type PathProfile,
  type PathProfileId,
  type PathSelectionState,
} from "./core/path-profiles";
import {
  ensureSandboxEnvironment,
  getSandboxPaths,
  resetSandboxEnvironment,
} from "./core/sandbox";
import {
  applyEscape,
  applyGlobalArrow,
  applyGlobalEnter,
  applyHotkeyRoute,
  applyTabCycle,
  type FocusMode,
} from "./core/navigation-state";
import { HOME_CAT_ART } from "./core/home-cat-art";
import { getInitialThemeIndex, getNextThemeIndex, getThemePack } from "./core/theme-settings";
import { ROUTES, type RouteName } from "./routes";
import { THEME_ORDER } from "./theme-registry";

const ROUTE_HOTKEYS: Record<string, RouteName> = {
  i: "init",
  b: "browse",
  m: "maintain",
  p: "presets",
  s: "stats",
};

const PRESET_SAVE_MODES = ["save-all", "save-selected", "discard"] as const;
type PresetSaveMode = (typeof PRESET_SAVE_MODES)[number];

const STATS_RESET_PHRASE = "RESET STATS";

const HEADER_LINE_COUNT = 4;
const MAINTAIN_ACTION_COUNT = 6;

type AppProps = {
  startRoute: RouteName;
  onExit: () => void | Promise<void>;
};

import { InitRoute } from "./routes/InitRoute";
import { BrowseRoute } from "./routes/BrowseRoute";
import { MaintainRoute, type MaintainActionState } from "./routes/MaintainRoute";
import { PresetsRoute } from "./routes/PresetsRoute";
import { StatsRoute } from "./routes/StatsRoute";

function isEnterKey(keyName: string): boolean {
  return keyName === "enter" || keyName === "return";
}

const GLOBAL_FOOTER_GROUPS = [
  ["Arrows", "switch page"],
  ["Enter", "focus page"],
  ["i/b/m/p/s", "jump"],
  ["Esc", "quit"],
  ["t", "theme"],
  ["Mouse", "click page"],
] as const;

const HOME_GLOBAL_FOOTER_GROUPS = [
  ["Enter", "start guided init"],
  ["Arrows", "switch page"],
  ["i/b/m/p/s", "jump"],
  ["Esc", "quit"],
  ["t", "theme"],
  ["Mouse", "click page"],
] as const;

const PAGE_FOOTER_GROUPS = [
  ["Arrows", "navigate page"],
  ["Enter", "confirm action"],
  ["Space", "toggle option"],
  ["Esc", "back to pages"],
  ["i/b/m/p/s", "jump pages"],
  ["q", "quit"],
] as const;

function toRelativePath(value: string): string {
  const home = process.env.HOME ?? os.homedir();
  if (home && value.startsWith(home)) {
    return value.replace(home, "~");
  }
  return value;
}

function formatPlanAction(action: PlanConflictAction): string {
  if (action === "skip") {
    return "Skip";
  }
  if (action === "overwrite") {
    return "Overwrite";
  }
  return "Abort";
}

function explainPlanAction(action: PlanConflictAction): string {
  if (action === "skip") {
    return "Skip keeps existing destination skills untouched and skips conflicting moves.";
  }
  if (action === "overwrite") {
    return "Overwrite replaces existing destination skills with the planned source version.";
  }
  return "Abort stops apply before writing when a destination conflict is encountered.";
}

function formatMaintainAction(action: MaintainConflictAction): string {
  if (action === "skip") {
    return "Skip";
  }
  if (action === "overwrite") {
    return "Overwrite";
  }
  return "Abort";
}

function formatPresetMode(mode: PresetSaveMode): string {
  if (mode === "save-all") {
    return "Save all";
  }
  if (mode === "save-selected") {
    return "Save selected";
  }
  return "Discard";
}

function buildPresetCandidatesFromInitPlan(plan: InitPlan): PresetCandidate[] {
  return plan.moveOperations.map((operation) => ({
    skillName: operation.skillName,
    category: operation.category,
    path: operation.destinationPath,
  }));
}

function buildPresetCandidatesFromMaintainPlan(plan: MaintainPlan): PresetCandidate[] {
  return plan.moveOperations.map((operation) => ({
    skillName: operation.skillName,
    category: operation.toCategory,
    path: operation.destinationPath,
  }));
}

function buildOverrideCountsFromInitPlan(plan: InitPlan): Record<string, number> {
  const byOperationId = new Map(plan.moveOperations.map((operation) => [operation.id, operation]));
  const counts: Record<string, number> = {};

  for (const conflict of plan.conflicts) {
    if (conflict.kind !== "destination-exists") {
      continue;
    }
    const operation = byOperationId.get(conflict.operationId);
    if (!operation) {
      continue;
    }
    counts[operation.category] = (counts[operation.category] ?? 0) + 1;
  }

  return counts;
}

function buildOverrideCountsFromMaintainPlan(plan: MaintainPlan): Record<string, number> {
  const byOperationId = new Map(plan.moveOperations.map((operation) => [operation.id, operation]));
  const counts: Record<string, number> = {};

  for (const conflict of plan.conflicts) {
    const operation = byOperationId.get(conflict.operationId);
    if (!operation) {
      continue;
    }
    counts[operation.toCategory] = (counts[operation.toCategory] ?? 0) + 1;
  }

  return counts;
}

export function App({ startRoute, onExit }: AppProps) {
  const [themeIndex, setThemeIndex] = useState(() => getInitialThemeIndex());
  const [selectedRoute, setSelectedRoute] = useState<RouteName>(startRoute);
  const [activeRoute, setActiveRoute] = useState<RouteName>(startRoute);
  const [focusMode, setFocusMode] = useState<FocusMode>("global");
  const selectedProfilesRef = useRef<PathProfile[]>([]);

  const [profiles, setProfiles] = useState<PathProfile[]>([]);

  const [pathSelection, setPathSelection] = useState<PathSelectionState>(
    createInitialPathSelection(profiles),
  );
  const [pathCursor, setPathCursor] = useState(0);
  const [initStep, setInitStep] = useState<InitStep>("select-paths");
  const [initPlan, setInitPlan] = useState<InitPlan | null>(null);
  const [initResult, setInitResult] = useState<string[]>([]);
  const [initPreviewLines, setInitPreviewLines] = useState<string[]>([]);
  const [duplicateCursor, setDuplicateCursor] = useState(0);
  const [duplicateChoiceCursor, setDuplicateChoiceCursor] = useState(0);
  const [batchAction, setBatchAction] = useState<PlanConflictAction>("skip");

  const [browseCategoryCursor, setBrowseCategoryCursor] = useState(0);
  const [browseSkillCursor, setBrowseSkillCursor] = useState(0);
  const [browseFocus, setBrowseFocus] = useState<"categories" | "skills">("categories");

  const [maintainActions, setMaintainActions] = useState<MaintainActionState>({
    recategorize: true,
    regeneratePointers: true,
  });
  const [maintainCursor, setMaintainCursor] = useState(0);
  const [maintainBatchAction, setMaintainBatchAction] =
    useState<MaintainConflictAction>("skip");
  const [maintainPlan, setMaintainPlan] = useState<MaintainPlan | null>(null);
  const [maintainResult, setMaintainResult] = useState<string[]>([]);
  const [maintainPreviewLines, setMaintainPreviewLines] = useState<string[]>([]);
  const [presetFlowVisible, setPresetFlowVisible] = useState(false);
  const [presetFlowSource, setPresetFlowSource] = useState<"init" | "maintain" | null>(null);
  const [presetFlowCandidates, setPresetFlowCandidates] = useState<PresetCandidate[]>([]);
  const [presetSaveMode, setPresetSaveMode] = useState<PresetSaveMode>("save-all");
  const [presetCandidateCursor, setPresetCandidateCursor] = useState(0);
  const [presetSelectedIndices, setPresetSelectedIndices] = useState<number[]>([]);
  const [presetFlowResult, setPresetFlowResult] = useState<string[]>([]);
  const [presetRefreshNonce, setPresetRefreshNonce] = useState(0);

  const [statsRefreshNonce, setStatsRefreshNonce] = useState(0);
  const [statsResetArmed, setStatsResetArmed] = useState(false);
  const [statsResetInput, setStatsResetInput] = useState("");
  const [statsStatus, setStatsStatus] = useState<string[]>([]);

  const [sandboxStatus, setSandboxStatus] = useState<string[]>([]);

  const renderPreviewCard = (title: string, lines: string[]) => {
    if (lines.length === 0) {
      return null;
    }

    return (
      <box
        border
        borderStyle="rounded"
        borderColor={theme.tokens.focus}
        backgroundColor={theme.tokens.panel}
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        marginTop={1}
      >
        <text fg={theme.tokens.accentStrong}>
          <strong>{title}</strong>
        </text>
        {lines.map((line, index) => {
          const isSectionHeader = !line.startsWith("  - ");
          return (
            <text
              key={`${title}-${index}-${line}`}
              fg={isSectionHeader ? theme.tokens.accent : theme.tokens.textMuted}
            >
              {line}
            </text>
          );
        })}
      </box>
    );
  };

  const theme = getThemePack(themeIndex);
  const isSidebarFocused = focusMode === "global";
  const headerSandboxLine = sandboxStatus[0] ?? "Sandbox active: unavailable";

  useEffect(() => {
    ensureSandboxEnvironment();
    const sandboxPaths = getSandboxPaths();
    setSandboxStatus([
      `Sandbox active: ${toRelativePath(sandboxPaths.skillsDir)}`,
      `Sandbox vault: ${toRelativePath(sandboxPaths.vaultDir)}`,
      `Snapshot: ${toRelativePath(sandboxPaths.snapshotDir)}`,
    ]);
    setProfiles(detectPathProfiles());
  }, []);

  useEffect(() => {
    setPathSelection(createInitialPathSelection(profiles));
    setPathCursor(0);
    setInitStep("select-paths");
    setInitPlan(null);
    setInitResult([]);
    setInitPreviewLines([]);
    setMaintainPlan(null);
    setMaintainPreviewLines([]);
    setMaintainResult([]);
  }, [profiles]);

  const selectedProfiles = useMemo(() => {
    return getSelectedProfiles(profiles, pathSelection);
  }, [profiles, pathSelection]);

  useEffect(() => {
    selectedProfilesRef.current = selectedProfiles;
  }, [selectedProfiles]);

  const browseIndex = useMemo(() => {
    return buildBrowseIndex(selectedProfiles.length > 0 ? selectedProfiles : profiles);
  }, [profiles, selectedProfiles]);

  const browseCategories = browseIndex.categories;
  const activeBrowseCategory: BrowseCategory | null =
    browseCategories[browseCategoryCursor] ?? null;
  const activeBrowseSkill: BrowseSkill | null =
    activeBrowseCategory?.skills[browseSkillCursor] ?? null;

  const duplicateConflicts = useMemo(() => {
    if (!initPlan) {
      return [];
    }
    return initPlan.conflicts.filter((conflict) => conflict.kind === "duplicate-destination");
  }, [initPlan]);

  useEffect(() => {
    if (browseCategoryCursor >= browseCategories.length) {
      setBrowseCategoryCursor(Math.max(0, browseCategories.length - 1));
    }
  }, [browseCategories.length, browseCategoryCursor]);

  useEffect(() => {
    if (!activeBrowseCategory) {
      setBrowseSkillCursor(0);
      return;
    }
    if (browseSkillCursor >= activeBrowseCategory.skills.length) {
      setBrowseSkillCursor(Math.max(0, activeBrowseCategory.skills.length - 1));
    }
  }, [activeBrowseCategory, browseSkillCursor]);

  const activateRoute = (route: RouteName, mode: FocusMode = "global") => {
    setSelectedRoute(route);
    setActiveRoute(route);
    setFocusMode(mode);
  };

  const startPresetSaveFlow = (
    source: "init" | "maintain",
    candidates: PresetCandidate[],
  ) => {
    setPresetFlowVisible(true);
    setPresetFlowSource(source);
    setPresetFlowCandidates(candidates);
    setPresetSaveMode("save-all");
    setPresetCandidateCursor(0);
    setPresetSelectedIndices(candidates.map((_, index) => index));
    setPresetFlowResult([]);
    activateRoute("presets", "page");
  };

  const applyPresetFlow = () => {
    if (!presetFlowVisible) {
      return;
    }

    const rules = buildPresetRulesFromCandidates(
      presetFlowCandidates,
      presetSaveMode,
      presetSelectedIndices,
    );

    if (presetSaveMode === "discard") {
      setPresetFlowVisible(false);
      setPresetFlowCandidates([]);
      setPresetFlowResult(["Preset save discarded for this run."]);
      return;
    }

    const existing = loadPresetStore(profiles);
    const merged = mergePresetRules(existing, rules);
    savePresetStore(merged, profiles);
    setPresetRefreshNonce((value) => value + 1);
    setPresetFlowVisible(false);
    setPresetFlowCandidates([]);
    setPresetFlowResult([
      `Saved ${rules.length} preset rule(s) from ${presetFlowSource ?? "run"}.`,
      `Current preset total: ${merged.rules.length}`,
    ]);
  };

  const applyStatsReset = () => {
    const normalizedInput = statsResetInput.trim().toUpperCase();
    if (normalizedInput !== STATS_RESET_PHRASE) {
      setStatsStatus([`Reset cancelled. Type exactly: ${STATS_RESET_PHRASE}`]);
      setStatsResetArmed(false);
      setStatsResetInput("");
      return;
    }

    resetStats(profiles);
    setStatsRefreshNonce((value) => value + 1);
    setStatsStatus(["Stats reset complete."]);
    setStatsResetArmed(false);
    setStatsResetInput("");
  };

  const handleSandboxReset = () => {
    const result = resetSandboxEnvironment();
    const sandboxPaths = getSandboxPaths();
    setSandboxStatus([
      `Sandbox reset complete (${result.restoredSkillCount} skills restored).`,
      `Sandbox active: ${toRelativePath(result.skillsDir)}`,
      `Sandbox vault: ${toRelativePath(result.vaultDir)}`,
      `Snapshot: ${toRelativePath(sandboxPaths.snapshotDir)}`,
    ]);
    setProfiles(detectPathProfiles());
  };

  const executeInitApply = async () => {
    if (!initPlan) {
      return;
    }

    try {
      const currentPlan = initPlan;
      const result = await applyInitPlan(initPlan, { batchConflictAction: batchAction });
      if (result.status === "aborted") {
        setInitResult([
          "Init apply aborted by selected conflict policy.",
          "No filesystem changes were made.",
        ]);
      } else {
        appendRunStat(
          {
            operation: "init",
            movedCount: result.movedCount,
            pointerCount: result.pointerCount,
            skippedCount: result.skippedCount,
            overrideCounts: buildOverrideCountsFromInitPlan(currentPlan),
          },
          profiles,
        );
        setStatsRefreshNonce((value) => value + 1);

        setInitResult([
          "Init apply complete.",
          `Moved skills: ${result.movedCount}`,
          `Pointers generated: ${result.pointerCount}`,
          `Skipped due to policy: ${result.skippedCount}`,
        ]);

        startPresetSaveFlow("init", buildPresetCandidatesFromInitPlan(currentPlan));
      }
      setInitPreviewLines([]);
      setInitStep("result");
      setInitPlan(null);
      setProfiles(detectPathProfiles());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown apply error";
      setInitResult([`Init apply failed: ${message}`]);
      setInitStep("result");
    }
  };

  const buildMaintainPreview = async () => {
    const selected = selectedProfiles.length > 0 ? selectedProfiles : profiles;
    const nextPlan = await buildMaintainPlan({
      profiles: selected,
      actions: maintainActions,
    });
    setMaintainPlan(nextPlan);
    setMaintainPreviewLines(buildMaintainPreviewLines(nextPlan));
  };

  const executeMaintainApply = async () => {
    if (!maintainPlan) {
      setMaintainResult(["Build a maintain preview before apply."]);
      return;
    }

    try {
      const currentPlan = maintainPlan;
      const result = await applyMaintainPlan(maintainPlan, {
        batchConflictAction: maintainBatchAction,
      });
      if (result.status === "aborted") {
        setMaintainResult([
          "Maintain apply aborted by selected conflict policy.",
          "No filesystem changes were made.",
        ]);
      } else {
        appendRunStat(
          {
            operation: "maintain",
            movedCount: result.movedCount,
            pointerCount: result.pointerCount,
            skippedCount: result.skippedCount,
            overrideCounts: buildOverrideCountsFromMaintainPlan(currentPlan),
          },
          profiles,
        );
        setStatsRefreshNonce((value) => value + 1);

        setMaintainResult([
          "Maintain apply complete.",
          `Moved skills: ${result.movedCount}`,
          `Pointers generated: ${result.pointerCount}`,
          `Skipped due to policy: ${result.skippedCount}`,
        ]);

        startPresetSaveFlow("maintain", buildPresetCandidatesFromMaintainPlan(currentPlan));
      }
      setProfiles(detectPathProfiles());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown maintain error";
      setMaintainResult([`Maintain apply failed: ${message}`]);
    }
  };

  useKeyboard(async (key) => {
    const blockHotkeysForTextEntry = activeRoute === "stats" && statsResetArmed;

    if (key.name === "q") {
      void onExit();
      return;
    }

    if (key.name === "t" && focusMode === "global" && !blockHotkeysForTextEntry) {
      setThemeIndex((index) => getNextThemeIndex(index));
      return;
    }

    if (key.name === "tab") {
      const next = applyTabCycle(
        {
          selectedRoute,
          activeRoute,
          focusMode,
        },
        key.shift ? "prev" : "next",
      );

      setSelectedRoute(next.selectedRoute);
      setActiveRoute(next.activeRoute);
      setFocusMode(next.focusMode);

      if (next.activeRoute === "init") {
        setPathCursor(0);
      }
      if (next.activeRoute === "browse") {
        setBrowseFocus("categories");
        setBrowseCategoryCursor(0);
        setBrowseSkillCursor(0);
      }
      if (next.activeRoute === "maintain") {
        setMaintainCursor(0);
      }
      return;
    }

    const hotkeyRoute = ROUTE_HOTKEYS[key.name];
    if (hotkeyRoute && !blockHotkeysForTextEntry) {
        const next = applyHotkeyRoute(
          {
            selectedRoute,
            activeRoute,
            focusMode,
          },
          hotkeyRoute,
        );
      setSelectedRoute(next.selectedRoute);
      setActiveRoute(next.activeRoute);
      setFocusMode(next.focusMode);
      return;
    }

    if (key.name === "escape") {
        const escapeResult = applyEscape({
          selectedRoute,
          activeRoute,
          focusMode,
        });
      setSelectedRoute(escapeResult.next.selectedRoute);
      setActiveRoute(escapeResult.next.activeRoute);
      setFocusMode(escapeResult.next.focusMode);

      if (escapeResult.shouldExit) {
        void onExit();
      }
      return;
    }

    if (focusMode === "global") {
        if (key.name === "up" || key.name === "down") {
          const next = applyGlobalArrow(
            {
              selectedRoute,
              activeRoute,
              focusMode,
            },
            key.name,
          );
        setSelectedRoute(next.selectedRoute);
        setActiveRoute(next.activeRoute);
        setFocusMode(next.focusMode);
        return;
      }

        if (isEnterKey(key.name)) {
          if (activeRoute === "home") {
            const selected = selectedProfilesRef.current;
            const transition = onHomeEnter(profiles, selected, pathSelection);
            setSelectedRoute(transition.route);
            setActiveRoute(transition.route);
            setFocusMode(transition.focusMode);
            setInitStep(transition.initStep);
            setPathCursor(transition.pathCursor);
            setPathSelection(transition.nextSelection);
            setInitResult([]);
            return;
          }

          const next = applyGlobalEnter({
            selectedRoute,
            activeRoute,
            focusMode,
          });
          setSelectedRoute(next.selectedRoute);
          setActiveRoute(next.activeRoute);
          setFocusMode(next.focusMode);

          if (next.activeRoute === "init") {
            setPathCursor(0);
          }
          if (next.activeRoute === "browse") {
            setBrowseFocus("categories");
          }
          if (next.activeRoute === "maintain") {
            setMaintainCursor(0);
          }
        return;
      }

      return;
    }

    if (activeRoute === "init") {
      if (initStep === "select-paths") {
        if (key.name === "up") {
          setPathCursor((cursor) => Math.max(0, cursor - 1));
          return;
        }

        if (key.name === "down") {
          setPathCursor((cursor) => Math.min(Math.max(0, profiles.length - 1), cursor + 1));
          return;
        }

        if (key.name === "space" && profiles[pathCursor]) {
          const profile = profiles[pathCursor];
          setPathSelection((previous) => toggleProfileSelection(previous, profile.id));
          return;
        }

        if (isEnterKey(key.name)) {
          const transition = await onInitSelectPathsEnter(profiles, pathSelection);
          setInitStep(transition.nextStep);
          setInitResult(transition.resultLines);
          setInitPlan(transition.plan);
          const previewLines = transition.plan ? buildInitPreviewLines(transition.plan) : [];
          setInitPreviewLines(previewLines);
          setDuplicateCursor(transition.duplicateCursor);
          setDuplicateChoiceCursor(transition.duplicateChoiceCursor);
          return;
        }
      }

      if (initStep === "resolve-duplicates") {
        const currentConflict = duplicateConflicts[duplicateCursor];
        if (!currentConflict) {
          setInitStep("ready");
          return;
        }

        if (key.name === "left") {
          setDuplicateChoiceCursor((cursor) => Math.max(0, cursor - 1));
          return;
        }

        if (key.name === "right") {
          setDuplicateChoiceCursor((cursor) =>
            Math.min(currentConflict.contenders.length - 1, cursor + 1),
          );
          return;
        }

        if (isEnterKey(key.name)) {
          const source = currentConflict.contenders[duplicateChoiceCursor];
          if (!source || !initPlan) {
            return;
          }

          const resolved = await resolveDuplicateConflict(initPlan, currentConflict.id, source);
          setInitPlan(resolved);
          const previewLines = buildInitPreviewLines(resolved);
          setInitPreviewLines(previewLines);

          const nextConflictIndex = duplicateCursor + 1;
          if (nextConflictIndex >= duplicateConflicts.length) {
            setInitStep("ready");
            return;
          }

          setDuplicateCursor(nextConflictIndex);
          setDuplicateChoiceCursor(0);
          return;
        }
      }

      if (initStep === "ready") {
        if (key.name === "left") {
          setBatchAction((previous) => {
            const order: PlanConflictAction[] = ["skip", "overwrite", "abort"];
            const index = order.indexOf(previous);
            return order[(index - 1 + order.length) % order.length];
          });
          return;
        }

        if (key.name === "right") {
          setBatchAction((previous) => {
            const order: PlanConflictAction[] = ["skip", "overwrite", "abort"];
            const index = order.indexOf(previous);
            return order[(index + 1) % order.length];
          });
          return;
        }

        if (isEnterKey(key.name)) {
          await executeInitApply();
          return;
        }
      }

      if (initStep === "result" && isEnterKey(key.name)) {
        setInitStep("select-paths");
        setInitResult([]);
        setInitPreviewLines([]);
        setPathSelection(createInitialPathSelection(profiles));
        setPathCursor(0);
        return;
      }

      return;
    }

    if (activeRoute === "browse") {
      if (key.name === "left") {
        setBrowseFocus("categories");
        return;
      }

      if (key.name === "right") {
        setBrowseFocus("skills");
        return;
      }

      if (key.name === "up") {
        if (browseFocus === "categories") {
          setBrowseCategoryCursor((cursor) => Math.max(0, cursor - 1));
        } else {
          setBrowseSkillCursor((cursor) => Math.max(0, cursor - 1));
        }
        return;
      }

      if (key.name === "down") {
        if (browseFocus === "categories") {
          setBrowseCategoryCursor((cursor) =>
            Math.min(Math.max(0, browseCategories.length - 1), cursor + 1),
          );
        } else {
          setBrowseSkillCursor((cursor) =>
            Math.min(Math.max(0, (activeBrowseCategory?.skills.length ?? 1) - 1), cursor + 1),
          );
        }
        return;
      }

      return;
    }

    if (activeRoute === "maintain") {
      if (key.name === "up") {
        setMaintainCursor((cursor) => Math.max(0, cursor - 1));
        return;
      }

      if (key.name === "down") {
        setMaintainCursor((cursor) => Math.min(MAINTAIN_ACTION_COUNT - 1, cursor + 1));
        return;
      }

        if (key.name === "space") {
          if (maintainCursor === 0) {
            setMaintainActions((previous) => ({
              ...previous,
              recategorize: !previous.recategorize,
            }));
            setMaintainPlan(null);
            setMaintainPreviewLines([]);
            setMaintainResult([]);
            return;
          }
          if (maintainCursor === 1) {
            setMaintainActions((previous) => ({
              ...previous,
              regeneratePointers: !previous.regeneratePointers,
            }));
            setMaintainPlan(null);
            setMaintainPreviewLines([]);
            setMaintainResult([]);
            return;
          }
        }

      if (key.name === "left" && maintainCursor === 2) {
        setMaintainBatchAction((previous) => {
          const order: MaintainConflictAction[] = ["skip", "overwrite", "abort"];
          const index = order.indexOf(previous);
          return order[(index - 1 + order.length) % order.length];
        });
        setMaintainPlan(null);
        setMaintainPreviewLines([]);
        setMaintainResult([]);
        return;
      }

      if (key.name === "right" && maintainCursor === 2) {
        setMaintainBatchAction((previous) => {
          const order: MaintainConflictAction[] = ["skip", "overwrite", "abort"];
          const index = order.indexOf(previous);
          return order[(index + 1) % order.length];
        });
        setMaintainPlan(null);
        setMaintainPreviewLines([]);
        setMaintainResult([]);
        return;
      }

      if (isEnterKey(key.name)) {
        if (maintainCursor === 3) {
          await buildMaintainPreview();
          return;
        }

        if (maintainCursor === 4) {
          await executeMaintainApply();
          return;
        }

        if (maintainCursor === 5) {
          handleSandboxReset();
          setMaintainResult([
            "Local sandbox restored from snapshot.",
            "Sandbox vault cleared for repeatable test runs.",
          ]);
          return;
        }
      }

      return;
    }

    if (activeRoute === "presets") {
      if (!presetFlowVisible) {
        return;
      }

      const lastCandidateIndex = Math.max(0, presetFlowCandidates.length - 1);

      if (key.name === "up") {
        if (presetCandidateCursor > 0) {
          key.preventDefault?.();
          key.stopPropagation?.();
          setPresetCandidateCursor((cursor) => Math.max(0, cursor - 1));
        }
        return;
      }

      if (key.name === "down") {
        if (presetCandidateCursor < lastCandidateIndex) {
          key.preventDefault?.();
          key.stopPropagation?.();
          setPresetCandidateCursor((cursor) => Math.min(lastCandidateIndex, cursor + 1));
        }
        return;
      }

      if (key.name === "left") {
        setPresetSaveMode((previous) => {
          const index = PRESET_SAVE_MODES.indexOf(previous);
          return PRESET_SAVE_MODES[(index - 1 + PRESET_SAVE_MODES.length) % PRESET_SAVE_MODES.length];
        });
        return;
      }

      if (key.name === "right") {
        setPresetSaveMode((previous) => {
          const index = PRESET_SAVE_MODES.indexOf(previous);
          return PRESET_SAVE_MODES[(index + 1) % PRESET_SAVE_MODES.length];
        });
        return;
      }

      if ((key.name === "space" || key.name === " ") && presetSaveMode === "save-selected") {
        key.preventDefault?.();
        key.stopPropagation?.();
        setPresetSelectedIndices((previous) => {
          if (previous.includes(presetCandidateCursor)) {
            return previous.filter((index) => index !== presetCandidateCursor);
          }
          return [...previous, presetCandidateCursor].sort((left, right) => left - right);
        });
        return;
      }

      if (isEnterKey(key.name)) {
        applyPresetFlow();
      }
      return;
    }

    if (activeRoute === "stats") {
      if (!statsResetArmed) {
        if (key.name === "r") {
          setStatsResetArmed(true);
          setStatsResetInput("");
          setStatsStatus([`Type '${STATS_RESET_PHRASE}' then press Enter to confirm reset.`]);
          return;
        }

        return;
      }

      if (isEnterKey(key.name)) {
        applyStatsReset();
        return;
      }

      if (key.name === "backspace") {
        setStatsResetInput((value) => value.slice(0, Math.max(0, value.length - 1)));
        return;
      }

      if (key.name === "escape") {
        setStatsResetArmed(false);
        setStatsResetInput("");
        setStatsStatus(["Stats reset input cancelled."]);
        return;
      }

      if (key.sequence && key.sequence.length === 1 && /[a-zA-Z\s]/.test(key.sequence)) {
        setStatsResetInput((value) => `${value}${key.sequence.toUpperCase()}`.slice(0, 32));
        return;
      }
      return;
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.tokens.background}
    >
      <box
        minHeight={HEADER_LINE_COUNT + 2}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        justifyContent="flex-start"
        gap={0}
        backgroundColor={theme.tokens.panel}
        border
        borderColor={theme.tokens.focus}
      >
        <text fg={theme.tokens.accentStrong}>SkillCat  {theme.label}</text>
        <text fg={theme.tokens.textMuted}>Theme: {theme.subtitle}</text>
        <text
          fg={isSidebarFocused ? theme.tokens.warning : theme.tokens.success}
        >
          Focus: {isSidebarFocused ? "Sidebar" : "Page"}  {
            isSidebarFocused ? "<nav>" : "<interact>"
          }
        </text>
        <text fg={theme.tokens.textMuted}>{headerSandboxLine}</text>
      </box>

      <box flexGrow={1} flexDirection="row" padding={1} gap={1}>
        <box
          width={30}
          border
          borderStyle="rounded"
          borderColor={isSidebarFocused ? theme.tokens.accentStrong : theme.tokens.panel}
          backgroundColor={isSidebarFocused ? theme.tokens.surface : theme.tokens.panelAlt}
          padding={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={isSidebarFocused ? theme.tokens.accentStrong : theme.tokens.textMuted}>
            <strong>Navigation</strong>
          </text>
          {ROUTES.map((route) => {
            const isSelected = selectedRoute === route;
            const isActive = activeRoute === route;
            return (
              <box
                key={route}
                border
                borderStyle="single"
                borderColor={
                  isSelected
                    ? isSidebarFocused
                      ? theme.tokens.accentStrong
                      : theme.tokens.focus
                    : theme.tokens.panel
                }
                backgroundColor={
                  isSelected
                    ? isSidebarFocused
                      ? theme.tokens.accent
                      : theme.tokens.selectedBg
                    : isSidebarFocused
                      ? theme.tokens.panelAlt
                      : theme.tokens.panel
                }
                paddingX={1}
                height={3}
                alignItems="center"
                onMouseDown={() => {
                  activateRoute(route, focusMode);

                  if (focusMode === "page") {
                    if (route === "init") {
                      setPathCursor(0);
                    }
                    if (route === "browse") {
                      setBrowseFocus("categories");
                      setBrowseCategoryCursor(0);
                      setBrowseSkillCursor(0);
                    }
                    if (route === "maintain") {
                      setMaintainCursor(0);
                    }
                  }
                }}
              >
                <text
                  fg={
                    isSelected
                      ? isSidebarFocused
                        ? theme.tokens.background
                        : theme.tokens.selectedText
                      : isSidebarFocused
                        ? theme.tokens.text
                        : theme.tokens.textMuted
                  }
                >
                  {route.toUpperCase()}
                  {isActive ? "  *" : ""}
                </text>
              </box>
            );
          })}
        </box>

        <box
          flexGrow={1}
          border
          borderStyle="rounded"
          borderColor={isSidebarFocused ? theme.tokens.panel : theme.tokens.accentStrong}
          backgroundColor={isSidebarFocused ? theme.tokens.panelAlt : theme.tokens.surface}
          padding={2}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.tokens.accentStrong}>
            <strong>
              {activeRoute === "home"
                ? "Welcome to SkillCat"
                : activeRoute === "init"
                  ? "Init"
                  : activeRoute === "browse"
                    ? "Browse"
                    : activeRoute === "maintain"
                      ? "Maintain"
                      : activeRoute === "presets"
                        ? "Presets"
                        : "Stats"}
            </strong>
          </text>

          {activeRoute === "home" ? (
            <box
              flexGrow={1}
              justifyContent="center"
              alignItems="center"
              flexDirection="column"
              gap={1}
              backgroundColor={theme.tokens.panelAlt}
              border
              borderStyle="double"
              borderColor={theme.tokens.accent}
              padding={2}
            >
              <text fg={theme.tokens.accentStrong} content={HOME_CAT_ART} />
              <text fg={theme.tokens.text}>
                <strong>Friendly. Focused. Fast.</strong>
              </text>
              <text fg={theme.tokens.textMuted}>
                Press <span fg={theme.tokens.accentStrong}>Enter</span> to start guided init.
              </text>
              <text fg={theme.tokens.textMuted}>
                You will choose paths, preview exact moves and pointers, then confirm apply.
              </text>
              <box
                border
                borderStyle="rounded"
                borderColor={theme.tokens.focus}
                backgroundColor={theme.tokens.accent}
                paddingX={2}
                paddingY={1}
                onMouseDown={() => {
                  const selected = selectedProfilesRef.current;
                  const transition = onHomeEnter(profiles, selected, pathSelection);
                  setSelectedRoute(transition.route);
                  setActiveRoute(transition.route);
                  setFocusMode(transition.focusMode);
                  setInitStep(transition.initStep);
                  setPathCursor(transition.pathCursor);
                  setPathSelection(transition.nextSelection);
                  setInitResult([]);
                }}
              >
                <text fg={theme.tokens.background}>
                  <strong>Start Guided Init (Preview First)</strong>
                </text>
              </box>
            </box>
          ) : (
            <scrollbox
              focused={focusMode === "page"}
              flexGrow={1}
              style={{
                rootOptions: {
                  border: true,
                  borderStyle: "single",
                  borderColor: theme.tokens.panel,
                  backgroundColor: theme.tokens.panelAlt,
                  padding: 1,
                },
                scrollbarOptions: {
                  showArrows: true,
                  trackOptions: {
                    foregroundColor: theme.tokens.accent,
                    backgroundColor: theme.tokens.panel,
                  },
                },
              }}
            >
              <box flexDirection="column" gap={1}>
                {activeRoute === "init" ? (
                  <InitRoute
                    theme={theme}
                    initStep={initStep}
                    profiles={profiles}
                    selectedProfiles={selectedProfiles}
                    pathSelection={pathSelection}
                    pathCursor={pathCursor}
                    duplicateConflicts={duplicateConflicts}
                    duplicateCursor={duplicateCursor}
                    duplicateChoiceCursor={duplicateChoiceCursor}
                    initPlan={initPlan}
                    batchAction={batchAction}
                    initPreviewLines={initPreviewLines}
                    initResult={initResult}
                    toRelativePath={toRelativePath}
                    formatPlanAction={formatPlanAction}
                    explainPlanAction={explainPlanAction}
                    renderPreviewCard={renderPreviewCard}
                  />
                ) : null}

                {activeRoute === "browse" ? (
                  <BrowseRoute
                    theme={theme}
                    browseIndex={browseIndex}
                    browseFocus={browseFocus}
                    browseCategories={browseCategories}
                    browseCategoryCursor={browseCategoryCursor}
                    activeBrowseCategory={activeBrowseCategory}
                    browseSkillCursor={browseSkillCursor}
                    activeBrowseSkill={activeBrowseSkill}
                    toRelativePath={toRelativePath}
                  />
                ) : null}

                {activeRoute === "maintain" ? (
                  <MaintainRoute
                    theme={theme}
                    maintainCursor={maintainCursor}
                    maintainActions={maintainActions}
                    maintainBatchAction={maintainBatchAction}
                    maintainPlan={maintainPlan}
                    maintainPreviewLines={maintainPreviewLines}
                    maintainResult={maintainResult}
                    sandboxStatus={sandboxStatus}
                    formatMaintainAction={formatMaintainAction}
                    renderPreviewCard={renderPreviewCard}
                  />
                ) : null}

                {activeRoute === "presets" ? (
                  <>
                    {presetFlowVisible ? (
                      <>
                        <text fg={theme.tokens.accentStrong}>Post-run preset save</text>
                        <text fg={theme.tokens.textMuted}>
                          Source: {presetFlowSource ?? "n/a"} | Mode: {formatPresetMode(presetSaveMode)}
                        </text>
                        <text fg={theme.tokens.warning}>
                          Left/Right mode, Up/Down cursor, Space toggle (save-selected), Enter confirm
                        </text>
                        {presetFlowCandidates.length === 0 ? (
                          <text fg={theme.tokens.warning}>No moved skills detected; nothing to save.</text>
                        ) : (
                          presetFlowCandidates.map((candidate, index) => {
                            const focused = index === presetCandidateCursor;
                            const selected = presetSelectedIndices.includes(index);
                            return (
                              <text
                                key={`${candidate.path}:${candidate.category}`}
                                fg={
                                  focused
                                    ? theme.tokens.accentStrong
                                    : selected
                                      ? theme.tokens.success
                                      : theme.tokens.textMuted
                                }
                              >
                                {focused ? ">" : " "} [{selected ? "x" : " "}] {candidate.skillName} {"->"} {candidate.category}
                              </text>
                            );
                          })
                        )}
                      </>
                    ) : null}

                    <PresetsRoute
                      theme={theme}
                      profiles={selectedProfiles.length > 0 ? selectedProfiles : profiles}
                      refreshNonce={presetRefreshNonce}
                    />

                    {presetFlowResult.map((line) => (
                      <text key={line} fg={theme.tokens.textMuted}>
                        {line}
                      </text>
                    ))}
                  </>
                ) : null}

                {activeRoute === "stats" ? (
                  <>
                    <text fg={theme.tokens.warning}>
                      Stats reset only: press r to arm typed confirmation.
                    </text>
                    <StatsRoute
                      theme={theme}
                      profiles={selectedProfiles.length > 0 ? selectedProfiles : profiles}
                      resetArmed={statsResetArmed}
                      resetInput={statsResetInput}
                      resetPhrase={STATS_RESET_PHRASE}
                      refreshNonce={statsRefreshNonce}
                    />
                    {statsStatus.map((line) => (
                      <text key={line} fg={theme.tokens.textMuted}>
                        {line}
                      </text>
                    ))}
                  </>
                ) : null}
              </box>
            </scrollbox>
          )}
        </box>
      </box>

      <box
        minHeight={7}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="flex-start"
        backgroundColor={theme.tokens.panel}
        border
        borderColor={theme.tokens.focus}
      >
        {(() => {
          const footerGroups =
            focusMode === "global"
              ? activeRoute === "home"
                ? HOME_GLOBAL_FOOTER_GROUPS
                : GLOBAL_FOOTER_GROUPS
              : activeRoute === "browse"
                ? [
                    ["Left/Right", "switch pane"],
                    ["Up/Down", "move list"],
                    ["Esc", "back to pages"],
                    ["q", "quit"],
                  ]
                : activeRoute === "init"
                  ? [
                      ["Arrows", "move list"],
                      ["Space", "toggle path"],
                      ["Enter", "next/confirm"],
                      ["Esc", "back to pages"],
                    ]
                    : activeRoute === "maintain"
                      ? [
                          ["Arrows", "move row"],
                          ["Space", "toggle action"],
                          ["Enter", "preview/apply/reset"],
                          ["Esc", "back to pages"],
                        ]
                      : activeRoute === "presets"
                        ? [
                            ["Left/Right", "save mode"],
                            ["Up/Down", "move row"],
                            ["Space", "toggle selected"],
                            ["Enter", "save preset choices"],
                            ["Esc", "back to pages"],
                          ]
                        : activeRoute === "stats"
                          ? [
                              ["r", "arm reset"],
                              ["Type", STATS_RESET_PHRASE],
                              ["Enter", "confirm stats reset"],
                              ["Esc", "back to pages"],
                            ]
                      : PAGE_FOOTER_GROUPS;

          return (
        <box flexDirection="row" gap={1} flexWrap="wrap">
              {footerGroups.map(([keyLabel, actionLabel]) => (
            <box
              key={`${keyLabel}-${actionLabel}`}
              border
              borderStyle="rounded"
              borderColor={theme.tokens.focus}
              backgroundColor={theme.tokens.panelAlt}
              paddingX={1}
            >
              <text fg={theme.tokens.textMuted}>
                <span fg={theme.tokens.accentStrong}>
                  <strong>{keyLabel}</strong>
                </span>
                <span>  {actionLabel}</span>
              </text>
            </box>
              ))}
        </box>
          );
        })()}
      </box>
    </box>
  );
}
