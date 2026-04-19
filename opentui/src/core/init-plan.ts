import fs from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getCategoryForSkill } from "./categorization";
import { getOrComputeIntelligence } from "./intelligence/cache.js";
import { buildPointerContent } from "./pointer-template";
import { readSkillDescription } from "./browse-data";
import { deriveTagsWithOptions } from "./tags";
import type { PathProfile } from "./path-profiles";

export type PlanConflictAction = "skip" | "overwrite" | "abort";

export type PlannedMoveOperation = {
  id: string;
  sourceProfileId: string;
  sourcePath: string;
  destinationPath: string;
  category: string;
  skillName: string;
};

export type PlannedPointerOperation = {
  profileId: string;
  activeDir: string;
  pointerName: string;
  pointerPath: string;
  categoryName: string;
  categoryTitle: string;
  count: number;
  libraryPath: string;
  skills: { name: string; description: string; path: string; tags: string[] }[];
};

export type DuplicateDestinationConflict = {
  id: string;
  kind: "duplicate-destination";
  destinationPath: string;
  contenders: string[];
  resolvedSourcePath?: string;
};

export type DestinationExistsConflict = {
  id: string;
  kind: "destination-exists";
  destinationPath: string;
  operationId: string;
};

export type InitPlanConflict = DuplicateDestinationConflict | DestinationExistsConflict;

export type InitPlanSummary = {
  sourceProfiles: number;
  selectedSkillFolders: number;
  movesPlanned: number;
  pointersPlanned: number;
  conflicts: number;
};

export type InitPlan = {
  createdAt: number;
  profiles: PathProfile[];
  moveOperations: PlannedMoveOperation[];
  pointerOperations: PlannedPointerOperation[];
  conflicts: InitPlanConflict[];
  summary: InitPlanSummary;
};

export type BuildInitPlanOptions = {
  profiles: PathProfile[];
};

export type ApplyInitPlanOptions = {
  batchConflictAction: PlanConflictAction;
};

export type ApplyInitPlanResult = {
  status: "applied" | "aborted";
  movedCount: number;
  pointerCount: number;
  skippedCount: number;
};

type SkillFolder = {
  profile: PathProfile;
  sourcePath: string;
  skillName: string;
  category: string;
  destinationPath: string;
};

function listEligibleSkills(profile: PathProfile): SkillFolder[] {
  if (!fs.existsSync(profile.activeDir)) {
    return [];
  }

  const entries = fs.readdirSync(profile.activeDir, { withFileTypes: true });
  const eligible: SkillFolder[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name.endsWith("-category-pointer")) {
      continue;
    }

    const sourcePath = path.join(profile.activeDir, entry.name);
    const nested = fs.readdirSync(sourcePath, { withFileTypes: true });
    if (nested.length === 0) {
      continue;
    }

    const category = getCategoryForSkill(entry.name);
    const destinationPath = path.join(profile.vaultDir, category, entry.name);
    eligible.push({
      profile,
      sourcePath,
      skillName: entry.name,
      category,
      destinationPath,
    });
  }

  return eligible;
}

type SkillCategoryIndex = Map<string, Set<string>>;

function readCurrentVaultIndex(profile: PathProfile): SkillCategoryIndex {
  const index: SkillCategoryIndex = new Map();

  if (!fs.existsSync(profile.vaultDir)) {
    return index;
  }

  const categoryEntries = fs.readdirSync(profile.vaultDir, { withFileTypes: true });
  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) {
      continue;
    }

    const categoryName = categoryEntry.name;
    const categoryPath = path.join(profile.vaultDir, categoryName);
    const skillEntries = fs.readdirSync(categoryPath, { withFileTypes: true });

    for (const skillEntry of skillEntries) {
      if (!skillEntry.isDirectory()) {
        continue;
      }

      const skillRoot = path.join(categoryPath, skillEntry.name);
      const hasSkillFile = fs.existsSync(path.join(skillRoot, "SKILL.md"));
      if (!hasSkillFile) {
        continue;
      }

      if (!index.has(categoryName)) {
        index.set(categoryName, new Set());
      }
      index.get(categoryName)?.add(skillEntry.name);
    }
  }

  return index;
}

