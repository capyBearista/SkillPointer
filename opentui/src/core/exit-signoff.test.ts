import assert from "node:assert/strict";
import test from "node:test";

import {
  CAT_THEMED_SIGNOFF_LINES,
  getRandomCatSignoff,
  ROYAL_BLUE_HEX,
  SKILLCAT_FILLED_STYLE,
} from "./exit-signoff";

test("exit signoff style uses royal blue single-color palette", () => {
  assert.equal(ROYAL_BLUE_HEX, "#4169E1");
  assert.equal(SKILLCAT_FILLED_STYLE.palette.length >= 2, true);
  assert.equal(SKILLCAT_FILLED_STYLE.palette.every((color) => color === ROYAL_BLUE_HEX), true);
});

test("exit signoff style uses block font with tighter spacing", () => {
  assert.equal(SKILLCAT_FILLED_STYLE.font, "block");
  assert.equal(SKILLCAT_FILLED_STYLE.letterSpacing, 0);
});

test("random signoff returns deterministic first item for invalid index", () => {
  assert.equal(getRandomCatSignoff(-1), CAT_THEMED_SIGNOFF_LINES[0]);
});

test("random signoff returns deterministic indexed item when provided", () => {
  const selected = getRandomCatSignoff(2);
  assert.equal(selected, CAT_THEMED_SIGNOFF_LINES[2]);
});
