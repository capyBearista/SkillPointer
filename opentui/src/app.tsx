import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

import { ROUTES, type RouteName } from "./routes";
import { THEME_ORDER, THEME_REGISTRY } from "./theme-registry";

const ROUTE_HOTKEYS: Record<string, RouteName> = {
  i: "init",
  b: "browse",
  m: "maintain",
  p: "presets",
  s: "stats",
};

const ROUTE_COPY: Record<RouteName, { title: string; body: string[] }> = {
  home: {
    title: "Welcome to SkillCat",
    body: [
      "A warm, focused TUI for organizing your agent skill libraries.",
      "Primary action: Start with Init.",
      "Secondary actions: Browse, Maintain, Presets, and Stats.",
    ],
  },
  init: {
    title: "Init",
    body: [
      "Guided initialization placeholder for Phase B.",
      "Filesystem mutation workflow and confirmation ladder land in Phase C.",
      "This screen proves routing, layout, and themed interaction behavior.",
    ],
  },
  browse: {
    title: "Browse",
    body: [
      "Category-first browse placeholder for Phase B.",
      "Compact drilldown and metadata panels land in Phase C.",
      "Mouse + keyboard navigation is active now for route traversal.",
    ],
  },
  maintain: {
    title: "Maintain",
    body: [
      "Maintenance placeholder for Phase B.",
      "Preview-before-mutate operations land in Phase C.",
      "This route confirms command-surface presence in the OpenTUI shell.",
    ],
  },
  presets: {
    title: "Presets",
    body: [
      "Presets placeholder for Phase B.",
      "Save-all/save-selected/discard semantics land in Phase D.",
      "Theme and motion stay active here to verify app-wide consistency.",
    ],
  },
  stats: {
    title: "Stats",
    body: [
      "Stats placeholder for Phase B.",
      "Rolling retention and reset safeguards land in Phase D.",
      "Scroll support is active to validate richer mouse behavior.",
    ],
  },
};

const CAT_FRAMES = [
  String.raw`   /\_/\
  ( o.o )~
   > ^ <`,
  String.raw`   /\_/\
  ( -.- )~~
   > ^ <`,
  String.raw`   /\_/\
  ( o.o )~~~
   > ^ <`,
  String.raw`   /\_/\
  ( o.o )~~
   > ^ <`,
];

type AppProps = {
  startRoute: RouteName;
  onExit: () => void | Promise<void>;
};

const FOOTER_GROUPS = [
  ["Arrows", "switch page"],
  ["Enter", "open current"],
  ["i/b/m/p/s", "jump"],
  ["t", "theme"],
  ["q", "quit"],
  ["Mouse", "click + scroll"],
] as const;