async function gatherPointerOperations(
  profiles: PathProfile[],
  moveOperations: PlannedMoveOperation[],
): Promise<PlannedPointerOperation[]> {
  const operations: PlannedPointerOperation[] = [];
  const profileById = new Map<string, PathProfile>();

  for (const profile of profiles) {
    profileById.set(profile.id, profile);
  }

  for (const profile of profiles) {
    const profileVault = path.resolve(profile.vaultDir);
    const categoryIndex = readCurrentVaultIndex(profile);

    for (const operation of moveOperations) {
      const destination = path.resolve(operation.destinationPath);
      const relative = path.relative(profileVault, destination);
      const sameVault =
        relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

      if (!sameVault) {
        continue;
      }

      if (!categoryIndex.has(operation.category)) {
        categoryIndex.set(operation.category, new Set());
      }
      categoryIndex.get(operation.category)?.add(operation.skillName);
    }

    for (const [categoryName, skillNames] of categoryIndex.entries()) {
      const profileForCategory = profileById.get(profile.id);
      if (!profileForCategory) {
        continue;
      }

      const pointerName = `${categoryName}-category-pointer`;
      const skillsList = await Promise.all(Array.from(skillNames).map(async skillName => {
        const skillPath = path.join(profileVault, categoryName, skillName);
        const skillFile = path.join(skillPath, "SKILL.md");
        const hasFile = await access(skillFile).then(() => true).catch(() => false);
        const description = hasFile ? readSkillDescription(skillFile) : "No description provided.";
        const content = hasFile ? await readFile(skillFile, "utf-8") : "";
        
        const meta = await getOrComputeIntelligence(profile.vaultDir, skillName, description, content);
        const tags = meta.tags;
        return { name: skillName, description, path: skillPath, tags };
      }));

      operations.push({
        profileId: profile.id,
        activeDir: profileForCategory.activeDir,
        pointerName,
        pointerPath: path.join(profileForCategory.activeDir, pointerName, "SKILL.md"),
        categoryName,
        categoryTitle: categoryName.replace(/-/g, " ").replace(/\b\w/g, (match) =>
          match.toUpperCase(),
        ),
        count: skillNames.size,
        libraryPath: path.join(profileForCategory.vaultDir, categoryName),
        skills: skillsList,
      });
    }
  }

  operations.sort((left, right) => {
    if (left.profileId !== right.profileId) {
      return left.profileId.localeCompare(right.profileId);
    }
    return left.categoryName.localeCompare(right.categoryName);
  });

  return operations;
}

export async function buildInitPlan(options: BuildInitPlanOptions): Promise<InitPlan> {
  const rawSkills: SkillFolder[] = [];
  for (const profile of options.profiles) {
    rawSkills.push(...listEligibleSkills(profile));
  }

  const destinationMap = new Map<string, SkillFolder[]>();
  for (const skill of rawSkills) {
    if (!destinationMap.has(skill.destinationPath)) {
      destinationMap.set(skill.destinationPath, []);
    }
    destinationMap.get(skill.destinationPath)?.push(skill);
  }

  const moveOperations: PlannedMoveOperation[] = [];
  const conflicts: InitPlanConflict[] = [];

  for (const [destinationPath, contenders] of destinationMap.entries()) {
    if (contenders.length > 1) {
      conflicts.push({
        id: `duplicate:${destinationPath}`,
        kind: "duplicate-destination",
        destinationPath,
        contenders: contenders.map((entry) => entry.sourcePath),
      });
      continue;
    }

    const selected = contenders[0];
    if (!selected) {
      continue;
    }

    const operationId = `move:${selected.sourcePath}`;
    moveOperations.push({
      id: operationId,
      sourceProfileId: selected.profile.id,
      sourcePath: selected.sourcePath,
      destinationPath: selected.destinationPath,
      category: selected.category,
      skillName: selected.skillName,
    });

    if (fs.existsSync(selected.destinationPath)) {
      conflicts.push({
        id: `destination:${selected.destinationPath}`,
        kind: "destination-exists",
        destinationPath: selected.destinationPath,
        operationId,
      });
    }
  }

  const pointerOperations = await gatherPointerOperations(options.profiles, moveOperations);

  const summary: InitPlanSummary = {
    sourceProfiles: options.profiles.length,
    selectedSkillFolders: rawSkills.length,
    movesPlanned: moveOperations.length,
    pointersPlanned: pointerOperations.length,
    conflicts: conflicts.length,
  };

  return {
    createdAt: Date.now(),
    profiles: options.profiles,
    moveOperations,
    pointerOperations,
    conflicts,
    summary,
  };
}

function moveForSource(
  sourcePath: string,
  sourceProfileId: string,
  destinationPath: string,
): PlannedMoveOperation {
  const skillName = path.basename(sourcePath);
  const category = getCategoryForSkill(skillName);
  return {
    id: `move:${sourcePath}`,
    sourceProfileId,
    sourcePath,
    destinationPath,
    category,
    skillName,
  };
}

