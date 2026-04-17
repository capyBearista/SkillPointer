import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROFILE_IDS = ["agents", "opencode", "claude", "sandbox"] as const;

export type PathProfileId = (typeof PROFILE_IDS)[number];

export type PathProfile = {
  id: PathProfileId;
  label: string;
  activeDir: string;
  vaultDir: string;
};

export type PathSelectionState = Record<PathProfileId, boolean>;

type BuildOptions = {
  homeDir?: string;
  workspaceRoot?: string;
  includeSandbox?: boolean;
};

function resolveHome(homeDir?: string): string {
  return homeDir ?? os.homedir();
}

export function buildKnownPathProfiles(options: BuildOptions = {}): PathProfile[] {
  const homeDir = resolveHome(options.homeDir);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const includeSandbox = options.includeSandbox ?? true;

  const profiles: PathProfile[] = [
    {
      id: "agents",
      label: "Agents",
      activeDir: path.join(homeDir, ".agents", "skills"),
      vaultDir: path.join(homeDir, ".skillcat-vault"),
    },
    {
      id: "opencode",
      label: "OpenCode",
      activeDir: path.join(homeDir, ".config", "opencode", "skills"),
      vaultDir: path.join(homeDir, ".opencode-skill-libraries"),
    },
    {
      id: "claude",
      label: "Claude Code",
      activeDir: path.join(homeDir, ".claude", "skills"),
      vaultDir: path.join(homeDir, ".skillcat-vault"),
    },
  ];

  if (includeSandbox) {
    profiles.push({
      id: "sandbox",
      label: "Local Sandbox",
      activeDir: path.join(workspaceRoot, ".skill-test", "skills"),
      vaultDir: path.join(workspaceRoot, ".skill-test-vault"),
    });
  }

  return profiles;
}

export function detectPathProfiles(options: BuildOptions = {}): PathProfile[] {
  return buildKnownPathProfiles(options).filter((profile) => fs.existsSync(profile.activeDir));
}

export function createInitialPathSelection(profiles: PathProfile[]): PathSelectionState {
  const selection: PathSelectionState = {
    agents: false,
    opencode: false,
    claude: false,
    sandbox: false,
  };

  for (const profile of profiles) {
    selection[profile.id] = false;
  }

  return selection;
}

export function getSelectedProfiles(
  profiles: PathProfile[],
  selection: PathSelectionState,
): PathProfile[] {
  return profiles.filter((profile) => selection[profile.id]);
}

export function toggleProfileSelection(
  selection: PathSelectionState,
  profileId: PathProfileId,
): PathSelectionState {
  return {
    ...selection,
    [profileId]: !selection[profileId],
  };
}
