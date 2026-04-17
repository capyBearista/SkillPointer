import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildBrowseIndex,
  type BrowseCategory,
  type BrowseSkill,
} from "./core/browse-data";
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
  applyEscape,
  applyGlobalArrow,
  applyGlobalEnter,
  applyHotkeyRoute,
  applyTabCycle,
  type FocusMode,
} from "./core/navigation-state";
import { ROUTES, type RouteName } from "./routes";
import { THEME_ORDER, THEME_REGISTRY } from "./theme-registry";

const ROUTE_HOTKEYS: Record<string, RouteName> = {
  i: "init",
  b: "browse",
  m: "maintain",
  p: "presets",
  s: "stats",
};

const CAT_FRAMES = [
  String.raw`   /\_/\
  ( o.o )~
   > ^ <`,
  String.raw`   /\_/\
  ( -.- )~~
   > ^ <`,
  String.raw`   /\_/\
  ( o.o )~~~
   > ^ <`,
  String.raw`   /\_/\
  ( o.o )~~
   > ^ <`,
];

type AppProps = {
  startRoute: RouteName;
  onExit: () => void | Promise<void>;
};

type MaintainActionState = {
  recategorize: boolean;
  regeneratePointers: boolean;
};

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

const PAGE_FOOTER_GROUPS = [
  ["Arrows", "navigate page"],
  ["Enter", "confirm action"],
  ["Space", "toggle option"],
  ["Esc", "back to pages"],
  ["i/b/m/p/s", "jump pages"],
  ["q", "quit"],
] as const;

