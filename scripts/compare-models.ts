#!/usr/bin/env bun
/**
 * Model Comparison Test: Qwen 3.6 Plus vs Gemini 3 Flash
 * Tests the exact same 20-skill batch with both models and generates a comparison report.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const PROJECT_ROOT = '/home/arjun/.skill-setup';
const DATASET_PATH = join(PROJECT_ROOT, 'docs/internal/candidate-eval-dataset.jsonl');
const FIXTURES_DIR = join(PROJECT_ROOT, 'docs/internal/intel-fixtures/skills');
const QWEN_RESULTS_DIR = join(PROJECT_ROOT, 'docs/internal/oracle-results-qwen');
const GEMINI_RESULTS_DIR = join(PROJECT_ROOT, 'docs/internal/oracle-results-gemini');
const REPORT_PATH = join(PROJECT_ROOT, 'docs/internal/model-comparison-report.json');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_MODEL = 'google/gemini-3-flash-preview';

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

function log(section: string, message: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${section}] ${message}`);
}

function readDataset(): SkillRecord[] {
  const content = readFileSync(DATASET_PATH, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());
  return lines.map((line) => JSON.parse(line) as SkillRecord);
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

async function callGeminiBatch(skills: SkillRecord[]): Promise<{ results: Map<string, any>; durationMs: number; tokenUsage?: any }> {
  const prompt = buildPrompt(skills);
  const startTime = Date.now();
  
  log('GEMINI', `Sending batch of ${skills.length} skills (${prompt.length.toLocaleString()} chars)...`);

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://skillcat.local',
      'X-OpenRouter-Title': 'SkillCat Oracle Evaluator',
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 32768,
      response_format: {
        type: 'json_object',
      },
      plugins: [{ id: 'response-healing' }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string; refusal?: string | null };
      error?: { message?: string } | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };

  const choice = data.choices?.[0];
  if (!choice) throw new Error('No choices in response');
  if (choice.error) throw new Error(`Choice error: ${choice.error.message ?? 'unknown'}`);
  if (choice.message?.refusal) throw new Error(`Model refusal: ${choice.message.refusal}`);

  const rawContent = choice.message?.content;
  if (!rawContent) throw new Error('Empty content in response');

  let cleaned = rawContent.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();

  const parsed = JSON.parse(cleaned);
  const validated = BatchOutputSchema.parse(parsed);

  const duration = Date.now() - startTime;
  const results = new Map<string, any>();

  for (const skillEval of validated.evaluations) {
    const skill = skills.find((s) => s.skillSlug === skillEval.skillSlug);
    if (!skill) {
      log('WARN', `Unknown skillSlug in response: ${skillEval.skillSlug}`);
      continue;
    }

    results.set(skill.skillSlug, {
      skillSlug: skill.skillSlug,
      model: GEMINI_MODEL,
      evaluatedAt: new Date().toISOString(),
      batchSize: skills.length,
      durationMs: duration,
      evaluations: skillEval.evaluations,
    });
  }

  return { results, durationMs: duration, tokenUsage: data.usage };
}

function loadQwenResults(): Map<string, any> {
  const results = new Map<string, any>();
  const files = readdirSync(QWEN_RESULTS_DIR).filter((f) => f.endsWith('.json'));
  
  log('LOAD', `Loading ${files.length} Qwen results from ${QWEN_RESULTS_DIR}...`);
  
  for (const file of files) {
    const content = readFileSync(join(QWEN_RESULTS_DIR, file), 'utf8');
    const data = JSON.parse(content);
    results.set(data.skillSlug || file.replace('.json', ''), data);
  }
  
  return results;
}

function calculateStats(results: Map<string, any>) {
  let totalTags = 0;
  let approvedTags = 0;
  let avgConfidence = 0;
  let confidenceCount = 0;

  for (const [, data] of results) {
    if (!data.evaluations) continue;
    totalTags += data.evaluations.length;
    for (const eval_ of data.evaluations) {
      if (eval_.llmJudge === 1) approvedTags++;
      avgConfidence += eval_.evalConfidence;
      confidenceCount++;
    }
  }

  return {
    totalSkills: results.size,
    totalTags,
    approvedTags,
    approvalRate: totalTags > 0 ? (approvedTags / totalTags) : 0,
    avgConfidence: confidenceCount > 0 ? (avgConfidence / confidenceCount) : 0,
  };
}

function compareResults(qwenResults: Map<string, any>, geminiResults: Map<string, any>) {
  const disagreements: Array<{
    skillSlug: string;
    tag: string;
    localScore: number;
    qwenJudge: number;
    geminiJudge: number;
    qwenReason: string;
    geminiReason: string;
  }> = [];

  for (const [skillSlug, qwenData] of qwenResults) {
    const geminiData = geminiResults.get(skillSlug);
    if (!geminiData || !geminiData.evaluations || !qwenData.evaluations) continue;

    const qwenMap = new Map<string, any>(qwenData.evaluations.map((e: any) => [e.tag, e]));
    const geminiMap = new Map<string, any>(geminiData.evaluations.map((e: any) => [e.tag, e]));

    for (const [tag, qwenEval] of qwenMap) {
      const geminiEval = geminiMap.get(tag);
      if (!geminiEval) continue;
      
      if (qwenEval.llmJudge !== geminiEval.llmJudge) {
        disagreements.push({
          skillSlug,
          tag,
          localScore: qwenEval.localScore,
          qwenJudge: qwenEval.llmJudge,
          geminiJudge: geminiEval.llmJudge,
          qwenReason: qwenEval.reason,
          geminiReason: geminiEval.reason,
        });
      }
    }
  }

  return disagreements;
}

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error('Missing OPENROUTER_API_KEY');
    process.exit(1);
  }

  mkdirSync(GEMINI_RESULTS_DIR, { recursive: true });

  // Load all skills and filter to the same 20 that Qwen processed
  const allSkills = readDataset();
  const qwenFiles = readdirSync(QWEN_RESULTS_DIR).filter((f) => f.endsWith('.json'));
  const qwenSlugs = qwenFiles.map((f) => f.replace('.json', ''));
  const testSkills = allSkills.filter((s) => qwenSlugs.includes(s.skillSlug));

  log('SETUP', `Found ${testSkills.length} skills matching Qwen test batch`);
  log('SETUP', `Skills: ${testSkills.map((s) => s.skillSlug).join(', ')}`);

  // Run Gemini evaluation
  log('GEMINI', 'Starting Gemini 3 Flash evaluation...');
  const { results: geminiResults, durationMs: geminiDuration, tokenUsage: geminiUsage } = 
    await callGeminiBatch(testSkills);

  // Save Gemini results
  log('SAVE', `Saving ${geminiResults.size} Gemini results...`);
  for (const [skillSlug, data] of geminiResults) {
    writeFileSync(
      join(GEMINI_RESULTS_DIR, `${skillSlug}.json`),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  }

  // Load Qwen results
  const qwenResults = loadQwenResults();

  // Calculate stats
  const qwenStats = calculateStats(qwenResults);
  const geminiStats = calculateStats(geminiResults);

  // Compare disagreements
  const disagreements = compareResults(qwenResults, geminiResults);

  // Build report
  const report = {
    generatedAt: new Date().toISOString(),
    batchSize: testSkills.length,
    models: {
      qwen: {
        model: 'qwen/qwen3.6-plus',
        totalDurationMs: Array.from(qwenResults.values()).reduce((sum: number, data: any) => sum + (data.durationMs || 0), 0),
        stats: qwenStats,
      },
      gemini: {
        model: GEMINI_MODEL,
        totalDurationMs: geminiDuration,
        tokenUsage: geminiUsage,
        stats: geminiStats,
      },
    },
    comparison: {
      totalDisagreements: disagreements.length,
      totalComparisons: qwenStats.totalTags,
      agreementRate: qwenStats.totalTags > 0 ? (1 - (disagreements.length / qwenStats.totalTags)) : 0,
      disagreements: disagreements.slice(0, 20), // Limit to first 20 for readability
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('MODEL COMPARISON REPORT');
  console.log('='.repeat(70));
  console.log(`Batch Size:        ${testSkills.length} skills`);
  console.log(`Total Tags Evaluated: ${qwenStats.totalTags}`);
  console.log('');
  console.log('QWEN 3.6 PLUS:');
  console.log(`  Duration:        ${(report.models.qwen.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Approval Rate:   ${(qwenStats.approvalRate * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence:  ${(qwenStats.avgConfidence * 100).toFixed(1)}%`);
  console.log('');
  console.log('GEMINI 3 FLASH:');
  console.log(`  Duration:        ${(geminiDuration / 1000).toFixed(1)}s`);
  console.log(`  Approval Rate:   ${(geminiStats.approvalRate * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence:  ${(geminiStats.avgConfidence * 100).toFixed(1)}%`);
  if (geminiUsage) {
    console.log(`  Tokens:          ${geminiUsage.total_tokens?.toLocaleString() || 'N/A'}`);
    console.log(`  Cost:            $${geminiUsage.cost?.toFixed(4) || 'N/A'}`);
  }
  console.log('');
  console.log('INTER-MODEL AGREEMENT:');
  console.log(`  Agreement Rate:  ${(report.comparison.agreementRate * 100).toFixed(1)}%`);
  console.log(`  Disagreements:   ${disagreements.length} / ${qwenStats.totalTags}`);
  console.log('');
  console.log(`Full report saved to: ${REPORT_PATH}`);
  console.log(`Gemini results saved to: ${GEMINI_RESULTS_DIR}`);
  console.log(`Qwen results saved to: ${QWEN_RESULTS_DIR}`);
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
