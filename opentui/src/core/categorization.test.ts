import test from "node:test";
import assert from "node:assert/strict";
import { getCategoryForSkill } from "./categorization.js";

test("getCategoryForSkill correctly identifies new domains and heuristics", () => {
  // Original domains
  assert.equal(getCategoryForSkill("auth-script"), "security");
  assert.equal(getCategoryForSkill("pr-review-bot"), "code-review");
  
  // New domains
  assert.equal(getCategoryForSkill("ios-development-tool"), "mobile-dev");
  assert.equal(getCategoryForSkill("react-native-helper"), "mobile-dev");
  assert.equal(getCategoryForSkill("data-science-pipeline"), "data-engineering");
  assert.equal(getCategoryForSkill("pandas-script"), "data-engineering");
  assert.equal(getCategoryForSkill("team-collaboration"), "productivity");
  assert.equal(getCategoryForSkill("knowledge-management-app"), "productivity");
  
  // Exact match logic
  assert.equal(getCategoryForSkill('"react"'), "web-dev");
  
  // Uncategorized
  assert.equal(getCategoryForSkill("something-unknown"), "_uncategorized");
});
