#!/usr/bin/env bun
/**
 * Batched test of the oracle eval script — processes 6 skills in 2 batches of 3.
 * Fixes: smaller batches, higher max_tokens, robust Zod parsing.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATASET_PATH = join(PROJECT_ROOT, 'docs/internal/candidate-eval-dataset.jsonl');
const FIXTURES_DIR = join(PROJECT_ROOT, 'docs/internal/intel-fixtures/skills');
const RESULTS_DIR = join(PROJECT_ROOT, 'docs/internal/oracle-results');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-3-flash-preview';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const EvaluationSchema = z.object({
  tag: z.string(),
  localScore: z.number(),
  llmJudge: z.coerce.number().int().min(0).max(1),
  evalConfidence: z.coerce.number().min(0).max(1),
  reason: z.string(),
});

const OutputSchema = z.object({
  evaluations: z.array(
    z.object({
      skillSlug: z.string(),
      evaluations: z.array(EvaluationSchema),
    }),
  ),
});

interface SkillRecord {
  skillSlug: string;
  sourcePath: string;
  name: string;
  description: string;
  candidates: Array<{ tag: string; score: number }>;
}

function readDataset(limit: number): SkillRecord[] {
  const content = readFileSync(DATASET_PATH, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());
  const records: SkillRecord[] = [];
  for (const line of lines.slice(0, limit)) {
    try {
      records.push(JSON.parse(line) as SkillRecord);
    } catch {
      // ignore
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

function buildPrompt(skills: SkillRecord[]): string {
  const skillsData = skills.map((skill) => {
    const body = readSkillBody(skill.sourcePath);
    return {
      skillSlug: skill.skillSlug,
      name: skill.name,
      description: skill.description,
      body: body ? body.slice(0, 3000) : 'ERROR: Could not read body',
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

## Evaluation Criteria
A tag receives a 1 (GOOD) ONLY if it satisfies ALL four criteria:
1. Relevance: Direct, accurate descriptor of the skill's core purpose/technology.
2. Specificity: Useful for discovery. Reject ultra-generic terms (software, code, tool, app, guide, best-practices, patterns, framework, library, api, automation, workflow, integration) and gibberish fragments.
3. Utility: A human would realistically search for this tag to find this skill.
4. Domain-Agnostic Fairness: Judge strictly within the skill's niche. Non-software tags are equally valid.

## Output Schema
Return EXACTLY this JSON object and nothing else:
{
  "evaluations": [
    {
      "skillSlug": "string",
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
- The evaluations array must contain one entry per skill.
- Each skill's evaluations array must contain one entry per candidate tag.
- llmJudge must be exactly 0 or 1.
- evalConfidence is 0.0-1.0 representing your certainty.
- reason is 5-10 words explaining the decision.
- No markdown fences, no extra text.`;
}

async function callOracleBatch(skills: SkillRecord[]): Promise<unknown> {
  const prompt = buildPrompt(skills);
  console.log(`  Sending request with prompt length: ${prompt.length} chars, ${skills.length} skills...`);

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
      reasoning: { effort: 'minimal' },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'batch_tag_evaluations',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              evaluations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    skillSlug: { type: 'string' },
                    evaluations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          tag: { type: 'string' },
                          localScore: { type: 'number' },
                          llmJudge: { type: 'integer', enum: [0, 1] },
                          evalConfidence: { type: 'number' },
                          reason: { type: 'string' },
                        },
                        required: ['tag', 'localScore', 'llmJudge', 'evalConfidence', 'reason'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['skillSlug', 'evaluations'],
                  additionalProperties: false,
                },
              },
            },
            required: ['evaluations'],
            additionalProperties: false,
          },
        },
      },
      plugins: [{ id: 'response-healing' }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; refusal?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty content');

  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();

  return JSON.parse(cleaned);
}

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error('Missing OPENROUTER_API_KEY');
    process.exit(1);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });

  const skills = readDataset(20);
  console.log(`Testing batched evaluation with ${skills.length} skills, model: ${OPENROUTER_MODEL}`);

  const batchSize = 20;
  const batches: SkillRecord[][] = [];
  for (let i = 0; i < skills.length; i += batchSize) {
    batches.push(skills.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const startTime = Date.now();
    console.log(`\n[Batch ${i + 1}/${batches.length}] Processing ${batch.length} skills...`);

    try {
      const raw = await callOracleBatch(batch);
      const duration = Date.now() - startTime;
      const validated = OutputSchema.parse(raw);
      console.log(`  Completed in ${duration}ms`);

      // Verify completeness
      for (const skill of batch) {
        const skillEval = validated.evaluations.find((e) => e.skillSlug === skill.skillSlug);
        if (!skillEval) {
          console.warn(`  Warning: Missing evaluation for ${skill.skillSlug}`);
          continue;
        }
        if (skillEval.evaluations.length !== skill.candidates.length) {
          console.warn(
            `  Warning: ${skill.skillSlug} expected ${skill.candidates.length} evaluations, got ${skillEval.evaluations.length}`,
          );
        }
      }

      // Save results
      for (const skillEval of validated.evaluations) {
        console.log(`  [OK] ${skillEval.skillSlug}: ${skillEval.evaluations.length} tags evaluated`);
        console.log(`    Sample: ${JSON.stringify(skillEval.evaluations[0])}`);

        writeFileSync(
          join(RESULTS_DIR, `${skillEval.skillSlug}.json`),
          JSON.stringify(
            {
              model: OPENROUTER_MODEL,
              batchSize: batch.length,
              durationMs: duration,
              ...skillEval,
            },
            null,
            2,
          ),
          'utf8',
        );
      }
    } catch (err) {
      console.error(`  [FAIL] Batch ${i + 1}: ${(err as Error).message}`);
    }
  }

  console.log('\nBatched test complete.');
}

main().catch(console.error);
