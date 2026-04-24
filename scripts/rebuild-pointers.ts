import { detectPathProfiles } from "../opentui/src/core/path-profiles.js";
import { buildMaintainPlan, applyMaintainPlan } from "../opentui/src/core/maintain-plan.js";

async function main() {
  const profiles = detectPathProfiles();
  console.log(`Loaded ${profiles.length} profiles.`);
  
  const plan = await buildMaintainPlan({
    profiles,
    actions: { recategorize: false, regeneratePointers: true }
  });
  
  console.log(`Plan built: ${plan.pointerOperations.length} pointer operations.`);
  
  const result = await applyMaintainPlan(plan, { batchConflictAction: "abort" });
  console.log(`Applied. Pointers generated: ${result.pointerCount}`);
}

main().catch(console.error);
