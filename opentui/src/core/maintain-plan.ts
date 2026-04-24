import fs from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getCategoryForSkill } from "./categorization";
import { getOrComputeIntelligence } from "./intelligence/cache.js";
import { buildPointerContent, buildGlobalIndexContent } from "./pointer-template";
import { readSkillDescription } from "./browse-data";
import { deriveTagsWithOptions } from "./tags";
import type { PathProfile } from "./path-profiles";

export type MaintainConflictAction = "skip" | "overwrite" | "abort";

export type MaintainMoveOperation = {
  id: string;
  profileId: string;
  sourcePath: string;
  destinationPath: string;
  skillName: string;
  fromCategory: string;
  toCategory: string;
};

export type MaintainPointerOperation = {
  profileId: string;
  pointerPath: string;
  categoryName: string;
  categoryTitle: string;
  count: number;
  libraryPath: string;
  skills: { name: string; description: string; path: string; tags: string[] }[];
};

export type MaintainConflict = {
  id: string;
  kind: "destination-exists";
  operationId: string;
  destinationPath: string;
};

export type MaintainPlan = {
  createdAt: number;
  profiles: PathProfile[];
  actions: {
    recategorize: boolean;
    regeneratePointers: boolean;
  };
  moveOperations: MaintainMoveOperation[];
  pointerOperations: MaintainPointerOperation[];
  conflicts: MaintainConflict[];
};

export type BuildMaintainPlanOptions = {
  profiles: PathProfile[];
  actions: {
    recategorize: boolean;
    regeneratePointers: boolean;
  };
};

export type ApplyMaintainPlanOptions = {
  batchConflictAction: MaintainConflictAction;
};

export type ApplyMaintainPlanResult = {
  status: "applied" | "aborted";
  movedCount: number;
  pointerCount: number;
  skippedCount: number;
};

type CategoryIndex = Map<string, Set<string>>;

function collectVaultSkills(profile: PathProfile):
  | {
      category: string;
      skillName: string;
      skillPath: string;
      hasSkillFile: boolean;
    }[]
  | [] {
  if (!fs.existsSync(profile.vaultDir)) {
    return [];
  }

  const result: {
    category: string;
    skillName: string;
    skillPath: string;
    hasSkillFile: boolean;
  }[] = [];
  const categoryEntries = fs.readdirSync(profile.vaultDir, { withFileTypes: true });

  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }

    const category = categoryEntry.name;
    const categoryPath = path.join(profile.vaultDir, category);
    const skillEntries = fs.readdirSync(categoryPath, { withFileTypes: true });

    for (const skillEntry of skillEntries) {
      if (!skillEntry.isDirectory()) {
        continue;
      }

      const skillName = skillEntry.name;
      const skillPath = path.join(categoryPath, skillName);
      const hasSkillFile = fs.existsSync(path.join(skillPath, "SKILL.md"));

      result.push({
        category,
        skillName,
        skillPath,
        hasSkillFile,
      });
    }
  }

  return result;
}

function buildCategoryIndexForProfile(
  profile: PathProfile,
  moveOperations: MaintainMoveOperation[],
): CategoryIndex {
  const index: CategoryIndex = new Map();

  const entries = collectVaultSkills(profile);
  for (const entry of entries) {
    if (!entry.hasSkillFile) {
      continue;
    }
    if (!index.has(entry.category)) {
      index.set(entry.category, new Set());
    }
    index.get(entry.category)?.add(entry.skillName);
  }

  for (const move of moveOperations) {
    if (move.profileId !== profile.id) {
      continue;
    }
    if (!index.has(move.fromCategory)) {
      index.set(move.fromCategory, new Set());
    }
    if (!index.has(move.toCategory)) {
      index.set(move.toCategory, new Set());
    }
    index.get(move.fromCategory)?.delete(move.skillName);
    index.get(move.toCategory)?.add(move.skillName);
  }

  return index;
}

