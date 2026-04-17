import fs from "node:fs";
import path from "node:path";

import type { PathProfile } from "./path-profiles";
import { deriveTagsWithOptions } from "./tags";

export type BrowseSkill = {
  name: string;
  description: string;
  path: string;
  tags: string[];
};

export type BrowseCategory = {
  name: string;
  label: string;
  skills: BrowseSkill[];
};

export type BrowseIndex = {
  categories: BrowseCategory[];
  totalSkills: number;
};

function toCategoryLabel(name: string): string {
  return name.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function readSkillDescription(skillFilePath: string): string {
  const content = fs.readFileSync(skillFilePath, "utf-8");
  const line = content
    .split("\n")
    .find((entry) => entry.trim().toLowerCase().startsWith("description:"));

  if (!line) {
    return "No description provided.";
  }

  return line.split(":").slice(1).join(":").trim() || "No description provided.";
}

function buildCategory(profile: PathProfile, categoryName: string): BrowseCategory | null {
  const categoryPath = path.join(profile.vaultDir, categoryName);
  if (!fs.existsSync(categoryPath)) {
    return null;
  }

  const skillEntries = fs.readdirSync(categoryPath, { withFileTypes: true });
  const skills: BrowseSkill[] = [];

  for (const skillEntry of skillEntries) {
    if (!skillEntry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(categoryPath, skillEntry.name);
    const skillFile = path.join(skillPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      continue;
    }

    const description = readSkillDescription(skillFile);
    skills.push({
      name: skillEntry.name,
      description,
      path: skillPath,
      tags: deriveTagsWithOptions(skillEntry.name, description, {
        maxTags: 5,
      }),
    });
  }

  if (skills.length === 0) {
    return null;
  }

  skills.sort((left, right) => left.name.localeCompare(right.name));

  return {
    name: categoryName,
    label: toCategoryLabel(categoryName),
    skills,
  };
}

export function buildBrowseIndex(profiles: PathProfile[]): BrowseIndex {
  const categoryMap = new Map<string, BrowseSkill[]>();
  const seenVaults = new Set<string>();

  for (const profile of profiles) {
    const vaultKey = path.resolve(profile.vaultDir);
    if (seenVaults.has(vaultKey)) {
      continue;
    }
    seenVaults.add(vaultKey);

    if (!fs.existsSync(vaultKey)) {
      continue;
    }

    const categoryEntries = fs.readdirSync(vaultKey, { withFileTypes: true });
    for (const entry of categoryEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const category = buildCategory({ ...profile, vaultDir: vaultKey }, entry.name);
      if (!category) {
        continue;
      }

      if (!categoryMap.has(category.name)) {
        categoryMap.set(category.name, []);
      }
      categoryMap.get(category.name)?.push(...category.skills);
    }
  }

  const categories: BrowseCategory[] = [];
  for (const [name, skills] of categoryMap.entries()) {
    skills.sort((left, right) => left.name.localeCompare(right.name));
    categories.push({
      name,
      label: toCategoryLabel(name),
      skills,
    });
  }

  categories.sort((left, right) => left.name.localeCompare(right.name));
  const totalSkills = categories.reduce((total, category) => total + category.skills.length, 0);

  return {
    categories,
    totalSkills,
  };
}
