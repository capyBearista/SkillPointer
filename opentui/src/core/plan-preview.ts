import type { InitPlan } from "./init-plan";
import type { MaintainPlan } from "./maintain-plan";

function sortByCategoryAndSkill<T extends { category?: string; skillName?: string }>(
  items: T[],
): T[] {
  return [...items].sort((left, right) => {
    const leftCategory = left.category ?? "";
    const rightCategory = right.category ?? "";
    if (leftCategory !== rightCategory) {
      return leftCategory.localeCompare(rightCategory);
    }

    const leftSkill = left.skillName ?? "";
    const rightSkill = right.skillName ?? "";
    return leftSkill.localeCompare(rightSkill);
  });
}

export function buildInitPreviewLines(plan: InitPlan): string[] {
  const lines: string[] = [];
  const moves = sortByCategoryAndSkill(plan.moveOperations);

  lines.push("Exact planned skill moves:");
  if (moves.length === 0) {
    lines.push("  - No skill moves planned.");
  } else {
    for (const move of moves) {
      lines.push(`  - [${move.category}] ${move.skillName}`);
    }
  }

  const pointers = [...plan.pointerOperations].sort((left, right) => {
    if (left.categoryName !== right.categoryName) {
      return left.categoryName.localeCompare(right.categoryName);
    }
    return left.profileId.localeCompare(right.profileId);
  });

  lines.push("Exact pointer categories to regenerate:");
  if (pointers.length === 0) {
    lines.push("  - No pointer updates planned.");
  } else {
    for (const pointer of pointers) {
      lines.push(`  - [${pointer.categoryName}] ${pointer.count} skill(s)`);
    }
  }

  const destinationConflicts = plan.conflicts.filter(
    (conflict) => conflict.kind === "destination-exists",
  );
  if (destinationConflicts.length > 0) {
    lines.push("Potential destination conflicts (policy-dependent outcome):");
    for (const conflict of destinationConflicts) {
      lines.push(`  - ${conflict.destinationPath}`);
    }
  }

  return lines;
}

export function buildMaintainPreviewLines(plan: MaintainPlan): string[] {
  const lines: string[] = [];
  const moves = [...plan.moveOperations].sort((left, right) => {
    if (left.toCategory !== right.toCategory) {
      return left.toCategory.localeCompare(right.toCategory);
    }
    return left.skillName.localeCompare(right.skillName);
  });

  lines.push("Exact planned recategorize moves:");
  if (moves.length === 0) {
    lines.push("  - No recategorize moves planned.");
  } else {
    for (const move of moves) {
      lines.push(`  - ${move.skillName}: ${move.fromCategory} -> ${move.toCategory}`);
    }
  }

  const pointers = [...plan.pointerOperations].sort((left, right) => {
    if (left.categoryName !== right.categoryName) {
      return left.categoryName.localeCompare(right.categoryName);
    }
    return left.profileId.localeCompare(right.profileId);
  });

  lines.push("Exact pointer categories to regenerate:");
  if (pointers.length === 0) {
    lines.push("  - No pointer updates planned.");
  } else {
    for (const pointer of pointers) {
      lines.push(`  - [${pointer.categoryName}] ${pointer.count} skill(s)`);
    }
  }

  if (plan.conflicts.length > 0) {
    lines.push("Conflicts requiring policy handling:");
    for (const conflict of plan.conflicts) {
      lines.push(`  - ${conflict.destinationPath}`);
    }
  }

  return lines;
}