async function buildPointerOperations(
  profiles: PathProfile[],
  moveOperations: MaintainMoveOperation[],
): Promise<MaintainPointerOperation[]> {
  const pointerOperations: MaintainPointerOperation[] = [];

  for (const profile of profiles) {
    const categoryIndex = buildCategoryIndexForProfile(profile, moveOperations);
    for (const [categoryName, skills] of categoryIndex.entries()) {
      if (skills.size === 0) {
        continue;
      }

      const skillsList = await Promise.all(Array.from<string>(skills).map(async skillName => {
        const skillPath = path.join(profile.vaultDir, categoryName, skillName);
        const skillFile = path.join(skillPath, "SKILL.md");
        const hasFile = await access(skillFile).then(() => true).catch(() => false);
        const description = hasFile ? readSkillDescription(skillFile) : "No description provided.";
        const content = hasFile ? await readFile(skillFile, "utf-8") : "";
        
        const meta = await getOrComputeIntelligence(profile.vaultDir, skillName, description, content);
        const tags = meta.tags;
        return { name: skillName, description, path: skillPath, tags };
      }));

      pointerOperations.push({
        profileId: profile.id,
        pointerPath: path.join(
          profile.activeDir,
          `${categoryName}-category-pointer`,
          "SKILL.md",
        ),
        categoryName,
        categoryTitle: categoryName.replace(/-/g, " ").replace(/\b\w/g, (match) =>
          match.toUpperCase(),
        ),
        count: skills.size,
        libraryPath: path.join(profile.vaultDir, categoryName),
        skills: skillsList,
      });
    }
  }

  pointerOperations.sort((left, right) => left.pointerPath.localeCompare(right.pointerPath));
  return pointerOperations;
}

function buildRecategorizeOperations(
  profiles: PathProfile[],
): {
  moveOperations: MaintainMoveOperation[];
  conflicts: MaintainConflict[];
} {
  const moveOperations: MaintainMoveOperation[] = [];
  const conflicts: MaintainConflict[] = [];
  const visitedVaults = new Set<string>();

  for (const profile of profiles) {
    const vaultKey = path.resolve(profile.vaultDir);
    if (visitedVaults.has(vaultKey)) {
      continue;
    }
    visitedVaults.add(vaultKey);

    const entries = collectVaultSkills(profile);
    for (const entry of entries) {
      if (!entry.hasSkillFile) {
        continue;
      }

      const targetCategory = getCategoryForSkill(entry.skillName);
      if (entry.category === targetCategory) {
        continue;
      }

      const destinationPath = path.join(profile.vaultDir, targetCategory, entry.skillName);
      const operationId = `recategorize:${entry.skillPath}`;
      moveOperations.push({
        id: operationId,
        profileId: profile.id,
        sourcePath: entry.skillPath,
        destinationPath,
        skillName: entry.skillName,
        fromCategory: entry.category,
        toCategory: targetCategory,
      });

      if (fs.existsSync(destinationPath)) {
        conflicts.push({
          id: `destination:${destinationPath}`,
          kind: "destination-exists",
          operationId,
          destinationPath,
        });
      }
    }
  }

  return {
    moveOperations,
    conflicts,
  };
}

export async function buildMaintainPlan(options: BuildMaintainPlanOptions): Promise<MaintainPlan> {
  const { profiles, actions } = options;

  let moveOperations: MaintainMoveOperation[] = [];
  let conflicts: MaintainConflict[] = [];

  if (actions.recategorize) {
    const recategorize = buildRecategorizeOperations(profiles);
    moveOperations = recategorize.moveOperations;
    conflicts = recategorize.conflicts;
  }

  const pointerOperations = actions.regeneratePointers
    ? await buildPointerOperations(profiles, moveOperations)
    : [];

  return {
    createdAt: Date.now(),
    profiles,
    actions,
    moveOperations,
    pointerOperations,
    conflicts,
  };
}

function shouldSkipMove(
  operation: MaintainMoveOperation,
  conflicts: MaintainConflict[],
  conflictAction: MaintainConflictAction,
): boolean {
  const destinationConflict = conflicts.find((item) => item.operationId === operation.id);
  if (!destinationConflict) {
    return false;
  }

  if (conflictAction === "abort") {
    throw new Error(`Apply aborted by conflict policy for ${operation.destinationPath}`);
  }
  if (conflictAction === "skip") {
    return true;
  }

  if (fs.existsSync(operation.destinationPath)) {
    fs.rmSync(operation.destinationPath, { recursive: true, force: true });
  }
  return false;
}

