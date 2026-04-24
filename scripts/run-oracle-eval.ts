#!/usr/bin/env bun
/**
 * OpenRouter Oracle Evaluation Script (Task C) — Batched Version
 *
 * Evaluates candidate tags for all skills in the fixture dataset using
 * an LLM-as-a-Judge approach via the OpenRouter API.
 *
 * Features:
 * - Model-agnostic (set OPENROUTER_MODEL env var)
 * - Resumable (skips already-processed skills)
 * - Batched processing (configurable via ORACLE_BATCH_SIZE)
 * - Failure tracking with retry capability
 * - Individual JSON files per skill for easy recovery
 * - Progress logging to stdout and a progress file
 * - NaN sanitization (replaces NaN with 0 before validation)
 * - Partial-failure handling (saves valid skills, retries only missing ones)
 * - Atomic writes (writes to .tmp then renames to prevent corruption)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATASET_PATH = join(PROJECT_ROOT, 'docs/internal/candidate-eval-dataset.jsonl');
const FIXTURES_DIR = join(PROJECT_ROOT, 'docs/internal/intel-fixtures/skills');
const RESULTS_DIR = join(PROJECT_ROOT, 'docs/internal/oracle-results');
const PROGRESS_PATH = join(PROJECT_ROOT, 'docs/internal/oracle-progress.log');
const FAILED_PATH = join(PROJECT_ROOT, 'docs/internal/oracle-failed.log');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'qwen/qwen3.6-plus';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Configuration
const BATCH_SIZE = Number(process.env.ORACLE_BATCH_SIZE ?? '20');
const CONCURRENCY = Number(process.env.ORACLE_CONCURRENCY ?? '5');
const MAX_RETRIES = Number(process.env.ORACLE_MAX_RETRIES ?? '3');
const RETRY_BASE_MS = Number(process.env.ORACLE_RETRY_BASE_MS ?? '2000');

// HTTP status codes that are safe to retry
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ── Zod schemas for validation ──
const CandidateSchema = z.object({
  tag: z.string(),
  score: z.number(),
});

const SkillRecordSchema = z.object({
  skillSlug: z.string(),
  sourcePath: z.string(),
  name: z.string(),
  description: z.string(),
  candidates: z.array(CandidateSchema),
});

const EvaluationSchema = z.object({
  tag: z.string(),
  localScore: z.number(),
  llmJudge: z.coerce.number().int().min(0).max(1),
  evalConfidence: z.coerce.number().min(0).max(1),
  reason: z.string(),
});

const BatchOutputSchema = z.object({
  evaluations: z.array(
    z.object({
      skillSlug: z.string(),
      categories: z.array(z.string()).length(3),
      evaluations: z.array(EvaluationSchema),
    }),
  ),
});

// ── Types ──
interface SkillRecord {
  skillSlug: string;
  sourcePath: string;
  name: string;
  description: string;
  candidates: Array<{ tag: string; score: number }>;
}

interface EvalResult {
  skillSlug: string;
  sourcePath: string;
  model: string;
  evaluatedAt: string;
  batchSize: number;
  durationMs: number;
  categories: string[];
  evaluations: z.infer<typeof EvaluationSchema>[];
}

// ── Utilities ──
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(PROGRESS_PATH, line + '\n', 'utf8');
}

function logFail(skillSlug: string, reason: string) {
  const line = `${skillSlug}\t${reason}\t${new Date().toISOString()}`;
  appendFileSync(FAILED_PATH, line + '\n', 'utf8');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Recursively sanitize invalid numeric values in parsed JSON.
 * Replaces NaN, Infinity, and string "NaN" with 0 to prevent Zod validation failures.
 */
function sanitizeNaN(obj: unknown): unknown {
  if (typeof obj === 'number' && (isNaN(obj) || !isFinite(obj))) return 0;
  if (typeof obj === 'string' && (obj === 'NaN' || obj === 'Infinity' || obj === '-Infinity')) return 0;
  if (Array.isArray(obj)) return obj.map(sanitizeNaN);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sanitizeNaN(v);
    }
    return result;
  }
  return obj;
}

function readDataset(): SkillRecord[] {
  const content = readFileSync(DATASET_PATH, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());
  const records: SkillRecord[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const validated = SkillRecordSchema.parse(parsed);
      records.push(validated);
    } catch {
      console.warn('Skipping malformed dataset line');
    }
  }
  return records;
}

function readSkillBody(sourcePath: string): string | null {
  try {
    return readFileSync(join(FIXTURES_DIR, sourcePath), 'utf8');
  } catch {
    return null;
  }
}

