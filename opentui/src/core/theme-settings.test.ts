import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_THEME_ID,
  THEME_ORDER,
  THEME_REGISTRY,
  ensureThemeOrderInvariant,
  getInitialThemeIndex,
  getNextThemeIndex,
  getThemePack,
} from "./theme-settings";

test("default theme id exists in registry", () => {
  assert.ok(THEME_REGISTRY[DEFAULT_THEME_ID]);
});

test("initial theme index resolves to configured default", () => {
  const index = getInitialThemeIndex();
  assert.equal(THEME_ORDER[index], DEFAULT_THEME_ID);
});

test("initial theme index falls back to first theme when default is missing", () => {
  const index = getInitialThemeIndex(["opencode", "graphite"], "warm-cat");
  assert.equal(index, 0);
});

test("next theme index wraps around order bounds", () => {
  assert.equal(getNextThemeIndex(0), 1);
  assert.equal(getNextThemeIndex(THEME_ORDER.length - 1), 0);
});

test("next theme index safely handles empty theme order", () => {
  assert.equal(getNextThemeIndex(3, []), 0);
});

test("theme config invariants pass for shipped theme order and registry", () => {
  assert.doesNotThrow(() => ensureThemeOrderInvariant());
});

test("theme config invariants fail when order is empty", () => {
  assert.throws(
    () => ensureThemeOrderInvariant([], THEME_REGISTRY),
    /Theme order cannot be empty/,
  );
});

test("theme config invariants fail when order references missing id", () => {
  assert.throws(
    () => ensureThemeOrderInvariant(["graphite", "missing-theme"], THEME_REGISTRY),
    /missing from theme registry/,
  );
});

test("getThemePack falls back to first theme for out-of-range index", () => {
  const theme = getThemePack(999);
  assert.equal(theme.id, THEME_ORDER[0]);
});

test("getThemePack also falls back to first theme for negative index", () => {
  const theme = getThemePack(-1);
  assert.equal(theme.id, THEME_ORDER[0]);
});
