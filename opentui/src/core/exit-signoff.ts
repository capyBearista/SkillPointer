export const ROYAL_BLUE_HEX = "#4169E1";

export const CAT_THEMED_SIGNOFF_LINES = [
  "SkillCat curls up by your prompt and purrs until next run.",
  "SkillCat slips into the night with a soft paw-tap goodbye.",
  "SkillCat leaves fresh pawprints across your terminal buffer.",
  "SkillCat chases one last cursor and vanishes with a purr.",
  "SkillCat stretches, flicks its tail, and pads off for now.",
] as const;

export const SKILLCAT_FILLED_STYLE = {
  font: "block",
  letterSpacing: 0,
  palette: [ROYAL_BLUE_HEX, ROYAL_BLUE_HEX],
} as const;

export function getRandomCatSignoff(forcedIndex?: number): string {
  if (typeof forcedIndex === "number") {
    if (forcedIndex < 0 || forcedIndex >= CAT_THEMED_SIGNOFF_LINES.length) {
      return CAT_THEMED_SIGNOFF_LINES[0];
    }
    return CAT_THEMED_SIGNOFF_LINES[forcedIndex]!;
  }
  const index = Math.floor(Math.random() * CAT_THEMED_SIGNOFF_LINES.length);
  return CAT_THEMED_SIGNOFF_LINES[index]!;
}
