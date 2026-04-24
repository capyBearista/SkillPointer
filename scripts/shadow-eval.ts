import fs from 'fs';
import path from 'path';
import { LocalIntelligenceProvider } from '../opentui/src/core/intelligence/provider-local.js';
import { nlpDeriveTags } from '../opentui/src/core/intelligence/tagger.js';
import { deriveTagsWithOptions } from '../opentui/src/core/tags.js';

async function run() {
  const skillsDir = path.resolve('docs/internal/intel-fixtures/skills');
  const provider = new LocalIntelligenceProvider();
  await provider.init();

  // Test cases: Pick a few diverse skills
  const testCases = [
    'csharp-async',            // Should get csharp, async, etc.
    'react-best-practices',    // Should preserve react, practices, etc.
    'github-actions',          // Should get github, actions, devops
    'django-patterns',         // Should get django, patterns
    'docs-writer'              // Should find docs
  ];

  for (const name of testCases) {
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.log(`[SKIP] ${name} not found.`);
      continue;
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const description = content.slice(0, 300).replace(/\n/g, ' ');

    console.log(`\n=== Evaluating Skill: ${name} ===`);
    const tags = await nlpDeriveTags(provider, name, description, { body: content, maxTags: 10, minConfidence: 0.65 });
    
    // Pass through normalize to simulate actual end-to-end
    const finalTags = deriveTagsWithOptions(name, description, {
      maxTags: 10,
      provider: () => tags
    });
    
    console.log(`Raw NLP Tags Output:`, tags);
    console.log(`Final Tags (after resolution):`, finalTags);
  }
}

run();
