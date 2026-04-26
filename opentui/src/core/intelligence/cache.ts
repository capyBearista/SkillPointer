import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { IntelligenceIndex, IntelligenceMetadata } from "./types.js";
import { ScoredTag } from "./provider-interface.js";
import { deriveTagsAsync } from "../tags.js";
import { getIntelligenceProvider } from "./runtime.js";
import { Mutex } from "./mutex.js";

const INDEX_FILENAME = ".skillcat-index.json";
const vaultMutexes = new Map<string, Mutex>();

function getVaultMutex(vaultPath: string): Mutex {
  let mutex = vaultMutexes.get(vaultPath);
  if (!mutex) {
    mutex = new Mutex();
    vaultMutexes.set(vaultPath, mutex);
  }
  return mutex;
}

export async function readIntelligenceIndex(vaultPath: string): Promise<IntelligenceIndex | null> {
  const indexPath = path.join(vaultPath, INDEX_FILENAME);
  try {
    const data = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(data) as IntelligenceIndex;
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
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
  
  const tagsPromise = deriveTagsAsync(skillName, description, {
    maxTags: 10,
    body: content,
    provider: provider ? async (ctx) => {
      const { nlpDeriveTags } = await import("./tagger.js");
      return await nlpDeriveTags(provider, ctx.name, ctx.description, { maxTags: ctx.maxTags, minConfidence: 0.65, body: ctx.body });
    } : undefined
  });
  
  const categoryPromise = provider ? provider.predictCategory(skillName, description, content) : Promise.resolve(undefined);

  const [tags, category] = await Promise.all([tagsPromise, categoryPromise]);
  
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
  
  const release = await getVaultMutex(vaultPath).acquire();
  try {
    let latestIndex = await readIntelligenceIndex(vaultPath);
    if (!latestIndex) {
      latestIndex = {
        version: 1,
        model: { id: "default", revision: "1", dim: 0 },
        updatedAt: new Date().toISOString(),
        skills: {}
      };
    }
    latestIndex.skills[skillName] = metadata;
    latestIndex.updatedAt = new Date().toISOString();
    await writeIntelligenceIndex(vaultPath, latestIndex);
  } finally {
    release();
  }
  
  return metadata;
}