function toRelativePath(value: string): string {
  const home = process.env.HOME;
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

function useDetectedProfiles() {
  const [profiles, setProfiles] = useState<PathProfile[]>([]);

  useEffect(() => {
    setProfiles(detectPathProfiles());
  }, []);

  return [profiles, setProfiles] as const;
}

export function App({ startRoute, onExit }: AppProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState<RouteName>(startRoute);
  const [activeRoute, setActiveRoute] = useState<RouteName>(startRoute);
  const [focusMode, setFocusMode] = useState<FocusMode>("global");
  const [catFrameIndex, setCatFrameIndex] = useState(0);
  const [catBreath, setCatBreath] = useState(0);
  const [focusPulse, setFocusPulse] = useState(0);
  const selectedProfilesRef = useRef<PathProfile[]>([]);

  const [profiles, setProfiles] = useDetectedProfiles();

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
  const [presetsNotice, setPresetsNotice] = useState<string[]>([]);
  const [statsNotice, setStatsNotice] = useState<string[]>([]);

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

  const themeId = THEME_ORDER[themeIndex] ?? THEME_ORDER[0];
  const theme = THEME_REGISTRY[themeId];
  const isSidebarFocused = focusMode === "global";

  useEffect(() => {
    const frameLoop = setInterval(() => {
      setCatFrameIndex((index) => (index + 1) % CAT_FRAMES.length);
    }, 360);

    const breathLoop = setInterval(() => {
      setCatBreath((value) => (value === 0 ? 1 : 0));
    }, 1200);

    return () => {
      clearInterval(frameLoop);
      clearInterval(breathLoop);
    };
  }, []);

  useEffect(() => {
    const pulseLoop = setInterval(() => {
      setFocusPulse((value) => (value === 0 ? 1 : 0));
    }, 640);

    return () => {
      clearInterval(pulseLoop);
    };
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

  const executeInitApply = () => {
    if (!initPlan) {
      return;
    }

    try {
      const result = applyInitPlan(initPlan, { batchConflictAction: batchAction });
      if (result.status === "aborted") {
        setInitResult([
          "Init apply aborted by selected conflict policy.",
          "No filesystem changes were made.",
        ]);
      } else {
        setInitResult([
          "Init apply complete.",
          `Moved skills: ${result.movedCount}`,
          `Pointers generated: ${result.pointerCount}`,
          `Skipped due to policy: ${result.skippedCount}`,
        ]);
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

  const buildMaintainPreview = () => {
    const selected = selectedProfiles.length > 0 ? selectedProfiles : profiles;
    const nextPlan = buildMaintainPlan({
      profiles: selected,
      actions: maintainActions,
    });
    setMaintainPlan(nextPlan);
    setMaintainPreviewLines(buildMaintainPreviewLines(nextPlan));
  };

  const executeMaintainApply = () => {
    if (!maintainPlan) {
      setMaintainResult(["Build a maintain preview before apply."]);
      return;
    }

    try {
      const result = applyMaintainPlan(maintainPlan, {
        batchConflictAction: maintainBatchAction,
      });
      if (result.status === "aborted") {
        setMaintainResult([
          "Maintain apply aborted by selected conflict policy.",
          "No filesystem changes were made.",
        ]);
      } else {
        setMaintainResult([
          "Maintain apply complete.",
          `Moved skills: ${result.movedCount}`,
          `Pointers generated: ${result.pointerCount}`,
          `Skipped due to policy: ${result.skippedCount}`,
        ]);
      }
      setProfiles(detectPathProfiles());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown maintain error";
      setMaintainResult([`Maintain apply failed: ${message}`]);
    }
  };

  useKeyboard((key) => {
    if (key.name === "q") {
      void onExit();
      return;
    }

    if (key.name === "t") {
      setThemeIndex((index) => (index + 1) % THEME_ORDER.length);
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
    if (hotkeyRoute) {
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
          const transition = onInitSelectPathsEnter(profiles, pathSelection);
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

          const resolved = resolveDuplicateConflict(initPlan, currentConflict.id, source);
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
          executeInitApply();
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
        setMaintainCursor((cursor) => Math.min(4, cursor + 1));
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
          buildMaintainPreview();
          return;
        }

        if (maintainCursor === 4) {
          executeMaintainApply();
          return;
        }
      }

      return;
    }

    if (activeRoute === "presets") {
      if (isEnterKey(key.name)) {
        setPresetsNotice([
          "Presets actions are part of Phase D.",
          "Use Tab to cycle screens, or Esc to return to sidebar focus.",
        ]);
      }
      return;
    }

    if (activeRoute === "stats") {
      if (isEnterKey(key.name)) {
        setStatsNotice([
          "Stats actions are part of Phase D.",
          "Use Tab to cycle screens, or Esc to return to sidebar focus.",
        ]);
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
        minHeight={5}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        justifyContent="center"
        backgroundColor={theme.tokens.panel}
        border
        borderColor={theme.tokens.focus}
      >
        <text fg={theme.tokens.accentStrong}>SkillCat  {theme.label}</text>
        <text fg={theme.tokens.textMuted}>Theme: {theme.subtitle}</text>
        <text fg={isSidebarFocused ? theme.tokens.warning : theme.tokens.success}>
          Focus: {isSidebarFocused ? "Sidebar" : "Page"}
          {focusPulse ? (isSidebarFocused ? "  < nav >" : "  < interact >") : ""}
        </text>
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
              <text fg={theme.tokens.accentStrong} content={catBreath ? " " : ""} />
              <text fg={theme.tokens.accentStrong} content={CAT_FRAMES[catFrameIndex]} />
              <text fg={theme.tokens.text}>
                <strong>Friendly. Focused. Fast.</strong>
              </text>
              <text fg={theme.tokens.textMuted}>
                Press <span fg={theme.tokens.accentStrong}>Enter</span> on
                <span fg={theme.tokens.accentStrong}> INIT</span> to start your guided flow.
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
                  <strong>Start Guided Init</strong>
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
                  <>
                    <text fg={theme.tokens.text}>
                      Guided init with plan/apply safety boundary.
                    </text>
                    <text fg={theme.tokens.textMuted}>
                      Step: <span fg={theme.tokens.accentStrong}>{initStep}</span>
                    </text>

                    {initStep === "select-paths" ? (
                      <>
                        <text fg={theme.tokens.warning}>
                          Select one or more active paths. No default is preselected.
                        </text>
                        {profiles.length === 0 ? (
                          <text fg={theme.tokens.danger}>
                            No compatible active skill directories detected.
                          </text>
                        ) : (
                          profiles.map((profile, index) => {
                            const selected = Boolean(pathSelection[profile.id as PathProfileId]);
                            const focused = index === pathCursor;
                            return (
                              <box key={profile.id} flexDirection="column">
                                <text fg={focused ? theme.tokens.accentStrong : theme.tokens.text}>
                                  {focused ? ">" : " "} [{selected ? "x" : " "}] {profile.label}
                                </text>
                                <text fg={theme.tokens.textMuted}>
                                  {toRelativePath(profile.activeDir)}
                                </text>
                              </box>
                            );
                          })
                        )}

                        {selectedProfiles.length > 1 ? (
                          <text fg={theme.tokens.warning}>
                            Multi-source mode: duplicate skills may appear across selected paths and
                            will require conflict resolution.
                          </text>
                        ) : null}
                        <text fg={theme.tokens.success}>
                          Enter to build plan, Space to toggle current path.
                        </text>
                      </>
                    ) : null}

                    {initStep === "resolve-duplicates" && initPlan ? (
                      (() => {
                        const conflict = duplicateConflicts[duplicateCursor];
                        if (!conflict) {
                          return (
                            <text fg={theme.tokens.success}>
                              Duplicate resolution complete.
                            </text>
                          );
                        }

                        return (
                          <>
                            <text fg={theme.tokens.warning}>
                              Duplicate conflict {duplicateCursor + 1}/{duplicateConflicts.length}
                            </text>
                            <text fg={theme.tokens.textMuted}>
                              Destination: {toRelativePath(conflict.destinationPath)}
                            </text>
                            {conflict.contenders.map((candidate, index) => (
                              <text
                                key={`${conflict.id}-${candidate}`}
                                fg={
                                  index === duplicateChoiceCursor
                                    ? theme.tokens.accentStrong
                                    : theme.tokens.text
                                }
                              >
                                {index === duplicateChoiceCursor ? ">" : " "} {toRelativePath(candidate)}
                              </text>
                            ))}
                            <text fg={theme.tokens.success}>
                              Left/Right to choose, Enter to confirm source.
                            </text>
                          </>
                        );
                      })()
                    ) : null}

                    {initStep === "ready" && initPlan ? (
                      <>
                        <text fg={theme.tokens.success}>Plan ready for apply.</text>
                        <text fg={theme.tokens.textMuted}>
                          Moves: {initPlan.moveOperations.length} | Pointers: {initPlan.pointerOperations.length}
                        </text>
                        <text fg={theme.tokens.textMuted}>
                          Batch destination policy: {formatPlanAction(batchAction)}
                        </text>
                        <text fg={theme.tokens.textMuted}>{explainPlanAction(batchAction)}</text>
                        <text fg={theme.tokens.warning}>
                          Use Left/Right now to change this policy before applying.
                        </text>
                        {renderPreviewCard("Init Preview", initPreviewLines)}
                        <text fg={theme.tokens.success}>
                          Enter to apply. Left/Right to change policy.
                        </text>
                      </>
                    ) : null}

                    {initStep === "result" ? (
                      <>
                        {initResult.map((line) => (
                          <text key={line} fg={theme.tokens.textMuted}>
                            {line}
                          </text>
                        ))}
                        <text fg={theme.tokens.success}>Press Enter to start a new init run.</text>
                      </>
                    ) : null}
                  </>
                ) : null}

                {activeRoute === "browse" ? (
                  <>
                    <text fg={theme.tokens.text}>
                      Compact category-first browse. Left/Right switches panes.
                    </text>
                    <text fg={theme.tokens.textMuted}>
                      Categories: {browseIndex.categories.length} | Skills: {browseIndex.totalSkills}
                    </text>
                    <box flexDirection="row" gap={2}>
                      <box flexDirection="column" width={32}>
                        <text
                          fg={
                            browseFocus === "categories"
                              ? theme.tokens.accentStrong
                              : theme.tokens.textMuted
                          }
                        >
                          {browseFocus === "categories" ? ">" : " "} Categories
                        </text>
                        {browseCategories.length === 0 ? (
                          <text fg={theme.tokens.warning}>No categories detected.</text>
                        ) : (
                          browseCategories.map((category, index) => (
                            <text
                              key={category.name}
                              fg={
                                index === browseCategoryCursor
                                  ? browseFocus === "categories"
                                    ? theme.tokens.accentStrong
                                    : theme.tokens.focus
                                  : theme.tokens.text
                              }
                            >
                              {index === browseCategoryCursor ? ">" : " "} {category.label} ({category.skills.length})
                            </text>
                          ))
                        )}
                      </box>
                      <box flexDirection="column" flexGrow={1}>
                        <text
                          fg={
                            browseFocus === "skills"
                              ? theme.tokens.accentStrong
                              : theme.tokens.textMuted
                          }
                        >
                          {browseFocus === "skills" ? ">" : " "} Skills
                        </text>
                        {!activeBrowseCategory ? (
                          <text fg={theme.tokens.warning}>No category selected.</text>
                        ) : (
                          activeBrowseCategory.skills.map((skill, index) => (
                            <text
                              key={skill.path}
                              fg={
                                index === browseSkillCursor
                                  ? browseFocus === "skills"
                                    ? theme.tokens.accentStrong
                                    : theme.tokens.focus
                                  : theme.tokens.text
                              }
                            >
                              {index === browseSkillCursor ? ">" : " "} {skill.name}
                            </text>
                          ))
                        )}

                        <box flexDirection="column" marginTop={1}>
                          <text fg={theme.tokens.accentStrong}>Details</text>
                          {activeBrowseSkill ? (
                            <>
                              <text fg={theme.tokens.textMuted}>Name: {activeBrowseSkill.name}</text>
                              <text fg={theme.tokens.textMuted}>
                                Description: {activeBrowseSkill.description}
                              </text>
                              <text fg={theme.tokens.textMuted}>
                                Path: {toRelativePath(activeBrowseSkill.path)}
                              </text>
                            </>
                          ) : (
                            <text fg={theme.tokens.warning}>No skill selected.</text>
                          )}
                        </box>
                      </box>
                    </box>
                  </>
                ) : null}

                {activeRoute === "maintain" ? (
                  <>
                    <text fg={theme.tokens.text}>
                      Toggle actions, preview once, then apply safely.
                    </text>
                    <text fg={theme.tokens.textMuted}>
                      Uses selected init paths when available; otherwise all detected profiles.
                    </text>

                    <text fg={maintainCursor === 0 ? theme.tokens.accentStrong : theme.tokens.text}>
                      {maintainCursor === 0 ? ">" : " "} [
                      {maintainActions.recategorize ? "x" : " "}] Recategorize skills
                    </text>
                    <text fg={maintainCursor === 1 ? theme.tokens.accentStrong : theme.tokens.text}>
                      {maintainCursor === 1 ? ">" : " "} [
                      {maintainActions.regeneratePointers ? "x" : " "}] Regenerate pointers
                    </text>
                    <text fg={maintainCursor === 2 ? theme.tokens.accentStrong : theme.tokens.text}>
                      {maintainCursor === 2 ? ">" : " "} Conflict policy: {formatMaintainAction(maintainBatchAction)}
                    </text>
                    <text fg={maintainCursor === 3 ? theme.tokens.accentStrong : theme.tokens.text}>
                      {maintainCursor === 3 ? ">" : " "} Build combined preview
                    </text>
                    <text fg={maintainCursor === 4 ? theme.tokens.accentStrong : theme.tokens.text}>
                      {maintainCursor === 4 ? ">" : " "} Apply previewed plan
                    </text>

                    {maintainPlan ? (
                      <>
                        <text fg={theme.tokens.success}>Preview ready.</text>
                        <text fg={theme.tokens.textMuted}>
                          Moves: {maintainPlan.moveOperations.length} | Pointers: {maintainPlan.pointerOperations.length}
                        </text>
                        <text fg={theme.tokens.textMuted}>
                          Conflicts: {maintainPlan.conflicts.length}
                        </text>
                        {renderPreviewCard("Maintain Preview", maintainPreviewLines)}
                      </>
                    ) : null}

                    {maintainResult.map((line) => (
                      <text key={line} fg={theme.tokens.textMuted}>
                        {line}
                      </text>
                    ))}
                  </>
                ) : null}

                {activeRoute === "presets" ? (
                  <>
                    <text fg={theme.tokens.textMuted}>Phase D placeholder.</text>
                    <text fg={theme.tokens.warning}>Save-all/save-selected/discard arrives next phase.</text>
                    {presetsNotice.map((line) => (
                      <text key={line} fg={theme.tokens.textMuted}>
                        {line}
                      </text>
                    ))}
                  </>
                ) : null}

                {activeRoute === "stats" ? (
                  <>
                    <text fg={theme.tokens.textMuted}>Phase D placeholder.</text>
                    <text fg={theme.tokens.warning}>
                      Rolling retention and reset safeguards arrive next phase.
                    </text>
                    {statsNotice.map((line) => (
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
              ? GLOBAL_FOOTER_GROUPS
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
                        ["Enter", "preview/apply"],
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
