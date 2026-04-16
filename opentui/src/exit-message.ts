type OhMyLogoModule = {
  render: (
    text: string,
    options?: {
      palette?: string;
      direction?: "horizontal" | "vertical" | "diagonal";
      font?: string;
    },
  ) => Promise<string>;
  renderFilled: (
    text: string,
    options?: {
      palette?: string;
      font?:
        | "3d"
        | "block"
        | "chrome"
        | "grid"
        | "huge"
        | "pallet"
        | "shade"
        | "simple"
        | "simple3d"
        | "simpleBlock"
        | "slick"
        | "tiny";
      letterSpacing?: number;
    },
  ) => Promise<void>;
};

const FALLBACK_BANNER = String.raw`
  ____  _  _________    __    ____________
 / __ \/ |/ /  _/ _ \  / /   /  _/ ___/ _ |
/ /_/ /    // // // / / /__ _/ // /__/ __ |
\____/_/|_/___/____/ /____//___/\___/_/ |_|
`;

const FALLBACK_CAT = String.raw`
+------------------------------------------+
|   /\_/\                                  |
|  ( o.o )   Thanks for using SkillCat.    |
|   > ^ <    See you soon, human.          |
+------------------------------------------+
`;

function trimBlock(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

async function renderLogo(
  text: string,
  options: {
    palette: string;
    direction: "horizontal" | "vertical" | "diagonal";
    font: string;
  },
): Promise<string | null> {
  try {
    const module = (await import(
      "oh-my-logo"
    )) as unknown as OhMyLogoModule;
    if (!module?.render) {
      return null;
    }
    return trimBlock(await module.render(text, options));
  } catch {
    return null;
  }
}

async function loadOhMyLogo(): Promise<OhMyLogoModule | null> {
  try {
    return (await import("oh-my-logo")) as unknown as OhMyLogoModule;
  } catch {
    return null;
  }
}

function buildCatCard(logo: string | null): string {
  const logoBlock = logo ? `${logo}\n` : "";
  return trimBlock(`${logoBlock}${FALLBACK_CAT}\n  - Keep your claws sharp and your context light.`);
}

function buildBanner(logo: string | null): string {
  const block = logo ?? trimBlock(FALLBACK_BANNER);
  return trimBlock(`${block}\n\n  SkillCat signs off with warm paws and clean terminals.`);
}

export async function renderBigExitBanner(): Promise<string | null> {
  const module = await loadOhMyLogo();
  if (!module?.renderFilled) {
    return buildBanner(null);
  }

  try {
    await module.renderFilled("SKILLCAT", {
      palette: "sunset",
      font: "block",
      letterSpacing: 1,
    });
    return null;
  } catch {
    return buildBanner(null);
  }
}

export async function buildExitMessage(): Promise<string> {
  const [catCardLogo, bannerLogo] = await Promise.all([
    renderLogo("SKILLCAT", {
      palette: "ocean",
      direction: "horizontal",
      font: "Standard",
    }),
    renderLogo("SKILLCAT", {
      palette: "sunset",
      direction: "horizontal",
      font: "Standard",
    }),
  ]);

  const card = buildCatCard(catCardLogo);
  const banner = buildBanner(bannerLogo);

  return `${card}\n\n${banner}`;
}

export async function buildCatExitCard(): Promise<string> {
  const catCardLogo = await renderLogo("SKILLCAT", {
    palette: "ocean",
    direction: "horizontal",
    font: "Standard",
  });
  return buildCatCard(catCardLogo);
}
