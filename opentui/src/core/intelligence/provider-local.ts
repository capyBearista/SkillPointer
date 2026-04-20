import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { IntelligenceProvider, ScoredTag } from './provider-interface.js';
import type { PredictedCategory } from './types.js';
import { TAG_DICTIONARY, type TagProviderContext } from '../tags.js';

env.allowLocalModels = true;

export class LocalIntelligenceProvider implements IntelligenceProvider {
  private extractor: FeatureExtractionPipeline | null = null;
  private isLoaded = false;
  private initPromise: Promise<void> | null = null;
  private staticTagsEmbedding: { tag: string; vector: Float32Array }[] = [];

  constructor(private modelId: string = 'Xenova/all-MiniLM-L6-v2') {}

  async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.extractor = await pipeline('feature-extraction', this.modelId, {
        quantized: true,
      });
      this.isLoaded = true;

      const staticTags = new Set<string>();
      for (const tags of Object.values(TAG_DICTIONARY)) {
        for (const t of tags) staticTags.add(t);
      }
      
      const staticTagsArray = Array.from(staticTags);
      if (staticTagsArray.length > 0) {
        const out = await this.extractor(staticTagsArray, { pooling: 'mean', normalize: true });
        const dim = out.dims[1];
        const data = out.data as Float32Array;
        for (let i = 0; i < staticTagsArray.length; i++) {
          const slice = new Float32Array(data.slice(i * dim, (i + 1) * dim));
          this.staticTagsEmbedding.push({ tag: staticTagsArray[i], vector: slice });
        }
      }
    })();

    await this.initPromise;
  }

  isReady(): boolean {
    return this.isLoaded && this.extractor !== null;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isReady()) await this.init();
    if (!this.extractor) throw new Error("Extractor pipeline not loaded.");

    const out = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data as Float32Array);
  }

  async predictCategory(name: string, description: string): Promise<PredictedCategory | undefined> {
    return undefined;
  }

  async deriveTags(context: TagProviderContext): Promise<ScoredTag[]> {
    if (!this.isReady()) await this.init();
    if (!this.extractor) throw new Error("Extractor pipeline not loaded.");

    const text = `${context.name}. ${context.description}`;
    
    const docOutput = await this.extractor(text, { pooling: 'mean', normalize: true });
    const docEmbedding = docOutput.data as Float32Array;
    const dim = docOutput.dims[1];

    // Build candidates: unigrams and bigrams
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);

    const candidates = new Set<string>();
    
    for (let i = 0; i < words.length; i++) {
      if (words[i].length >= 4) candidates.add(words[i]);
      if (i < words.length - 1) {
        candidates.add(`${words[i]}-${words[i+1]}`); // bigram
      }
    }

    const localCandidates = Array.from(candidates);
    const allCandidates: { tag: string; vector: Float32Array }[] = [...this.staticTagsEmbedding];

    if (localCandidates.length > 0) {
      const localOut = await this.extractor(localCandidates, { pooling: 'mean', normalize: true });
      const localData = localOut.data as Float32Array;
      for (let i = 0; i < localCandidates.length; i++) {
        const slice = new Float32Array(localData.slice(i * dim, (i + 1) * dim));
        allCandidates.push({ tag: localCandidates[i], vector: slice });
      }
    }

    const similarities = new Map<string, number>();
    
    for (const cand of allCandidates) {
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += docEmbedding[j] * cand.vector[j];
      }
      
      const existing = similarities.get(cand.tag) || 0;
      if (dot > existing) {
        similarities.set(cand.tag, dot);
      }
    }

    const results: ScoredTag[] = Array.from(similarities.entries())
      .map(([tag, score]) => ({ tag, score }))
      .sort((a, b) => b.score - a.score);

    return results;
  }
}