function applyPointers(pointerOperations: MaintainPointerOperation[]): number {
  let pointerCount = 0;
  
  const skillsByActiveDir = new Map<string, { totalSkills: number; skills: { name: string; path: string; tags: string[] }[] }>();

  for (const pointer of pointerOperations) {
    fs.mkdirSync(path.dirname(pointer.pointerPath), { recursive: true });
    const content = buildPointerContent({
      categoryName: pointer.categoryName,
      categoryTitle: pointer.categoryTitle,
      count: pointer.count,
      libraryPath: pointer.libraryPath,
      skills: pointer.skills,
    });
    fs.writeFileSync(pointer.pointerPath, content, "utf-8");
    pointerCount += 1;
    
    const activeDir = path.dirname(path.dirname(pointer.pointerPath));
    
    if (!skillsByActiveDir.has(activeDir)) {
      skillsByActiveDir.set(activeDir, { totalSkills: 0, skills: [] });
    }
    const dirData = skillsByActiveDir.get(activeDir)!;
    dirData.totalSkills += pointer.count;
    dirData.skills.push(...pointer.skills);
  }

  for (const [activeDir, data] of skillsByActiveDir.entries()) {
    const globalIndexPath = path.join(activeDir, "skills-index", "SKILL.md");
    if (data.totalSkills > 0) {
      fs.mkdirSync(path.dirname(globalIndexPath), { recursive: true });
      const content = buildGlobalIndexContent({
        totalSkills: data.totalSkills,
        skills: data.skills,
      });
      fs.writeFileSync(globalIndexPath, content, "utf-8");
      pointerCount += 1;
    } else if (fs.existsSync(globalIndexPath)) {
      fs.rmSync(path.join(activeDir, "skills-index"), { recursive: true, force: true });
    }
  }

  return pointerCount;
}

function cleanupStalePointers(
  profiles: PathProfile[],
  pointerOperations: MaintainPointerOperation[],
): void {
  const desiredByProfile = new Map<string, Set<string>>();

  for (const operation of pointerOperations) {
    if (!desiredByProfile.has(operation.profileId)) {
      desiredByProfile.set(operation.profileId, new Set());
    }
    desiredByProfile
      .get(operation.profileId)
      ?.add(path.basename(path.dirname(operation.pointerPath)));
  }

  for (const profile of profiles) {
    if (!fs.existsSync(profile.activeDir)) {
      continue;
    }

    const desired = desiredByProfile.get(profile.id) ?? new Set<string>();
    const entries = fs.readdirSync(profile.activeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith("-category-pointer")) {
        continue;
      }

      if (desired.has(entry.name)) {
        continue;
      }

      fs.rmSync(path.join(profile.activeDir, entry.name), { recursive: true, force: true });
    }
  }
}

export async function applyMaintainPlan(
  plan: MaintainPlan,
  options: ApplyMaintainPlanOptions,
): Promise<ApplyMaintainPlanResult> {
  if (options.batchConflictAction === "abort" && plan.conflicts.length > 0) {
    return {
      status: "aborted",
      movedCount: 0,
      pointerCount: 0,
      skippedCount: 0,
    };
  }

  let movedCount = 0;
  let skippedCount = 0;

  for (const move of plan.moveOperations) {
    const skip = shouldSkipMove(move, plan.conflicts, options.batchConflictAction);
    if (skip) {
      skippedCount += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(move.destinationPath), { recursive: true });
    try {
      fs.renameSync(move.sourcePath, move.destinationPath);
    } catch (err: any) {
      if (err.code === "EXDEV") {
        fs.cpSync(move.sourcePath, move.destinationPath, { recursive: true });
        fs.rmSync(move.sourcePath, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
    movedCount += 1;
  }

  const updatedPointerOperations = plan.actions.regeneratePointers
    ? await buildPointerOperations(plan.profiles, [])
    : [];
  cleanupStalePointers(plan.profiles, updatedPointerOperations);
  const pointerCount = applyPointers(updatedPointerOperations);

  return {
    status: "applied",
    movedCount,
    pointerCount,
    skippedCount,
  };
}
