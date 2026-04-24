import os from "node:os";
import { deriveTags } from "./tags.js";

export function buildPointerContent(params: {
  categoryName: string;
  categoryTitle: string;
  count: number;
  libraryPath: string;
  skills: { name: string; description: string; path: string; tags: string[] }[];
}): string {
  const homeDir = os.homedir();
  const normalizePath = (p: string) => {
    if (p.startsWith(homeDir)) {
      return "~" + p.slice(homeDir.length);
    }
    return p;
  };

  const sortedSkills = [...params.skills].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.path.localeCompare(b.path);
  });

  const skillsIndex = sortedSkills
    .map((skill) => {
      const tags = skill.tags.length > 0 ? skill.tags : deriveTags(skill.name, skill.description, 10);
      return `- **${skill.name}** [${tags.join(", ")}]: ${normalizePath(skill.path)}\n  *${skill.description}*`;
    })
    .join("\n");

  return `---
name: ${params.categoryName}-category-pointer
description: Triggers when encountering any task related to ${params.categoryName}. This is a pointer to a library of specialized skills.
---

# ${params.categoryTitle} Capability Library

You do not have all ${params.categoryTitle} skills loaded immediately in your background context. Instead, you have access to a local library of ${params.count} highly specialized skills.

## Retrieval Guidance
1. Default to shortlist/index-first behavior: consult \`## Skills Index\` before opening any full skill files.
2. If the user explicitly names a skill, you may read that skill directly.
3. For unnamed requests, use index-first triage to select only the most relevant skills.
4. Canonical non-bash fallback order is \`glob -> grep -> read\`.

## Instructions
1. Browse the hidden library directory for this category: \`${params.libraryPath}\`
2. Locate only the Markdown files relevant to the exact sub-task.
3. Read selected skill file(s) and follow their instructions.
4. Keep context lean and avoid unnecessary full-library reads.

## Available Knowledge
This library contains ${params.count} specialized skills covering ${params.categoryTitle}.

**Hidden Library Path:** \`${params.libraryPath}\`

## Skills Index
${skillsIndex}

*Reminder: consult local library files first and avoid blind external searching.*
`;
}

export function buildGlobalIndexContent(params: {
  totalSkills: number;
  skills: { name: string; path: string; tags: string[] }[];
}): string {
  const homeDir = os.homedir();
  const normalizePath = (p: string) => {
    if (p.startsWith(homeDir)) {
      return "~" + p.slice(homeDir.length);
    }
    return p;
  };

  const sortedSkills = [...params.skills].sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const skillsIndex = sortedSkills
    .map((skill) => {
      const tagsStr = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- **${skill.name}**${tagsStr}: ${normalizePath(skill.path)}`;
    })
    .join("\n");

  return `---
name: skills-index
description: A global semantic index of all hidden skills available. Use this to find the best skill for a task based on tags.
---

# Global Skills Index 🌐

You have access to a massive hidden library of ${params.totalSkills} specialized skills. This index allows you to find the exact skill you need based on semantic tags.

## Instructions
1. Search this index to find skills whose tags best match the user's request.
2. Read the specific Markdown files at the provided absolute paths.
3. Do NOT guess paths. Always use the paths exactly as provided below.

## Index
${skillsIndex}
`;
}
