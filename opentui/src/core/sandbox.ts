import fs from "node:fs";
import path from "node:path";

type SandboxSetupResult = {
  created: boolean;
  skillCount: number;
  skillsDir: string;
  snapshotDir: string;
  vaultDir: string;
};

const SAMPLE_SKILLS: Array<{ name: string; description: string; bodyTitle: string }> = [
  {
    name: "react-form-optimizer",
    description: "Optimize React form rendering and validation patterns.",
    bodyTitle: "React Form Optimizer",
  },
  {
    name: "oauth-token-guardian",
    description: "Audit OAuth token handling and refresh token safety.",
    bodyTitle: "OAuth Token Guardian",
  },
  {
    name: "playwright-e2e-driver",
    description: "Build resilient Playwright end-to-end testing flows.",
    bodyTitle: "Playwright E2E Driver",
  },
  {
    name: "node-api-hardener",
    description: "Harden Node API endpoints for auth and rate limiting.",
    bodyTitle: "Node API Hardener",
  },
  {
    name: "terraform-release-pipeline",
    description: "Provision deployment infrastructure with Terraform pipelines.",
    bodyTitle: "Terraform Release Pipeline",
  },
  {
    name: "postgres-query-profiler",
    description: "Profile and optimize PostgreSQL query performance.",
    bodyTitle: "Postgres Query Profiler",
  },
  {
    name: "tui-design-polish",
    description: "Improve TUI interaction polish and keyboard-first ergonomics.",
    bodyTitle: "TUI Design Polish",
  },
  {
    name: "typescript-refactor-guide",
    description: "Drive safe TypeScript refactors with strict typing patterns.",
    bodyTitle: "TypeScript Refactor Guide",
  },
];

function copyDirectoryRecursive(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath);
      continue;
    }
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

export function getSandboxPaths(workspaceRoot = process.cwd()): {
  rootDir: string;
  skillsDir: string;
  snapshotDir: string;
  vaultDir: string;
} {
  const rootDir = path.join(workspaceRoot, ".test");
  return {
    rootDir,
    skillsDir: path.join(rootDir, "skills"),
    snapshotDir: path.join(rootDir, ".snapshot"),
    vaultDir: path.join(workspaceRoot, ".test-vault"),
  };
}

function writeSampleSkill(skillsDir: string, name: string, description: string, title: string): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${title}\n\nUse this skill when tasks match this capability.\n`,
    "utf8",
  );
}

export function ensureSandboxEnvironment(workspaceRoot = process.cwd()): SandboxSetupResult {
  const paths = getSandboxPaths(workspaceRoot);
  let created = false;

  if (!fs.existsSync(paths.skillsDir) || fs.readdirSync(paths.skillsDir).length === 0) {
    fs.mkdirSync(paths.skillsDir, { recursive: true });
    for (const skill of SAMPLE_SKILLS) {
      writeSampleSkill(paths.skillsDir, skill.name, skill.description, skill.bodyTitle);
    }
    created = true;
  }

  if (!fs.existsSync(paths.snapshotDir) || fs.readdirSync(paths.snapshotDir).length === 0) {
    fs.mkdirSync(paths.snapshotDir, { recursive: true });
    for (const skill of SAMPLE_SKILLS) {
      writeSampleSkill(paths.snapshotDir, skill.name, skill.description, skill.bodyTitle);
    }
    created = true;
  }

  if (!fs.existsSync(paths.vaultDir)) {
    fs.mkdirSync(paths.vaultDir, { recursive: true });
    created = true;
  }

  const skillCount = fs.existsSync(paths.skillsDir)
    ? fs.readdirSync(paths.skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        .length
    : 0;

  return {
    created,
    skillCount,
    skillsDir: paths.skillsDir,
    snapshotDir: paths.snapshotDir,
    vaultDir: paths.vaultDir,
  };
}

export function resetSandboxEnvironment(workspaceRoot = process.cwd()): {
  restoredSkillCount: number;
  skillsDir: string;
  vaultDir: string;
} {
  const paths = getSandboxPaths(workspaceRoot);

  fs.rmSync(paths.skillsDir, { recursive: true, force: true });
  fs.mkdirSync(paths.skillsDir, { recursive: true });
  if (fs.existsSync(paths.snapshotDir)) {
    copyDirectoryRecursive(paths.snapshotDir, paths.skillsDir);
  }

  fs.rmSync(paths.vaultDir, { recursive: true, force: true });
  fs.mkdirSync(paths.vaultDir, { recursive: true });

  const restoredSkillCount = fs.existsSync(paths.skillsDir)
    ? fs.readdirSync(paths.skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        .length
    : 0;

  return {
    restoredSkillCount,
    skillsDir: paths.skillsDir,
    vaultDir: paths.vaultDir,
  };
}
