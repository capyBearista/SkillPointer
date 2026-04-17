import { test } from "node:test";
import * as assert from "node:assert";
import { deriveTags, deriveTagsWithOptions } from "./tags.js";

test("deriveTags generates up to 3 lowercase kebab-case tags", () => {
  const name = "Super React Skill";
  const desc = "This skill uses React and NextJS to build UI components for frontend.";
  const tags = deriveTags(name, desc, 3);
  
  assert.ok(Array.isArray(tags));
  assert.ok(tags.length <= 3);
  tags.forEach(tag => {
    assert.match(tag, /^[a-z0-9-]+$/);
  });
  
  assert.ok(tags.includes("react"));
});

test("deriveTagsWithOptions supports provider interface and merges heuristics", () => {
  const tags = deriveTagsWithOptions(
    "Server Auth Skill",
    "Handles OAuth login and backend token validation",
    {
      maxTags: 5,
      provider: () => ["identity-access", "oauth"],
    },
  );

  assert.equal(tags[0], "identity-access");
  assert.ok(tags.includes("oauth"));
  assert.ok(tags.some((tag) => tag === "backend" || tag === "auth"));
  assert.ok(tags.length <= 5);
});