function isAlreadyProcessed(skillSlug: string): boolean {
  return existsSync(join(RESULTS_DIR, `${skillSlug}.json`));
}

/**
 * Atomic file write: write to .tmp file, then rename to final path.
 * Prevents corruption if process is interrupted mid-write.
 * Cleans up temp file if rename fails.
 */
function writeAtomic(resultPath: string, data: string) {
  const tmpPath = `${resultPath}.tmp`;
  try {
    writeFileSync(tmpPath, data, 'utf8');
    renameSync(tmpPath, resultPath);
  } catch (err) {
    // Clean up temp file if it exists
    if (existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
    throw err;
  }
}

// ── Prompt builder ──
function buildBatchPrompt(skills: SkillRecord[]): string {
  const skillsData = skills.map((skill) => {
    const body = readSkillBody(skill.sourcePath);
    return {
      skillSlug: skill.skillSlug,
      name: skill.name,
      description: skill.description,
      body: body ? body.slice(0, 1200) : 'ERROR: Could not read body',
      candidates: skill.candidates,
    };
  });

  return `You are a deterministic, objective tag-evaluation oracle. Evaluate candidate tags for multiple skills below.

## Skills to Evaluate

${skillsData
  .map(
    (s, idx) => `
### Skill ${idx + 1}
- **Slug:** ${s.skillSlug}
- **Name:** ${s.name}
- **Description:** ${s.description}
- **Body:** """${s.body}"""
- **Candidates:** ${JSON.stringify(s.candidates)}
`,
  )
  .join('\n')}

## Evaluation Criteria (Binary: 1 or 0)
A tag receives a 1 (GOOD) ONLY if it satisfies ALL four criteria below. If it fails even one criterion, it receives a 0 (BAD).

**CRITICAL: Be skeptical and conservative, but recognize excellent tags. A false positive is bad, but we want to capture highly relevant terms.**

### 1. Relevance (Mandatory)
The tag must be a direct, accurate descriptor of the skill's core purpose, primary technology, central methodology, or dominant domain.
- EXCELLENT: A core technology or concept mentioned in or related to the skill (e.g., "fastapi" is an EXCELLENT tag for the "fastapi-templates" skill).
- The "don't repeat the name" rule applies mainly if the suggested tag matches the skill name EXACTLY. However, if a portion of the name represents a distinct and highly relevant technology or concept (like "fastapi" in "fastapi-templates"), that portion is a GREAT tag!
- REJECT tags that are just the skill name with a random, non-descriptive suffix/prefix (e.g., "fastapi-templates-create" for "fastapi-templates").

### 2. Specificity (Mandatory)
The tag must be useful for discovery and filtering.
- REJECT these automatically:
  - Ultra-generic umbrella terms (software, code, tool, app, guide, best-practices, patterns, framework, library, api, automation, workflow, integration).
  - Gibberish, malformed hyphen chains, or fragments (e.g., "the-and", "using-for", "-------------ios").
  - Tags with >5 words or excessive length.
  - Tags with repeated words (e.g., "kubernetes-kubernetes", "lark-shared-lark-shared").
- When in doubt, prefer specificity.

### 3. Utility (Mandatory)
If a user searched for this exact tag in a skill marketplace, would they be satisfied if this skill appeared?
- BAD: The tag is so abstract or obscure that no user would search for it; or it reads like a sentence fragment.

### 4. Domain-Agnostic Fairness (Mandatory)
Judge the tag strictly within the skill's stated niche. Do not penalize non-software tags.

## Categorization
For each skill, you MUST also provide exactly three broad categories that best describe the domain, field, or function of the skill. These should be broader than tags (e.g., "programming", "web-development", "security", "analysis").

## Output Schema
Return EXACTLY this JSON object and nothing else. Ensure the output strictly conforms to valid JSON format:
{
  "evaluations": [
    {
      "skillSlug": "string",
      "categories": ["category1", "category2", "category3"],
      "evaluations": [
        {
          "tag": "string",
          "localScore": 0.123,
          "llmJudge": 1,
          "evalConfidence": 0.95,
          "reason": "5-10 word justification"
        }
      ]
    }
  ]
}

Rules:
- One entry per skill, one entry per candidate tag.
- llmJudge must be exactly 0 or 1.
- evalConfidence is 0.0-1.0 representing your certainty.
- reason is 5-10 words explaining the decision.
- No markdown fences, no extra text.`;
}

// ── API call with partial-failure handling ──
async function callOracleBatch(
  skills: SkillRecord[],
  attempt = 0,
  rateLimitDelayMs?: number,
): Promise<Map<string, EvalResult>> {
  const prompt = buildBatchPrompt(skills);
  const startTime = Date.now();
  let nextRateLimitDelay: number | undefined = rateLimitDelayMs;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://skillcat.local',
        'X-OpenRouter-Title': 'SkillCat Oracle Evaluator',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 32768,
        response_format: {
          type: 'json_object',
        },
        // NOTE: response-healing plugin removed — it was suspected of injecting NaN values
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          if (!isNaN(seconds)) {
            nextRateLimitDelay = seconds * 1000;
          } else {
            // Try parsing as HTTP-date
            const dateMs = Date.parse(retryAfter);
            if (!isNaN(dateMs)) {
              nextRateLimitDelay = Math.max(0, dateMs - Date.now());
            }
          }
        }
        throw new Error(`RATE_LIMITED: HTTP 429${nextRateLimitDelay ? `, retry-after: ${nextRateLimitDelay}ms` : ''}`);
      }
      // Only retry transient server errors
      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        throw new Error(`NON_RETRYABLE: HTTP ${response.status}: ${errorText}`);
      }
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; refusal?: string | null };
        error?: { message?: string } | null;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) throw new Error('No choices in response');
    if (choice.error) throw new Error(`Choice error: ${choice.error.message ?? 'unknown'}`);
    if (choice.message?.refusal) {
      // Model refusals are deterministic — don't retry
      throw new Error(`NON_RETRYABLE: Model refusal: ${choice.message.refusal}`);
    }

    const rawContent = choice.message?.content;
    if (!rawContent) throw new Error('Empty content in response');

    let cleaned = rawContent.trim();
    
    // First try: Extract from ```json ... ``` blocks, ignoring text before or after
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1]!.trim();
    } else {
      // Second try: Fallback to capturing between the first { and the last }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(cleaned);
    
    // CRITICAL: Sanitize NaN values before Zod validation
    const sanitized = sanitizeNaN(parsed);
    
    let validated: z.infer<typeof BatchOutputSchema>;
    try {
      validated = BatchOutputSchema.parse(sanitized);
    } catch (validationErr) {
      // Log detailed validation error for debugging
      if (validationErr instanceof z.ZodError) {
        const issues = validationErr.issues.map(i => `${i.path.join('.')}: ${i.message}`).slice(0, 5);
        throw new Error(`Zod validation failed: ${issues.join('; ')}`);
      }
      throw validationErr;
    }

    const duration = Date.now() - startTime;
    const results = new Map<string, EvalResult>();
    const incompleteSlugs: string[] = [];
    const missingSlugs: string[] = [];

    for (const skillEval of validated.evaluations) {
      const skill = skills.find((s) => s.skillSlug === skillEval.skillSlug);
      if (!skill) {
        log(`Warning: Unknown skillSlug in response: ${skillEval.skillSlug}`);
        continue;
      }

      // Check for completeness: must have evaluation for every candidate
      if (skillEval.evaluations.length !== skill.candidates.length) {
        log(
          `Incomplete: ${skill.skillSlug} expected ${skill.candidates.length} evaluations, got ${skillEval.evaluations.length}. Skipping.`,
        );
        incompleteSlugs.push(skill.skillSlug);
        continue;
      }

      results.set(skill.skillSlug, {
        skillSlug: skill.skillSlug,
        sourcePath: skill.sourcePath,
        model: OPENROUTER_MODEL,
        evaluatedAt: new Date().toISOString(),
        batchSize: skills.length,
        durationMs: duration,
        categories: skillEval.categories,
        evaluations: skillEval.evaluations,
      });
    }

    // Identify which skills from the batch were NOT in the response
    for (const skill of skills) {
      if (!results.has(skill.skillSlug) && !incompleteSlugs.includes(skill.skillSlug)) {
        missingSlugs.push(skill.skillSlug);
      }
    }

    // If some skills are missing or incomplete, retry only those
    const failedSlugs = [...incompleteSlugs, ...missingSlugs];
    if (failedSlugs.length > 0 && attempt < MAX_RETRIES) {
      log(`Partial response: ${failedSlugs.length} skills failed/incomplete. Retrying...`);
      const failedSkills = skills.filter((s) => failedSlugs.includes(s.skillSlug));
      const retryResults = await callOracleBatch(failedSkills, attempt + 1, nextRateLimitDelay);
      for (const [slug, result] of retryResults) {
        results.set(slug, result);
      }
    } else if (failedSlugs.length > 0 && attempt >= MAX_RETRIES) {
      // Log to FAILED_PATH on final attempt
      for (const slug of failedSlugs) {
        logFail(slug, 'Missing or incomplete after max retries');
      }
    }

    return results;
  } catch (err) {
    const errorMsg = (err as Error).message;
    
    // Don't retry non-retryable errors
    if (errorMsg.startsWith('NON_RETRYABLE:')) {
      for (const skill of skills) {
        logFail(skill.skillSlug, errorMsg);
      }
      return new Map();
    }

    // Retry with exponential backoff + jitter, respecting rate-limit delays
    if (attempt < MAX_RETRIES) {
      let backoff: number;
      if (rateLimitDelayMs && rateLimitDelayMs > 0) {
        backoff = rateLimitDelayMs;
      } else {
        const baseDelay = RETRY_BASE_MS * (attempt + 1);
        const jitter = Math.random() * 1000;
        backoff = baseDelay + jitter;
      }
      const slugs = skills.map((s) => s.skillSlug).join(', ');
      log(`Retry ${attempt + 1}/${MAX_RETRIES} for batch [${slugs}] after ${Math.round(backoff)}ms: ${errorMsg}`);
      await sleep(backoff);
      return callOracleBatch(skills, attempt + 1, nextRateLimitDelay);
    }

    // Final failure: try single-skill fallback before giving up
    if (skills.length > 1) {
      log(`Final retry failed for batch of ${skills.length}. Trying single-skill fallback...`);
      const fallbackResults = new Map<string, EvalResult>();
      for (const skill of skills) {
        const singleResult = await callOracleBatch([skill], 0, nextRateLimitDelay);
        if (singleResult.has(skill.skillSlug)) {
          fallbackResults.set(skill.skillSlug, singleResult.get(skill.skillSlug)!);
        } else {
          logFail(skill.skillSlug, errorMsg);
        }
      }
      return fallbackResults;
    }

    // Single skill also failed — log it
    for (const skill of skills) {
      logFail(skill.skillSlug, errorMsg);
    }
    return new Map();
  }
}

