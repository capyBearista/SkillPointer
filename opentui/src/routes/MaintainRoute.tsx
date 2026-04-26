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
  pointerMode: string;
  maintainBatchAction: MaintainConflictAction;
  maintainPlan: MaintainPlan | null;
  maintainPreviewLines: string[];
  maintainResult: string[];
  sandboxStatus: string[];
  maintainSelectedMoves: Set<string>;
  maintainMoveCursor: number;
  formatMaintainAction: (action: MaintainConflictAction) => string;
  renderPreviewCard: (title: string, lines: string[]) => ReactNode;
};

export function MaintainRoute({
  theme,
  maintainCursor,
  maintainActions,
  pointerMode,
  maintainBatchAction,
  maintainPlan,
  maintainPreviewLines,
  maintainResult,
  sandboxStatus,
  maintainSelectedMoves,
  maintainMoveCursor,
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
        {maintainCursor === 2 ? ">" : " "} Pointer mode: {pointerMode}
      </text>
      <text fg={maintainCursor === 3 ? theme.tokens.accentStrong : theme.tokens.text}>
        {maintainCursor === 3 ? ">" : " "} Conflict policy: {formatMaintainAction(maintainBatchAction)}
      </text>
      <text fg={maintainCursor === 4 ? theme.tokens.accentStrong : theme.tokens.text}>
        {maintainCursor === 4 ? ">" : " "} Build combined preview
      </text>
      <text fg={maintainCursor === 5 ? theme.tokens.accentStrong : theme.tokens.text}>
        {maintainCursor === 5 ? ">" : " "} Apply previewed plan
      </text>
      <text fg={maintainCursor === 6 ? theme.tokens.accentStrong : theme.tokens.text}>
        {maintainCursor === 6 ? ">" : " "} Reset local sandbox (restore test skills + clear sandbox vault)
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

          <box flexDirection="column" marginTop={1}>
            <text fg={maintainCursor === 7 ? theme.tokens.accentStrong : theme.tokens.text}>
              <strong>Move Operations Checklist</strong>
            </text>
            {(() => {
              const total = maintainPlan.moveOperations.length;
              const maxVisible = 10;
              const halfVisible = Math.floor(maxVisible / 2);
              
              let start = Math.max(0, maintainMoveCursor - halfVisible);
              let end = start + maxVisible;
              if (end > total) {
                end = total;
                start = Math.max(0, end - maxVisible);
              }

              return maintainPlan.moveOperations.slice(start, end).map((op, idx) => {
                const index = start + idx;
                const isFocused = maintainCursor === 7 && maintainMoveCursor === index;
                const isSelected = maintainSelectedMoves.has(op.id);
                return (
                  <box flexDirection="row" key={op.id}>
                    <text fg={isFocused ? theme.tokens.accentStrong : theme.tokens.textMuted}>
                      {isFocused ? ">" : " "} [{isSelected ? "x" : " "}] {op.skillName}: {op.fromCategory} -{">"} {op.toCategory}
                    </text>
                    {op.isSemanticOverride && op.confidenceScore !== undefined && op.margin !== undefined ? (
                      <text fg={theme.tokens.warning}> (Semantic: {op.confidenceScore.toFixed(2)}, Margin: {op.margin.toFixed(2)})</text>
                    ) : null}
                  </box>
                );
              });
            })()}
          </box>

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
