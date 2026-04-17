import { ROUTES, type RouteName } from "../routes";

export type FocusMode = "global" | "page";

export type NavigationState = {
  selectedRoute: RouteName;
  activeRoute: RouteName;
  focusMode: FocusMode;
};

type Direction = "up" | "down";
type TabDirection = "next" | "prev";

type EscapeResult = {
  next: NavigationState;
  shouldExit: boolean;
};

function routeAt(index: number): RouteName {
  const bounded = (index + ROUTES.length) % ROUTES.length;
  return ROUTES[bounded] ?? "home";
}

export function applyGlobalArrow(state: NavigationState, direction: Direction): NavigationState {
  const current = ROUTES.indexOf(state.activeRoute);
  const delta = direction === "up" ? -1 : 1;
  const nextRoute = routeAt(current + delta);

  return {
    selectedRoute: nextRoute,
    activeRoute: nextRoute,
    focusMode: "global",
  };
}

export function applyGlobalEnter(state: NavigationState): NavigationState {
  if (state.activeRoute === "home") {
    return {
      selectedRoute: "init",
      activeRoute: "init",
      focusMode: "page",
    };
  }

  return {
    selectedRoute: state.activeRoute,
    activeRoute: state.activeRoute,
    focusMode: "page",
  };
}

export function applyHotkeyRoute(state: NavigationState, route: RouteName): NavigationState {
  return {
    ...state,
    selectedRoute: route,
    activeRoute: route,
    focusMode: state.focusMode,
  };
}

export function applyTabCycle(
  state: NavigationState,
  direction: TabDirection,
): NavigationState {
  const current = ROUTES.indexOf(state.activeRoute);
  const delta = direction === "next" ? 1 : -1;
  const nextRoute = routeAt(current + delta);

  return {
    ...state,
    selectedRoute: nextRoute,
    activeRoute: nextRoute,
    focusMode: state.focusMode,
  };
}

export function applyEscape(state: NavigationState): EscapeResult {
  if (state.focusMode === "page") {
    return {
      next: {
        ...state,
        focusMode: "global",
      },
      shouldExit: false,
    };
  }

  return {
    next: state,
    shouldExit: true,
  };
}
