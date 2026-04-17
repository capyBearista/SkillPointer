const DOMAIN_HEURISTICS: Record<string, string[]> = {
  security: [
    "attack",
    "injection",
    "vulnerability",
    "xss",
    "fuzzing",
    "auth",
    "jwt",
    "oauth",
    "security",
    "exploit",
    "encryption",
  ],
  "code-review": [
    "code-review",
    "code review",
    "codereview",
    "requesting-code-review",
    "reviewer",
    "review-bot",
    "static-analysis",
    "quality-gate",
  ],
  git: [
    "git",
    "github",
    "gitlab",
    "pull-request",
    "merge-request",
    "commit",
    "branch",
    "rebase",
    "cherry-pick",
    "release",
  ],
  "ai-ml": [
    "ai-",
    "ml-",
    "llm",
    "agent",
    "gpt",
    "claude",
    "gemini",
    "openai",
    "prompt",
    "rag",
    "machine-learning",
  ],
  "web-dev": [
    "angular",
    "react",
    "vue",
    "tailwind",
    "frontend",
    "css",
    "html",
    "nextjs",
    "svelte",
    "astro",
    "web",
    "dom",
    "ui-patterns",
  ],
  "backend-dev": [
    "api",
    "nestjs",
    "express",
    "django",
    "flask",
    "fastapi",
    "graphql",
    "rest",
    "grpc",
    "backend",
    "server",
  ],
  devops: [
    "aws",
    "azure",
    "docker",
    "kubernetes",
    "ci-cd",
    "terraform",
    "ansible",
    "github-actions",
    "devops",
    "cloud",
    "deploy",
  ],
  database: [
    "sql",
    "mysql",
    "postgres",
    "mongo",
    "redis",
    "database",
    "schema",
    "prisma",
    "orm",
    "nosql",
    "sqlite",
  ],
  automation: [
    "automation",
    "zapier",
    "n8n",
    "selenium",
    "playwright",
    "puppeteer",
    "bot",
    "workflow",
    "scraper",
  ],
  design: ["design", "figma", "animation", "motion", "ux", "svg"],
  programming: [
    "python",
    "javascript",
    "typescript",
    "java",
    "cpp",
    "ruby",
    "php",
    "csharp",
    "algorithm",
    "data-structure",
  ],
};

export function getCategoryForSkill(skillName: string): string {
  let exactMatch = false;
  let normalized = skillName.toLowerCase().replace(/_/g, "-");

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    exactMatch = true;
    normalized = normalized.slice(1, -1).trim().replace(/ /g, "-");
  }

  const hasPullRequestTerm = ["pr-review", "pull-request", "merge-request"].some((term) =>
    normalized.includes(term),
  );
  if (normalized.includes("review") && hasPullRequestTerm) {
    return "code-review";
  }

  for (const [category, keywords] of Object.entries(DOMAIN_HEURISTICS)) {
    if (exactMatch) {
      if (keywords.includes(normalized)) {
        return category;
      }
      continue;
    }

    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "_uncategorized";
}
