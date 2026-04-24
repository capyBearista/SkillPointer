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

  const keys = Object.keys(suggestedTags).slice(0, 10);
  let totalLatency = 0;

  for (const key of keys) {
    const skillPath = path.join(skillsDir, key, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf8');
    const lines = content.split('\n');
    let name = key.split('/').pop() || key;
    let description = content.slice(0, 200).replace(/\n/g, ' ');

    const start = performance.now();
    const tags = await nlpDeriveTags(provider, name, description, { minConfidence: 0.25, maxTags: 5, body: content });
    const latency = performance.now() - start;
    totalLatency += latency;
    console.log(`Skill: ${name.slice(0, 20)}, Latency: ${latency.toFixed(2)}ms`);
  }
  console.log(`Average Latency: ${(totalLatency / keys.length).toFixed(2)}ms`);
}
run();
