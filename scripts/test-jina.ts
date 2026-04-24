import { pipeline, env } from '@xenova/transformers';
env.allowLocalModels = true;
async function run() {
  const extractor = await pipeline('feature-extraction', 'Xenova/jina-embeddings-v2-small-en', { quantized: true });
  const text = "test ".repeat(10000); // 10000 words, way over 8192 tokens
  console.log("Extracting long text...");
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  console.log("Output shape:", out.dims);
  console.log("Success!");
}
run();
