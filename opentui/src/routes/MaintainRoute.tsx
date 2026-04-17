import type { MaintainPlan, MaintainConflictAction } from "../core/maintain-plan";
import type { ThemePack } from "../theme-registry";
import type { ReactNode } from "react";

export type MaintainActionState = {
  recategorize: boolean;
  regeneratePointers: boolean;
};

export type MaintainRouteProps = {
  theme: ThemePack;
  maintainCursor: number;
  maintainActions: MaintainActionState;
  maintainBatchAction: MaintainConflictAction;
  maintainPlan: MaintainPlan | null;
  maintainPreviewLines: string[];
  maintainResult: string[];
  sandboxStatus: string[];
  formatMaintainAction: (action: MaintainConflictAction) => string;
  renderPreviewCard: (title: string, lines: string[]) => ReactNode;
};

export function MaintainRoute({
  theme,
  maintainCursor,
  maintainActions,
  maintainBatchAction,
  maintainPlan,
  maintainPreviewLines,
  maintainResult,
  sandboxStatus,
  formatMaintainAction,
  renderPreviewCard,
}: MaintainRouteProps) {
  return (
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
      <text fg={maintainCursor === 5 ? theme.tokens.accentStrong : theme.tokens.text}>
        {maintainCursor === 5 ? ">" : " "} Reset local sandbox (restore test skills + clear sandbox vault)
      </text>

      <text fg={theme.tokens.warning}>Local sandbox utility:</text>
      {sandboxStatus.map((line) => (
        <text key={line} fg={theme.tokens.textMuted}>
          {line}
        </text>
      ))}

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
  );
}
