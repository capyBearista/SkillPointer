import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { IntelligenceProvider, ScoredTag } from './provider-interface.js';
import type { PredictedCategory } from './types.js';
import { TAG_DICTIONARY, type TagProviderContext } from '../tags.js';
import { STOP_WORDS } from './tagger.js';

env.allowLocalModels = true;

export class LocalIntelligenceProvider implements IntelligenceProvider {
  private extractor: FeatureExtractionPipeline | null = null;
  private isLoaded = false;
  private initPromise: Promise<void> | null = null;
  private staticTagsEmbedding: { tag: string; vector: Float32Array }[] = [];

  constructor(private modelId: string = 'Snowflake/snowflake-arctic-embed-xs') {}

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

    // Truncate the body to ~2500 characters so tokenization doesn't waste CPU on thousands of words
    // that will ultimately be truncated by the 512 token model limit.
    const bodyText = context.body ? context.body.slice(0, 2500) : '';
    const text = `${context.name}. ${context.description}${bodyText ? `\n\n${bodyText}` : ''}`;
    
    const docOutput = await this.extractor(text, { pooling: 'mean', normalize: true });
    const docEmbedding = docOutput.data as Float32Array;
    const dim = docOutput.dims[1];

    // Source candidates from the first 1,000 characters of the body.
    // This creates a "wide net" of technical candidates for future LLM oracle evaluation
    // without overflowing the batch sizes and blowing the memory/latency budget.
    const candidateBodyText = context.body ? context.body.slice(0, 1000) : '';
    const candidateText = `${context.name}. ${context.description}${candidateBodyText ? `\n\n${candidateBodyText}` : ''}`;

    // Build candidates: unigrams and bigrams
    const words = candidateText
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    const candidates = new Set<string>();
    
    for (let i = 0; i < words.length; i++) {
      if (words[i].length >= 4) candidates.add(words[i]);
      if (i < words.length - 1) {
        candidates.add(`${words[i]}-${words[i+1]}`); // bigram
      }
    }

    const localCandidates = Array.from(candidates).filter(c => isValidCandidate(c, context.name));
    const allCandidates: { tag: string; vector: Float32Array }[] = [...this.staticTagsEmbedding];

    if (localCandidates.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < localCandidates.length; i += BATCH_SIZE) {
        const batch = localCandidates.slice(i, i + BATCH_SIZE);
        const localOut = await this.extractor(batch, { pooling: 'mean', normalize: true });
        const localData = localOut.data as Float32Array;
        for (let j = 0; j < batch.length; j++) {
          const slice = new Float32Array(localData.slice(j * dim, (j + 1) * dim));
          allCandidates.push({ tag: batch[j], vector: slice });
        }
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

/**
 * Pre-filter candidates to reject obviously bad tags before wasting embedding compute.
 */
function isValidCandidate(tag: string, skillName: string): boolean {
  // 1. Reject exact matches to the skill name (e.g., "fastapi-templates" tag for "fastapi-templates" skill)
  const normalizedName = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const normalizedTag = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (normalizedTag === normalizedName) return false;
  
  // 2. Reject tags that are just the name with a suffix/prefix (e.g., "fastapi-templates-create")
  if (normalizedTag.startsWith(normalizedName + '-') || normalizedTag.endsWith('-' + normalizedName)) return false;
  
  // 3. Reject overly long tags (>5 words in kebab-case)
  const wordCount = tag.split('-').filter(w => w.length > 0).length;
  if (wordCount > 5) return false;
  
  // 4. Reject gibberish: excessive repeated non-alphanumeric characters
  const gibberishMatch = tag.match(/[-_]{3,}/);
  if (gibberishMatch) return false;
  
  // 5. Reject tags starting or ending with hyphens (formatting artifacts)
  if (tag.startsWith('-') || tag.endsWith('-')) return false;
  
  // 6. Reject repeated words (e.g., "lark-shared-lark-shared", "kubernetes-kubernetes")
  const words = tag.split('-').filter(w => w.length > 0);
  if (words.length !== new Set(words).size) return false;
  
  // 7. Reject pure numeric or overly short tags
  if (/^\d+$/.test(tag) || tag.length < 3) return false;
  
  return true;
}
