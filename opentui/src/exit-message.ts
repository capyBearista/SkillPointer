import { getRandomCatSignoff, ROYAL_BLUE_HEX, SKILLCAT_FILLED_STYLE } from "./core/exit-signoff";

type OhMyLogoModule = {
  renderFilled: (
    text: string,
    options?: {
      palette?: string | readonly string[];
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

async function loadOhMyLogo(): Promise<OhMyLogoModule | null> {
  try {
    return (await import("oh-my-logo")) as unknown as OhMyLogoModule;
  } catch {
    return null;
  }
}

function colorRoyalBlue(value: string): string {
  return `\u001b[38;2;65;105;225m${value}\u001b[0m`;
}

export async function renderBigExitBanner(): Promise<string> {
  const module = await loadOhMyLogo();
  const randomSignoff = getRandomCatSignoff();

  if (module?.renderFilled) {
    try {
      await module.renderFilled("SKILLCAT", {
        font: SKILLCAT_FILLED_STYLE.font,
        letterSpacing: SKILLCAT_FILLED_STYLE.letterSpacing,
        palette: SKILLCAT_FILLED_STYLE.palette,
      });
      return colorRoyalBlue(`  ${randomSignoff}`);
    } catch {
      return colorRoyalBlue(`SKILLCAT\n\n  ${randomSignoff}`);
    }
  }

  return colorRoyalBlue(`SKILLCAT\n\n  ${randomSignoff}`);
}
