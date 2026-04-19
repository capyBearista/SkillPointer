import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  readIntelligenceIndex,
  writeIntelligenceIndex,
  computeContentHash,
  getOrComputeIntelligence,
} from "./cache";
import { setIntelligenceProvider } from "./runtime";

function makeTempVault(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), "skillcat-cache-test-"));
}

test("reads and writes intelligence index", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-cache-test-"));
  const index = await readIntelligenceIndex(vaultPath);
  assert.equal(index, null);

  const newIndex = {
    version: 1,
    model: { id: "test", revision: "1", dim: 128 },
    updatedAt: new Date().toISOString(),
    skills: {
      "skill-a": {
        name: "skill-a",
        descriptionHash: "abc",
        contentHash: "def",
        tags: ["a", "b"],
        lastComputedAt: new Date().toISOString(),
        source: { provider: "heuristic" as const, fallbackUsed: true },
      },
    },
  };

  await writeIntelligenceIndex(vaultPath, newIndex);
  const readBack = await readIntelligenceIndex(vaultPath);
  assert.deepEqual(readBack, newIndex);
});

test("getOrComputeIntelligence computes and caches tags", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-cache-test-"));
  const content = "---\nname: my-skill\ndescription: Test desc\n---\nbody";
  
  // 1st run: computes and saves to cache
  const meta1 = await getOrComputeIntelligence(vaultPath, "my-skill", "Test desc", content);
  assert.equal(meta1.name, "my-skill");
  assert.ok(meta1.tags.length > 0);
  
  const expectedContentHash = computeContentHash(content);
  assert.equal(meta1.contentHash, expectedContentHash);
  
  // Modify the index slightly to prove it loads from cache
  const index = await readIntelligenceIndex(vaultPath);
  assert.ok(index);
  index.skills["my-skill"].tags = ["cached-tag"];
  await writeIntelligenceIndex(vaultPath, index);
  
  // 2nd run with same content: loads from cache
  const meta2 = await getOrComputeIntelligence(vaultPath, "my-skill", "Test desc", content);
  assert.deepEqual(meta2.tags, ["cached-tag"]);
  
  // 3rd run with diff content: recomputes
  const newContent = content + "\nnew line";
  const meta3 = await getOrComputeIntelligence(vaultPath, "my-skill", "Test desc", newContent);
  assert.notDeepEqual(meta3.tags, ["cached-tag"]); // should recompute heuristic tags
});

test("getOrComputeIntelligence uses provider if available", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "skillcat-cache-test-"));
  
  setIntelligenceProvider({
    deriveTags: async () => [{ tag: "provider-tag", score: 1 }],
    predictCategory: async () => ({ name: "provider-cat", confidence: 1 }),
    generateEmbedding: async () => [1, 2, 3],
    isReady: () => true
  });
  
  const content = "---\nname: skill-b\n---\n";
  const meta = await getOrComputeIntelligence(vaultPath, "skill-b", "desc", content);
  
  assert.deepEqual(meta.tags, ["provider-tag", "desc"]);
  assert.equal(meta.predictedCategory?.name, "provider-cat");
  assert.equal(meta.source.provider, "local-ml");
  
  // Teardown
  setIntelligenceProvider(null as any);
});
