export const ROUTES = ["home", "init", "browse", "maintain", "presets", "stats"] as const;

export type RouteName = (typeof ROUTES)[number];

export function isRouteName(value: string): value is RouteName {
  return ROUTES.includes(value as RouteName);
}

export function isSetupFlag(value: string): boolean {
  return value === "--run-setup" || value === "setup";
}
