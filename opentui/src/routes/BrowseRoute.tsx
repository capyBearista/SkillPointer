import type { BrowseCategory, BrowseSkill } from "../core/browse-data";
import type { ThemePack } from "../theme-registry";

export type BrowseRouteProps = {
  theme: ThemePack;
  browseIndex: { categories: BrowseCategory[]; totalSkills: number };
  browseFocus: "categories" | "skills";
  browseCategories: BrowseCategory[];
  browseCategoryCursor: number;
  activeBrowseCategory: BrowseCategory | null;
  browseSkillCursor: number;
  activeBrowseSkill: BrowseSkill | null;
  toRelativePath: (value: string) => string;
};

export function BrowseRoute({
  theme,
  browseIndex,
  browseFocus,
  browseCategories,
  browseCategoryCursor,
  activeBrowseCategory,
  browseSkillCursor,
  activeBrowseSkill,
  toRelativePath,
}: BrowseRouteProps) {
  return (
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
                  Tags: {activeBrowseSkill.tags.length > 0 ? activeBrowseSkill.tags.join(", ") : "none"}
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
  );
}
