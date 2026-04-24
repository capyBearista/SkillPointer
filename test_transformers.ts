import { pipeline, env } from '@xenova/transformers';

// Suppress local model warnings if not found (will download)
env.allowLocalModels = false;

async function run() {
  console.time('Load Model');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });
  console.timeEnd('Load Model');
  
  const text = "Deploy a containerized application to Azure App Service using the Azure CLI. Handles authentication and pushing to the registry.";
  
  console.time('Embed Doc');
  const docOutput = await extractor(text, { pooling: 'mean', normalize: true });
  const docEmbedding = docOutput.data;
  console.timeEnd('Embed Doc');
  
  // Simple extraction of candidates from text
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const candidates = [...new Set(words)]; // unique
  
  console.time('Embed Candidates');
  const candOutput = await extractor(candidates, { pooling: 'mean', normalize: true });
  console.timeEnd('Embed Candidates');
  
  const similarities = [];
  const dim = docOutput.dims[1];
  for (let i = 0; i < candidates.length; i++) {
    const candEmb = candOutput.data.slice(i * dim, (i + 1) * dim);
    let dot = 0;
    for (let j = 0; j < dim; j++) {
      dot += docEmbedding[j] * candEmb[j];
    }
    similarities.push({ tag: candidates[i], score: dot });
  }
  
  similarities.sort((a, b) => b.score - a.score);
  console.log(similarities.slice(0, 5));
}
run();