export function App({ startRoute, onExit }: AppProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState<RouteName>(startRoute);
  const [activeRoute, setActiveRoute] = useState<RouteName>(startRoute);
  const [catFrameIndex, setCatFrameIndex] = useState(0);
  const [catBreath, setCatBreath] = useState(0);

  const themeId = THEME_ORDER[themeIndex] ?? THEME_ORDER[0];
  const theme = THEME_REGISTRY[themeId];

  useEffect(() => {
    const frameLoop = setInterval(() => {
      setCatFrameIndex((index) => (index + 1) % CAT_FRAMES.length);
    }, 360);

    const breathLoop = setInterval(() => {
      setCatBreath((value) => (value === 0 ? 1 : 0));
    }, 1200);

    return () => {
      clearInterval(frameLoop);
      clearInterval(breathLoop);
    };
  }, []);

  const contentLines = useMemo(() => {
    return ROUTE_COPY[activeRoute].body;
  }, [activeRoute]);

  const activateRoute = (route: RouteName) => {
    setSelectedRoute(route);
    setActiveRoute(route);
  };

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") {
      void onExit();
      return;
    }

    if (key.name === "t") {
      setThemeIndex((index) => (index + 1) % THEME_ORDER.length);
      return;
    }

    if (key.name === "up") {
      setSelectedRoute((route: RouteName) => {
        const current = ROUTES.indexOf(route);
        const nextRoute = ROUTES[(current - 1 + ROUTES.length) % ROUTES.length];
        setActiveRoute(nextRoute);
        return nextRoute;
      });
      return;
    }

    if (key.name === "down") {
      setSelectedRoute((route: RouteName) => {
        const current = ROUTES.indexOf(route);
        const nextRoute = ROUTES[(current + 1) % ROUTES.length];
        setActiveRoute(nextRoute);
        return nextRoute;
      });
      return;
    }

    if (key.name === "enter") {
      activateRoute(selectedRoute);
      return;
    }

    const hotkeyRoute = ROUTE_HOTKEYS[key.name];
    if (hotkeyRoute) {
      activateRoute(hotkeyRoute);
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.tokens.background}
    >
      <box
        minHeight={5}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        justifyContent="center"
        backgroundColor={theme.tokens.panel}
        border
        borderColor={theme.tokens.focus}
      >
        <text fg={theme.tokens.accentStrong}>
          <strong>SkillCat</strong>
          <span fg={theme.tokens.textMuted}>  {theme.label}</span>
        </text>
        <text fg={theme.tokens.textMuted}>Theme: {theme.subtitle}</text>
      </box>

      <box flexGrow={1} flexDirection="row" padding={1} gap={1}>
        <box
          width={30}
          border
          borderStyle="rounded"
          borderColor={theme.tokens.focus}
          backgroundColor={theme.tokens.surface}
          padding={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.tokens.accent}>
            <strong>Navigation</strong>
          </text>
          {ROUTES.map((route) => {
            const isSelected = selectedRoute === route;
            const isActive = activeRoute === route;
            return (
              <box
                key={route}
                border
                borderStyle="single"
                borderColor={isSelected ? theme.tokens.focus : theme.tokens.panelAlt}
                backgroundColor={
                  isSelected ? theme.tokens.selectedBg : theme.tokens.panelAlt
                }
                paddingX={1}
                height={3}
                alignItems="center"
                onMouseDown={() => {
                  activateRoute(route);
                }}
              >
                <text fg={isSelected ? theme.tokens.selectedText : theme.tokens.text}>
                  {route.toUpperCase()}
                  {isActive ? "  *" : ""}
                </text>
              </box>
            );
          })}
        </box>

        <box
          flexGrow={1}
          border
          borderStyle="rounded"
          borderColor={theme.tokens.focus}
          backgroundColor={theme.tokens.surface}
          padding={2}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.tokens.accentStrong}>
            <strong>{ROUTE_COPY[activeRoute].title}</strong>
          </text>

          {activeRoute === "home" ? (
            <box
              flexGrow={1}
              justifyContent="center"
              alignItems="center"
              flexDirection="column"
              gap={1}
              backgroundColor={theme.tokens.panelAlt}
              border
              borderStyle="double"
              borderColor={theme.tokens.accent}
              padding={2}
            >
              <text fg={theme.tokens.accentStrong} content={catBreath ? " " : ""} />
              <text fg={theme.tokens.accentStrong} content={CAT_FRAMES[catFrameIndex]} />
              <text fg={theme.tokens.text}>
                <strong>Friendly. Focused. Fast.</strong>
              </text>
              <text fg={theme.tokens.textMuted}>
                Press <span fg={theme.tokens.accentStrong}>Enter</span> on
                <span fg={theme.tokens.accentStrong}> INIT</span> to start your guided flow.
              </text>
              <box
                border
                borderStyle="rounded"
                borderColor={theme.tokens.focus}
                backgroundColor={theme.tokens.accent}
                paddingX={2}
                paddingY={1}
                onMouseDown={() => {
                  activateRoute("init");
                }}
              >
                <text fg={theme.tokens.background}>
                  <strong>Start Guided Init</strong>
                </text>
              </box>
            </box>
          ) : (
            <scrollbox
              focused
              flexGrow={1}
              style={{
                rootOptions: {
                  border: true,
                  borderStyle: "single",
                  borderColor: theme.tokens.panel,
                  backgroundColor: theme.tokens.panelAlt,
                  padding: 1,
                },
                scrollbarOptions: {
                  showArrows: true,
                  trackOptions: {
                    foregroundColor: theme.tokens.accent,
                    backgroundColor: theme.tokens.panel,
                  },
                },
              }}
            >
              <box flexDirection="column" gap={1}>
                {contentLines.map((line, index) => (
                  <text key={`${activeRoute}-${index}`} fg={theme.tokens.textMuted}>
                    {line}
                  </text>
                ))}
                <text fg={theme.tokens.success}>Phase B status: routed and themed.</text>
                <text fg={theme.tokens.warning}>
                  Detailed workflows activate in subsequent phases.
                </text>
              </box>
            </scrollbox>
          )}
        </box>
      </box>

      <box
        minHeight={7}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="flex-start"
        backgroundColor={theme.tokens.panel}
        border
        borderColor={theme.tokens.focus}
      >
        <box flexDirection="row" gap={1} flexWrap="wrap">
          {FOOTER_GROUPS.map(([keyLabel, actionLabel]) => (
            <box
              key={`${keyLabel}-${actionLabel}`}
              border
              borderStyle="rounded"
              borderColor={theme.tokens.focus}
              backgroundColor={theme.tokens.panelAlt}
              paddingX={1}
            >
              <text fg={theme.tokens.textMuted}>
                <span fg={theme.tokens.accentStrong}>
                  <strong>{keyLabel}</strong>
                </span>
                <span>  {actionLabel}</span>
              </text>
            </box>
          ))}
        </box>
      </box>
    </box>
  );
}
