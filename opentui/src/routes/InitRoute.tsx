import type { PathProfile, PathProfileId, PathSelectionState } from "../core/path-profiles";
import type { InitStep } from "../core/init-flow";
import type { InitPlan, PlanConflictAction } from "../core/init-plan";
import type { ThemePack } from "../theme-registry";
import type { ReactNode } from "react";

export type InitRouteProps = {
  theme: ThemePack;
  initStep: InitStep;
  profiles: PathProfile[];
  selectedProfiles: PathProfile[];
  pathSelection: PathSelectionState;
  pathCursor: number;
  duplicateConflicts: any[];
  duplicateCursor: number;
  duplicateChoiceCursor: number;
  initPlan: InitPlan | null;
  batchAction: PlanConflictAction;
  pointerMode: string;
  initPreviewLines: string[];
  initResult: string[];
  toRelativePath: (value: string) => string;
  formatPlanAction: (action: PlanConflictAction) => string;
  explainPlanAction: (action: PlanConflictAction) => string;
  renderPreviewCard: (title: string, lines: string[]) => ReactNode;
};

export function InitRoute({
  theme,
  initStep,
  profiles,
  selectedProfiles,
  pathSelection,
  pathCursor,
  duplicateConflicts,
  duplicateCursor,
  duplicateChoiceCursor,
  initPlan,
  batchAction,
  pointerMode,
  initPreviewLines,
  initResult,
  toRelativePath,
  formatPlanAction,
  explainPlanAction,
  renderPreviewCard,
}: InitRouteProps) {
  return (
    <>
      <text fg={theme.tokens.text}>
        Guided init with plan/apply safety boundary.
      </text>
      <text fg={theme.tokens.textMuted}>
        Step: <span fg={theme.tokens.accentStrong}>{initStep}</span>
      </text>
      <text fg={theme.tokens.textMuted}>
        Flow: select paths {"->"} preview plan {"->"} resolve duplicates {"->"} confirm apply.
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
                  <text fg={theme.tokens.textMuted}>Vault: {toRelativePath(profile.vaultDir)}</text>
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
          <text fg={theme.tokens.textMuted}>
            Pointer Mode: <span fg={theme.tokens.accentStrong}>{pointerMode}</span> (Use Left/Right to change)
          </text>
          <text fg={theme.tokens.textMuted}>
            Tip: keep one path selected for the simplest first run.
          </text>
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
              <text fg={theme.tokens.textMuted}>
                Choose which source path should win for this destination.
              </text>
              {conflict.contenders.map((candidate: string, index: number) => (
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
  );
}