export async function resolveDuplicateConflict(
  plan: InitPlan,
  conflictId: string,
  selectedSourcePath: string,
): Promise<InitPlan> {
  const conflict = plan.conflicts.find(
    (candidate): candidate is DuplicateDestinationConflict =>
      candidate.kind === "duplicate-destination" && candidate.id === conflictId,
  );

  if (!conflict) {
    throw new Error(`Duplicate conflict not found: ${conflictId}`);
  }

  if (!conflict.contenders.includes(selectedSourcePath)) {
    throw new Error("Selected source is not part of this conflict");
  }

  const sourceProfile = plan.profiles.find((profile) =>
    selectedSourcePath.startsWith(path.resolve(profile.activeDir)),
  );
  if (!sourceProfile) {
    throw new Error("Unable to map selected source to profile");
  }

  const mergedOperations = [
    ...plan.moveOperations,
    moveForSource(selectedSourcePath, sourceProfile.id, conflict.destinationPath),
  ];

  const mergedConflicts = plan.conflicts.map((entry) => {
    if (entry.id !== conflictId || entry.kind !== "duplicate-destination") {
      return entry;
    }
    return {
      ...entry,
      resolvedSourcePath: selectedSourcePath,
    };
  });

  const operationId = `move:${selectedSourcePath}`;
  if (
    fs.existsSync(conflict.destinationPath) &&
    !mergedConflicts.some(
      (entry) => entry.kind === "destination-exists" && entry.operationId === operationId,
    )
  ) {
    mergedConflicts.push({
      id: `destination:${conflict.destinationPath}`,
      kind: "destination-exists",
      destinationPath: conflict.destinationPath,
      operationId,
    });
  }

  const pointerOperations = await gatherPointerOperations(plan.profiles, mergedOperations);

  return {
    ...plan,
    moveOperations: mergedOperations,
    pointerOperations,
    conflicts: mergedConflicts,
    summary: {
      ...plan.summary,
      movesPlanned: mergedOperations.length,
      pointersPlanned: pointerOperations.length,
      conflicts: mergedConflicts.length,
    },
  };
}

function assertNoUnresolvedDuplicates(plan: InitPlan): void {
  const unresolved = plan.conflicts.find(
    (conflict) =>
      conflict.kind === "duplicate-destination" && !conflict.resolvedSourcePath,
  );
  if (unresolved) {
    throw new Error("Cannot apply plan with unresolved duplicate conflicts");
  }
}

function shouldSkipMove(
  operation: PlannedMoveOperation,
  conflicts: InitPlanConflict[],
  batchConflictAction: PlanConflictAction,
): boolean {
  const conflict = conflicts.find(
    (item): item is DestinationExistsConflict =>
      item.kind === "destination-exists" && item.operationId === operation.id,
  );

  if (!conflict) {
    return false;
  }

  if (batchConflictAction === "abort") {
    throw new Error(`Apply aborted by conflict policy for ${operation.destinationPath}`);
  }

  if (batchConflictAction === "skip") {
    return true;
  }

  if (fs.existsSync(operation.destinationPath)) {
    fs.rmSync(operation.destinationPath, { recursive: true, force: true });
  }

  return false;
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function cleanupStalePointers(
  profiles: PathProfile[],
  pointerOperations: PlannedPointerOperation[],
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

    const desiredPointers = desiredByProfile.get(profile.id) ?? new Set<string>();
    const entries = fs.readdirSync(profile.activeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith("-category-pointer")) {
        continue;
      }

      if (desiredPointers.has(entry.name)) {
        continue;
      }

      fs.rmSync(path.join(profile.activeDir, entry.name), { recursive: true, force: true });
    }
  }
}

function applyPointers(pointerOperations: PlannedPointerOperation[]): number {
  let pointerCount = 0;

  for (const pointer of pointerOperations) {
    ensureParentDir(pointer.pointerPath);
    const content = buildPointerContent({
      categoryName: pointer.categoryName,
      categoryTitle: pointer.categoryTitle,
      count: pointer.count,
      libraryPath: pointer.libraryPath,
      skills: pointer.skills,
    });
    fs.writeFileSync(pointer.pointerPath, content, "utf-8");
    pointerCount += 1;
  }

  return pointerCount;
}

export async function applyInitPlan(
  plan: InitPlan,
  options: ApplyInitPlanOptions,
): Promise<ApplyInitPlanResult> {
  assertNoUnresolvedDuplicates(plan);

  if (options.batchConflictAction === "abort") {
    const hasDestinationConflict = plan.moveOperations.some((operation) =>
      plan.conflicts.some(
        (conflict) =>
          conflict.kind === "destination-exists" && conflict.operationId === operation.id,
      ),
    );

    if (hasDestinationConflict) {
      return {
        status: "aborted",
        movedCount: 0,
        pointerCount: 0,
        skippedCount: 0,
      };
    }
  }

  let movedCount = 0;
  let skippedCount = 0;

  for (const operation of plan.moveOperations) {
    const skipMove = shouldSkipMove(
      operation,
      plan.conflicts,
      options.batchConflictAction,
    );
    if (skipMove) {
      skippedCount += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(operation.destinationPath), { recursive: true });
    try {
      fs.renameSync(operation.sourcePath, operation.destinationPath);
    } catch (err: any) {
      if (err.code === "EXDEV") {
        fs.cpSync(operation.sourcePath, operation.destinationPath, { recursive: true });
        fs.rmSync(operation.sourcePath, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
    movedCount += 1;
  }

  const finalPointerOperations = await gatherPointerOperations(plan.profiles, []);
  cleanupStalePointers(plan.profiles, finalPointerOperations);
  const pointerCount = applyPointers(finalPointerOperations);

  return {
    status: "applied",
    movedCount,
    pointerCount,
    skippedCount,
  };
}
