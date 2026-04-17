import { buildInitPlan, type InitPlan } from "./init-plan";
import { getSelectedProfiles, type PathProfile, type PathSelectionState } from "./path-profiles";
import type { FocusMode } from "./navigation-state";
import type { RouteName } from "../routes";

export type InitStep = "select-paths" | "resolve-duplicates" | "ready" | "result";

type MinimalPlanConflict = {
  kind: string;
};

export type HomeEnterTransition = {
  route: RouteName;
  focusMode: FocusMode;
  initStep: InitStep;
  pathCursor: number;
  nextSelection: PathSelectionState;
};

export type InitSelectEnterTransition = {
  nextStep: InitStep;
  resultLines: string[];
  plan: InitPlan | null;
  duplicateCursor: number;
  duplicateChoiceCursor: number;
};

function resetSelection(profiles: PathProfile[]): PathSelectionState {
  const selection: PathSelectionState = {
    agents: false,
    opencode: false,
    claude: false,
    sandbox: false,
  };

  for (const profile of profiles) {
    selection[profile.id] = false;
  }

  return selection;
}

export function buildPlanState(plan: { conflicts: MinimalPlanConflict[] }): InitStep {
  const hasDuplicates = plan.conflicts.some(
    (conflict) => conflict.kind === "duplicate-destination",
  );
  return hasDuplicates ? "resolve-duplicates" : "ready";
}

export function onHomeEnter(
  profiles: PathProfile[],
  selectedProfiles: PathProfile[],
  previousSelection: PathSelectionState,
): HomeEnterTransition {
  const nextSelection = { ...resetSelection(profiles), ...previousSelection };

  for (const profile of profiles) {
    nextSelection[profile.id] = false;
  }

  for (const profile of selectedProfiles) {
    nextSelection[profile.id] = true;
  }

  return {
    route: "init",
    focusMode: "page",
    initStep: "select-paths",
    pathCursor: 0,
    nextSelection,
  };
}

export function onInitSelectPathsEnter(
  profiles: PathProfile[],
  selection: PathSelectionState,
): InitSelectEnterTransition {
  const selected = getSelectedProfiles(profiles, selection);
  if (selected.length === 0) {
    return {
      nextStep: "result",
      resultLines: ["Select at least one source path before continuing."],
      plan: null,
      duplicateCursor: 0,
      duplicateChoiceCursor: 0,
    };
  }

  const plan = buildInitPlan({ profiles: selected });
  return {
    nextStep: buildPlanState(plan),
    resultLines: [],
    plan,
    duplicateCursor: 0,
    duplicateChoiceCursor: 0,
  };
}
