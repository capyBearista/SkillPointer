import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { LocalIntelligenceProvider } from '../opentui/src/core/intelligence/provider-local.js';
import { nlpDeriveTags } from '../opentui/src/core/intelligence/tagger.js';

async function runBenchmark() {
  const suggestedTagsPath = path.resolve('docs/internal/intel-fixtures/suggested-tags.json');
  if (!fs.existsSync(suggestedTagsPath)) {
    console.error("suggested-tags.json not found.");
    process.exit(1);
  }

  const suggestedTags: Record<string, string[]> = JSON.parse(fs.readFileSync(suggestedTagsPath, 'utf8'));
  const skillsDir = path.resolve('docs/internal/intel-fixtures/skills');

  console.log("Initializing local intelligence provider...");
  const startLoad = performance.now();
  const provider = new LocalIntelligenceProvider();
  await provider.init();
  const endLoad = performance.now();
  console.log(`Model Load Latency (Cold Start): ${(endLoad - startLoad).toFixed(2)}ms`);

  let totalLatency = 0;
  let successCount = 0;
  const metrics: any[] = [];

  const keys = Object.keys(suggestedTags);
  const totalSkills = keys.length;

  console.log(`\nBenchmarking ${totalSkills} skills...`);

  // Try to use GC if available (bun run --expose-gc)
  if (global.gc) global.gc();
  const startMemory = process.memoryUsage().rss;

  for (const key of keys) {
    const skillPath = path.join(skillsDir, key, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, 'utf8');
    // Extract a naive description to pass to the tagger
    const lines = content.split('\n');
    let name = key.split('/').pop() || key;
    let description = '';
    
    for (const line of lines) {
      if (line.startsWith('# ')) name = line.replace('# ', '').trim();
      else if (line.startsWith('> ')) description = line.replace('> ', '').trim();
    }
    
    if (!description) description = content.slice(0, 200).replace(/\n/g, ' ');

    const startInference = performance.now();
    const generatedTags = await nlpDeriveTags(provider, name, description, { minConfidence: 0.25, maxTags: 5 });
    const endInference = performance.now();
    
    const latency = endInference - startInference;
    totalLatency += latency;

    const expectedTags = suggestedTags[key] || [];
    let overlap = 0;
    for (const tag of generatedTags) {
      if (expectedTags.includes(tag)) overlap++;
    }
    
    const accuracy = expectedTags.length > 0 ? overlap / expectedTags.length : 1;
    if (overlap > 0 || expectedTags.length === 0) successCount++;

    metrics.push({
      key,
      latency,
      generatedTags,
      expectedTags,
      overlap,
      accuracy
    });
  }

  const endMemory = process.memoryUsage().rss;
  const memoryDeltaMB = (endMemory - startMemory) / 1024 / 1024;

  const avgLatency = totalLatency / totalSkills;

  console.log("\n--- BENCHMARK RESULTS ---");
  console.log(`Total Skills Processed : ${totalSkills}`);
  console.log(`Average Latency        : ${avgLatency.toFixed(2)}ms / skill (Target < 100ms)`);
  console.log(`Peak Memory Delta      : ${memoryDeltaMB.toFixed(2)} MB (Target < 200MB)`);
  console.log(`At least 1 overlapping : ${(successCount / totalSkills * 100).toFixed(2)}% of skills`);

  if (avgLatency > 100) {
    console.error("\n❌ FAILED: Average latency exceeded 100ms budget.");
    process.exit(1);
  }
  if (memoryDeltaMB > 200) {
    console.error("\n❌ FAILED: Memory budget exceeded 200MB limit.");
    process.exit(1);
  }

  console.log("\n✅ ALL BENCHMARK BUDGETS MET.");
}

runBenchmark().catch(console.error);
