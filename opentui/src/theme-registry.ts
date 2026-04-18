export interface ThemeTokens {
  background: string;
  surface: string;
  panel: string;
  panelAlt: string;
  text: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  focus: string;
  selectedBg: string;
  selectedText: string;
  warning: string;
  danger: string;
  success: string;
}

export interface ThemePack {
  id: string;
  label: string;
  subtitle: string;
  tokens: ThemeTokens;
}

export const THEME_REGISTRY: Record<string, ThemePack> = {
  graphite: {
    id: "graphite",
    label: "Graphite",
    subtitle: "Sleek professional greys with crisp accents",
    tokens: {
      background: "#0f1115",
      surface: "#171a20",
      panel: "#1f232b",
      panelAlt: "#171b23",
      text: "#e7eaef",
      textMuted: "#a7afbc",
      accent: "#5f8dff",
      accentStrong: "#87a9ff",
      focus: "#6fb0ff",
      selectedBg: "#2b3f68",
      selectedText: "#eef3ff",
      warning: "#d8b36a",
      danger: "#d37a7a",
      success: "#7ac29c",
    },
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    subtitle: "Near-black foundation with signature OpenCode accents",
    tokens: {
      background: "#020202",
      surface: "#121212",
      panel: "#1a1a1a",
      panelAlt: "#151515",
      text: "#eeeeee",
      textMuted: "#808080",
      accent: "#9d7cd8",
      accentStrong: "#fab283",
      focus: "#56b6c2",
      selectedBg: "#2c3f5e",
      selectedText: "#f0f5ff",
      warning: "#f4bf75",
      danger: "#e06c75",
      success: "#7fd88f",
    },
  },
  "warm-cat": {
    id: "warm-cat",
    label: "Warm Cat",
    subtitle: "Professional warmth with catlike charm",
    tokens: {
      background: "#15171d",
      surface: "#1f2430",
      panel: "#2a3140",
      panelAlt: "#232b38",
      text: "#f4f1ea",
      textMuted: "#c6beae",
      accent: "#d6a85f",
      accentStrong: "#e8bb71",
      focus: "#e5bf82",
      selectedBg: "#c88d4a",
      selectedText: "#15171d",
      warning: "#dfb561",
      danger: "#d26c6c",
      success: "#83c59d",
    },
  },
  "ember-cat": {
    id: "ember-cat",
    label: "Ember Cat",
    subtitle: "Warm, moody, and slightly playful",
    tokens: {
      background: "#1b1614",
      surface: "#2a1f1b",
      panel: "#372823",
      panelAlt: "#30231f",
      text: "#f6ede5",
      textMuted: "#cfb9ab",
      accent: "#e08f5f",
      accentStrong: "#f0a576",
      focus: "#f2bc91",
      selectedBg: "#d17c4e",
      selectedText: "#1b1614",
      warning: "#e2b76f",
      danger: "#dd7770",
      success: "#8dcca8",
    },
  },
};

export const DEFAULT_THEME_ID = "graphite";

export const THEME_ORDER = ["graphite", "opencode", "warm-cat", "ember-cat"];
