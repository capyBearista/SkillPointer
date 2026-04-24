import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { LocalIntelligenceProvider } from '../opentui/src/core/intelligence/provider-local.js';
import { nlpDeriveTags } from '../opentui/src/core/intelligence/tagger.js';

async function run() {
  const suggestedTagsPath = path.resolve('docs/internal/intel-fixtures/suggested-tags.json');
  const suggestedTags = JSON.parse(fs.readFileSync(suggestedTagsPath, 'utf8'));
  const skillsDir = path.resolve('docs/internal/intel-fixtures/skills');

  const provider = new LocalIntelligenceProvider();
  await provider.init();

  const keys = Object.keys(suggestedTags).slice(0, 3);
  
  for (const key of keys) {
    const skillPath = path.join(skillsDir, key, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf8').slice(0, 2500);

    const startDoc = performance.now();
    await provider.generateEmbedding(content);
    console.log(`Doc embedding latency (Snowflake 2500 chars): ${(performance.now() - startDoc).toFixed(2)}ms`);
  }
}
run();
