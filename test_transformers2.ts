import { pipeline, env } from '@xenova/transformers';
import { TAG_DICTIONARY } from './opentui/src/core/tags.js';

env.allowLocalModels = false;

async function run() {
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  const text = "Deploy a containerized application to Azure App Service using the Azure CLI. Handles authentication and pushing to the registry.";
  
  const docOutput = await extractor(text, { pooling: 'mean', normalize: true });
  const docEmbedding = docOutput.data;
  
  // Build candidate set: text words + ALL dictionary terms
  const words = text.toLowerCase().replace(/[^a-z0-9-]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  let candidates = new Set(words);
  for (const tags of Object.values(TAG_DICTIONARY)) {
    tags.forEach(t => candidates.add(t));
  }
  const candArray = [...candidates];
  
  console.time('Embed Candidates');
  const candOutput = await extractor(candArray, { pooling: 'mean', normalize: true });
  console.timeEnd('Embed Candidates');
  
  const similarities = [];
  const dim = docOutput.dims[1];
  for (let i = 0; i < candArray.length; i++) {
    const candEmb = candOutput.data.slice(i * dim, (i + 1) * dim);
    let dot = 0;
    for (let j = 0; j < dim; j++) {
      dot += docEmbedding[j] * candEmb[j];
    }
    similarities.push({ tag: candArray[i], score: dot });
  }
  
  similarities.sort((a, b) => b.score - a.score);
  console.log(similarities.slice(0, 5));
}
run();
