import {
  DEFAULT_THEME_ID,
  THEME_ORDER,
  THEME_REGISTRY,
  type ThemePack,
} from "../theme-registry";

export { DEFAULT_THEME_ID, THEME_ORDER, THEME_REGISTRY };

export function getInitialThemeIndex(
  order: string[] = THEME_ORDER,
  defaultThemeId: string = DEFAULT_THEME_ID,
): number {
  if (order.length === 0) {
    return 0;
  }
  const index = order.indexOf(defaultThemeId);
  return index >= 0 ? index : 0;
}

export function getNextThemeIndex(currentIndex: number, order: string[] = THEME_ORDER): number {
  if (order.length === 0) {
    return 0;
  }
  return (currentIndex + 1) % order.length;
}

export function ensureThemeOrderInvariant(
  order: string[] = THEME_ORDER,
  registry: Record<string, ThemePack> = THEME_REGISTRY,
): void {
  if (order.length === 0) {
    throw new Error("Theme order cannot be empty.");
  }
  for (const themeId of order) {
    if (!registry[themeId]) {
      throw new Error(`Theme '${themeId}' is missing from theme registry.`);
    }
  }
}

export function getThemePack(themeIndex: number): ThemePack {
  ensureThemeOrderInvariant();
  const fallbackThemeId = THEME_ORDER[0]!;
  const themeId = THEME_ORDER[themeIndex] ?? fallbackThemeId;
  return THEME_REGISTRY[themeId] ?? THEME_REGISTRY[fallbackThemeId]!;
}
