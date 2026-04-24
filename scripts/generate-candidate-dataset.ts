#!/usr/bin/env bun
import { LocalIntelligenceProvider } from '../opentui/src/core/intelligence/provider-local.js';
import * as YAML from 'yaml';
import {
  readFileSync,
  appendFileSync,
  existsSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../docs/internal/intel-fixtures/skills');
const OUTPUT_PATH = join(__dirname, '../docs/internal/candidate-eval-dataset.jsonl');

function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } | null {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const closerIdx = normalized.indexOf('\n---', 4);
  if (closerIdx < 0) return null;
  const fmText = normalized.slice(4, closerIdx);
  let bodyStart = closerIdx + 4;
  if (normalized[bodyStart] === '\n') bodyStart++;
  const body = normalized.slice(bodyStart);
  try {
    const fm = YAML.parse(fmText) ?? {};
    if (typeof fm !== 'object' || Array.isArray(fm)) return null;
    return { fm: fm as Record<string, unknown>, body };
  } catch {
    return null;
  }
}

function findAllSkillFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllSkillFiles(fullPath));
    } else if (entry.name === 'SKILL.md') {
      results.push(fullPath);
    }
  }
  return results;
}

function readProcessedPaths(): Set<string> {
  const set = new Set<string>();
  if (!existsSync(OUTPUT_PATH)) return set;
  const lines = readFileSync(OUTPUT_PATH, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { sourcePath?: string };
      if (record.sourcePath) set.add(record.sourcePath);
    } catch {
      // ignore malformed lines
    }
  }
  return set;
}

async function main() {
  const skillPaths = findAllSkillFiles(FIXTURES_DIR);
  console.log(`Found ${skillPaths.length} SKILL.md files.`);

  const processedPaths = readProcessedPaths();
  const remainingPaths = skillPaths.filter((p) => {
    const relPath = relative(FIXTURES_DIR, p);
    return !processedPaths.has(relPath);
  });

  console.log(`Already processed: ${processedPaths.size}, Remaining: ${remainingPaths.length}`);

  const provider = new LocalIntelligenceProvider();
  console.log('Initializing provider (downloading model if necessary)...');
  await provider.init();
  console.log('Provider ready. Beginning candidate extraction...');

  let processed = processedPaths.size;
  const total = skillPaths.length;
  const logInterval = 100;

  for (const skillPath of remainingPaths) {
    const content = readFileSync(skillPath, 'utf8');
    const split = splitFrontmatter(content);
    if (!split) {
      console.warn(`Skipping ${skillPath}: no frontmatter`);
      continue;
    }

    const name = typeof split.fm.name === 'string' ? split.fm.name : '';
    const description = typeof split.fm.description === 'string' ? split.fm.description : '';

    if (!name) {
      console.warn(`Skipping ${skillPath}: no name`);
      continue;
    }

    const relPath = relative(FIXTURES_DIR, skillPath);
    const slug = relPath.replace(/\/SKILL\.md$/, '').replace(/\//g, '-');

    try {
      const allTags = await provider.deriveTags({
        name,
        description,
        body: split.body,
        maxTags: 50,
      });

      const top50 = allTags.slice(0, 50);

      const record = {
        skillSlug: slug,
        sourcePath: relPath,
        name,
        description,
        candidates: top50,
      };

      appendFileSync(OUTPUT_PATH, JSON.stringify(record) + '\n', 'utf8');

      processed++;
      if (processed % logInterval === 0) {
        console.log(`Processed ${processed}/${total} skills...`);
      }
    } catch (err) {
      console.error(`Error processing ${skillPath}:`, err);
    }
  }

  console.log(`Done. Successfully processed ${processed} of ${total} skills.`);
  console.log(`Output written to: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
