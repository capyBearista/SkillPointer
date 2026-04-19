import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { IntelligenceIndex, IntelligenceMetadata } from "./types.js";
import { ScoredTag } from "./provider-interface.js";
import { deriveTagsAsync } from "../tags.js";
import { getIntelligenceProvider } from "./runtime.js";

const INDEX_FILENAME = ".skillcat-index.json";

export async function readIntelligenceIndex(vaultPath: string): Promise<IntelligenceIndex | null> {
  const indexPath = path.join(vaultPath, INDEX_FILENAME);
  try {
    const data = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(data) as IntelligenceIndex;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writeIntelligenceIndex(vaultPath: string, index: IntelligenceIndex): Promise<void> {
  const indexPath = path.join(vaultPath, INDEX_FILENAME);
  await fs.mkdir(vaultPath, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

export function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function getOrComputeIntelligence(
  vaultPath: string,
  skillName: string,
  description: string,
  content: string
): Promise<IntelligenceMetadata> {
  const contentHash = computeContentHash(content);
  const descriptionHash = computeContentHash(description);
  
  let index = await readIntelligenceIndex(vaultPath);
  if (!index) {
    index = {
      version: 1,
      model: { id: "default", revision: "1", dim: 0 },
      updatedAt: new Date().toISOString(),
      skills: {}
    };
  }
  
  const existing = index.skills[skillName];
  if (existing && existing.contentHash === contentHash && existing.descriptionHash === descriptionHash) {
    return existing;
  }
  
  // Need to compute
  const provider = getIntelligenceProvider();
  
  const tags = await deriveTagsAsync(skillName, description, {
    maxTags: 5,
    provider: provider ? async (ctx) => {
      const derived = await provider.deriveTags(ctx);
      return derived.map((x: ScoredTag) => x.tag);
    } : undefined
  });
  
  let category;
  if (provider) {
    category = await provider.predictCategory(skillName, description);
  }
  
  const metadata: IntelligenceMetadata = {
    name: skillName,
    descriptionHash,
    contentHash,
    tags,
    predictedCategory: category,
    lastComputedAt: new Date().toISOString(),
    source: {
      provider: provider ? "local-ml" : "heuristic",
      fallbackUsed: !provider
    }
  };
  
  index.skills[skillName] = metadata;
  index.updatedAt = new Date().toISOString();
  await writeIntelligenceIndex(vaultPath, index);
  
  return metadata;
}
