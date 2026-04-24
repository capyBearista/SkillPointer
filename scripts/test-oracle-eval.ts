#!/usr/bin/env bun
/**
 * Quick test of the oracle eval script — processes first 5 skills only.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
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
  llmJudge: z.union([z.literal(0), z.literal(1)]),
  evalConfidence: z.number().min(0).max(1),
  reason: z.string(),
});

const OutputSchema = z.object({
  evaluations: z.array(EvaluationSchema),
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

function buildPrompt(skill: SkillRecord, body: string): string {
  const candidatesJson = JSON.stringify(skill.candidates);
  return `You are a deterministic, objective tag-evaluation oracle. Evaluate every candidate tag for the skill below.

## Skill Definition

**Name:** ${skill.name}
**Description:** ${skill.description}

**Body:**
"""
${body.slice(0, 4000)}
"""

## Candidate Tags
${candidatesJson}

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
      "tag": "string",
      "localScore": 0.123,
      "llmJudge": 1,
      "evalConfidence": 0.95,
      "reason": "5-10 word justification"
    }
  ]
}

Rules:
- evaluations must contain one entry per candidate tag.
- llmJudge must be exactly 0 or 1.
- evalConfidence is 0.0-1.0 representing your certainty.
- reason is 5-10 words explaining the decision.
- No markdown fences, no extra text.`;
}

async function callOracle(skill: SkillRecord, body: string): Promise<unknown> {
  const prompt = buildPrompt(skill, body);

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
      max_tokens: 2048,
      reasoning: { effort: 'minimal' },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tag_evaluations',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              evaluations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tag: { type: 'string' },
                    localScore: { type: 'number' },
                    llmJudge: { type: 'integer', enum: [0, 1] },
                    evalConfidence: { type: 'number', minimum: 0, maximum: 1 },
                    reason: { type: 'string' },
                  },
                  required: ['tag', 'localScore', 'llmJudge', 'evalConfidence', 'reason'],
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

  const skills = readDataset(5);
  console.log(`Testing with ${skills.length} skills, model: ${OPENROUTER_MODEL}`);

  for (const skill of skills) {
    const body = readSkillBody(skill.sourcePath);
    if (!body) {
      console.log(`[SKIP] ${skill.skillSlug}: no body`);
      continue;
    }

    try {
      const raw = await callOracle(skill, body);
      const validated = OutputSchema.parse(raw);
      console.log(`\n[OK] ${skill.skillSlug}`);
      console.log(`  Evaluated ${validated.evaluations.length} tags`);
      console.log(`  Sample: ${JSON.stringify(validated.evaluations[0])}`);

      // Save test result
      writeFileSync(
        join(RESULTS_DIR, `${skill.skillSlug}.json`),
        JSON.stringify({ skillSlug: skill.skillSlug, model: OPENROUTER_MODEL, ...validated }, null, 2),
        'utf8',
      );
    } catch (err) {
      console.error(`[FAIL] ${skill.skillSlug}: ${(err as Error).message}`);
    }
  }

  console.log('\nTest complete.');
}

main().catch(console.error);