// ── Concurrency limiter ──
function pLimit(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    while (active < n && queue.length > 0) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          active--;
          next();
        }
      });
      next();
    });
}

// ── Main ──
async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY environment variable is required.');
    console.error('Set it with: export OPENROUTER_API_KEY=your_key_here');
    process.exit(1);
  }

  if (!existsSync(DATASET_PATH)) {
    console.error(`ERROR: Dataset not found at ${DATASET_PATH}`);
    process.exit(1);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });

  const allRecords = readDataset();
  log(`Loaded ${allRecords.length} skills from dataset.`);

  // Filter to remaining (unprocessed) skills
  const remaining = allRecords.filter((r) => !isAlreadyProcessed(r.skillSlug));
  log(`Already processed: ${allRecords.length - remaining.length}, Remaining: ${remaining.length}`);

  if (remaining.length === 0) {
    log('All skills already processed. Nothing to do.');
    return;
  }

  // Build batches
  const batches: SkillRecord[][] = [];
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    batches.push(remaining.slice(i, i + BATCH_SIZE));
  }

  log(`Starting evaluation with model: ${OPENROUTER_MODEL}, batchSize: ${BATCH_SIZE}, concurrency: ${CONCURRENCY}, totalBatches: ${batches.length}`);

  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  let failed = 0;
  let completedBatches = 0;
  const totalSkills = remaining.length;
  const logInterval = 5;

  const tasks = batches.map((batch) =>
    limit(async () => {
      const results = await callOracleBatch(batch);

      for (const skill of batch) {
        const result = results.get(skill.skillSlug);
        if (result) {
          const resultPath = join(RESULTS_DIR, `${skill.skillSlug}.json`);
          // Atomic write: write to .tmp then rename
          writeAtomic(resultPath, JSON.stringify(result, null, 2));
          completed++;
        } else {
          failed++;
        }
      }

      completedBatches++;
      if (completedBatches % logInterval === 0 || completedBatches === batches.length) {
        log(`Progress: ${completed}/${totalSkills} skills done, ${failed} failed (${completedBatches}/${batches.length} batches)`);
      }
    }),
  );

  await Promise.all(tasks);

  log(`Evaluation complete. Total: ${totalSkills}, Completed: ${completed}, Failed: ${failed}`);
  log(`Results written to: ${RESULTS_DIR}`);
  if (failed > 0) {
    log(`Failed skills logged to: ${FAILED_PATH}`);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
