import type { TagProviderAsync } from "./intelligence/provider-interface.js";

function normalizeStr(str: string): string {
  return str.toLowerCase().trim();
}

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type TagProviderContext = {
  name: string;
  description: string;
  body?: string;
  maxTags: number;
};

export type TagProvider = (context: TagProviderContext) => string[];

export type DeriveTagsOptions = {
  maxTags?: number;
  provider?: TagProvider;
};

export type DeriveTagsAsyncOptions = {
  maxTags?: number;
  provider?: TagProviderAsync;
};

/**
 * Common NLP-extensible tag dictionary.
 * Currently uses simple keyword extraction but structured for future NLP integration.
 */
export const TAG_DICTIONARY: Record<string, string[]> = {
  // Languages
  typescript: ["ts", "typescript", "tsx"],
  javascript: ["js", "javascript", "jsx"],
  python: ["py", "python", "pytest"],
  rust: ["rs", "rust", "cargo"],
  go: ["go", "golang", "cargo"],
  java: ["java", "maven", "gradle"],
  csharp: ["c#", "csharp", "dotnet"],
  cpp: ["cpp", "c++", "cxx"],
  
  // Frameworks & Libraries
  react: ["react", "nextjs", "next.js", "jsx", "tsx"],
  vue: ["vue", "nuxtjs", "nuxt"],
  svelte: ["svelte", "sveltekit"],
  angular: ["angular", "ng"],
  express: ["express", "expressjs"],
  django: ["django", "drf"],
  flask: ["flask"],
  spring: ["spring", "springboot"],
  
  // Concepts & Domains
  frontend: ["ui", "frontend", "interface", "component"],
  backend: ["backend", "api", "server", "microservice", "service"],
  database: ["db", "database", "sql", "nosql", "postgres", "mysql", "mongodb", "redis"],
  auth: ["auth", "authentication", "login", "jwt", "oauth"],
  security: ["security", "vuln", "cve", "audit", "encryption", "crypto"],
  testing: ["test", "testing", "jest", "vitest", "mocha", "cypress", "playwright"],
  devops: ["ci", "cd", "devops", "pipeline", "deploy", "docker", "k8s", "kubernetes"],
  docs: ["docs", "documentation", "readme", "markdown", "mdx"],
  "ai-ml": ["ai", "ml", "llm", "gpt", "model", "inference", "prompt"],
};

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "when",
  "then",
  "skill",
  "use",
  "using",
  "into",
  "your",
  "their",
  "about",
  "across",
  "helps",
  "helper",
]);

function deriveHeuristicTags(context: TagProviderContext): string[] {
  const tags = new Set<string>();
  const normalizedName = normalizeStr(context.name);
  const normalizedDesc = normalizeStr(context.description);
  const fullText = `${normalizedName} ${normalizedDesc}`;
  const words = fullText.split(/[\s\-_,.]+/).filter((w) => w.length > 2);

  for (const [tag, keywords] of Object.entries(TAG_DICTIONARY)) {
    for (const keyword of keywords) {
      if (
        words.includes(keyword) ||
        fullText.includes(` ${keyword} `) ||
        fullText.startsWith(`${keyword} `) ||
        fullText.endsWith(` ${keyword}`)
      ) {
        tags.add(tag);
        break;
      }
    }
  }

  if (tags.size < context.maxTags) {
    const nameTerms = new Set(
      normalizedName
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    );

    const descTerms = normalizedDesc
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((term) => toKebabCase(term))
      .filter((term) => term.length > 3 && !STOP_WORDS.has(term) && !nameTerms.has(term));

    for (const term of descTerms) {
      if (tags.size >= context.maxTags) {
        break;
      }
      tags.add(term);
    }
  }

  if (tags.size === 0) {
    const fallback = toKebabCase(context.name);
    if (fallback) {
      tags.add(fallback);
    }
  }

  return Array.from(tags).slice(0, context.maxTags);
}

/**
 * Derives tags from a skill's name and description.
 * Ensures tags are lowercase kebab-case and limits to maxTags (target 3-5 per PRD).
 */
export function deriveTags(name: string, description: string, maxTags: number = 3, body?: string): string[] {
  const context: TagProviderContext = { name, description, maxTags, body };
  return deriveHeuristicTags(context);
}

export function deriveTagsWithOptions(
  name: string,
  description: string,
  options: DeriveTagsOptions & { body?: string } = {},
): string[] {
  const maxTags = options.maxTags ?? 3;
  const context: TagProviderContext = { name, description, maxTags, body: options.body };

  const tags = new Set<string>();
  const providerTags = options.provider ? options.provider(context) : [];
  for (const tag of providerTags) {
    const normalized = toKebabCase(tag);
    if (!normalized) {
      continue;
    }
    tags.add(normalized);
    if (tags.size >= maxTags) {
      return Array.from(tags).slice(0, maxTags);
    }
  }

  for (const tag of deriveHeuristicTags(context)) {
    tags.add(tag);
    if (tags.size >= maxTags) {
      break;
    }
  }

  return Array.from(tags).slice(0, maxTags);
}

export async function deriveTagsAsync(
  name: string,
  description: string,
  options: DeriveTagsAsyncOptions & { body?: string } = {},
): Promise<string[]> {
  const maxTags = options.maxTags ?? 3;
  const context: TagProviderContext = { name, description, maxTags, body: options.body };

  const tags = new Set<string>();
  let providerTags: string[] = [];
  if (options.provider) {
    try {
      providerTags = await options.provider(context);
    } catch (err) {
      console.warn("Async provider failed, falling back to heuristics:", err);
    }
  }

  for (const tag of providerTags) {
    const normalized = toKebabCase(tag);
    if (!normalized) {
      continue;
    }
    tags.add(normalized);
    if (tags.size >= maxTags) {
      return Array.from(tags).slice(0, maxTags);
    }
  }

  for (const tag of deriveHeuristicTags(context)) {
    tags.add(tag);
    if (tags.size >= maxTags) {
      break;
    }
  }

  return Array.from(tags).slice(0, maxTags);
}
