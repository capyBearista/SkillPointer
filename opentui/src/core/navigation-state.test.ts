import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGlobalArrow,
  applyGlobalEnter,
  applyHotkeyRoute,
  applyTabCycle,
  applyEscape,
  type NavigationState,
} from "./navigation-state";

function initial(route: NavigationState["activeRoute"] = "home"): NavigationState {
  return {
    selectedRoute: route,
    activeRoute: route,
    focusMode: "global",
  };
}

test("global arrows move between routes without entering page focus", () => {
  const fromHome = initial("home");
  const next = applyGlobalArrow(fromHome, "down");

  assert.equal(next.activeRoute, "init");
  assert.equal(next.selectedRoute, "init");
  assert.equal(next.focusMode, "global");
});

test("enter on home starts guided init and enters page focus", () => {
  const state = initial("home");
  const next = applyGlobalEnter(state);

  assert.equal(next.activeRoute, "init");
  assert.equal(next.selectedRoute, "init");
  assert.equal(next.focusMode, "page");
});

test("enter on non-home route enters page focus without route change", () => {
  const state = initial("maintain");
  const next = applyGlobalEnter(state);

  assert.equal(next.activeRoute, "maintain");
  assert.equal(next.selectedRoute, "maintain");
  assert.equal(next.focusMode, "page");
});

test("escape exits page focus before app quit", () => {
  const focused: NavigationState = {
    selectedRoute: "init",
    activeRoute: "init",
    focusMode: "page",
  };

  const result = applyEscape(focused);
  assert.equal(result.shouldExit, false);
  assert.equal(result.next.focusMode, "global");
  assert.equal(result.next.activeRoute, "init");

  const second = applyEscape(result.next);
  assert.equal(second.shouldExit, true);
  assert.equal(second.next.focusMode, "global");
});

test("route hotkeys navigate and preserve current focus mode", () => {
  const focused: NavigationState = {
    selectedRoute: "init",
    activeRoute: "init",
    focusMode: "page",
  };

  const next = applyHotkeyRoute(focused, "browse");
  assert.equal(next.activeRoute, "browse");
  assert.equal(next.selectedRoute, "browse");
  assert.equal(next.focusMode, "page");
});

test("tab cycle in sidebar mode wraps and keeps sidebar focus", () => {
  const state = initial("stats");
  const next = applyTabCycle(state, "next");

  assert.equal(next.activeRoute, "home");
  assert.equal(next.focusMode, "global");
});

test("tab cycle in page mode wraps and keeps page focus", () => {
  const state: NavigationState = {
    selectedRoute: "home",
    activeRoute: "home",
    focusMode: "page",
  };

  const prev = applyTabCycle(state, "prev");
  assert.equal(prev.activeRoute, "stats");
  assert.equal(prev.focusMode, "page");
});
