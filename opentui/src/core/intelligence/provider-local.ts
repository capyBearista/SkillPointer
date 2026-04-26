import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import type { IntelligenceProvider, ScoredTag } from './provider-interface.js';
import type { PredictedCategory } from './types.js';
import { TAG_DICTIONARY, type TagProviderContext, STOP_WORDS } from '../tags.js';
import { DOMAIN_HEURISTICS } from '../categorization.js';

env.allowLocalModels = true;

export class LocalIntelligenceProvider implements IntelligenceProvider {
  private extractor: FeatureExtractionPipeline | null = null;
  private isLoaded = false;
  private initPromise: Promise<void> | null = null;
  private staticTagsEmbedding: { tag: string; parentKey: string; vector: Float32Array }[] = [];
  private staticCategoryEmbeddings: { category: string; vector: Float32Array }[] = [];

  constructor(private modelId: string = 'Snowflake/snowflake-arctic-embed-xs') {}

  async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.extractor = await pipeline('feature-extraction', this.modelId, {
        quantized: true,
      });
      this.isLoaded = true;

      const uniqueAliases = new Map<string, string>();
      for (const [parentKey, tags] of Object.entries(TAG_DICTIONARY)) {
        if (!uniqueAliases.has(parentKey)) uniqueAliases.set(parentKey, parentKey);
        for (const t of tags) {
          if (!uniqueAliases.has(t)) uniqueAliases.set(t, parentKey);
        }
      }
      
      const staticTagsArray = Array.from(uniqueAliases.keys());
      if (staticTagsArray.length > 0) {
        const out = await this.extractor(staticTagsArray, { pooling: 'mean', normalize: true, truncation: true } as any);
        const dim = out.dims[1];
        const data = out.data as Float32Array;
        for (let i = 0; i < staticTagsArray.length; i++) {
          const slice = new Float32Array(data.slice(i * dim, (i + 1) * dim));
          const parentKey = uniqueAliases.get(staticTagsArray[i])!;
          this.staticTagsEmbedding.push({ tag: staticTagsArray[i], parentKey, vector: slice });
        }
      }

      // New Category Centroid Generation
      const categoryExemplars: Record<string, string[]> = {
        security: ["web application security", "vulnerability scanning and penetration testing", "authentication and authorization oauth jwt"],
        "code-review": ["automated code review", "static analysis and linting", "github pull request reviewer"],
        git: ["version control system", "git commit branch rebase", "github repository management"],
        "ai-ml": ["artificial intelligence and machine learning", "large language models llm", "prompt engineering and agents"],
        "web-dev": ["frontend web development", "react angular vue ui framework", "html css javascript"],
        "backend-dev": ["backend server development", "rest api graphql", "express django fastapi"],
        devops: ["cloud infrastructure deployment", "docker kubernetes containerization", "continuous integration ci cd pipeline"],
        database: ["sql and nosql databases", "relational database schema", "data storage and orm"],
        automation: ["workflow automation scripts", "web scraping and browser automation", "bot and selenium testing"],
        design: ["user interface ui ux design", "figma vector graphics svg", "motion animation graphics"],
        programming: ["software engineering and data structures", "general purpose programming languages", "algorithms and performance"],
        "mobile-dev": ["ios and android mobile app development", "react native flutter cross platform", "swift and kotlin"],
        "data-engineering": ["data science and analytics", "machine learning data pipelines", "pandas spark big data processing"],
        productivity: ["team collaboration and communication", "project management workflow", "knowledge base and documentation tools"]
      };

      const allExemplars: { category: string; text: string }[] = [];
      for (const cat of Object.keys(DOMAIN_HEURISTICS)) {
        let exemplars = categoryExemplars[cat];
        if (!exemplars) {
          exemplars = [`${cat} related tools`, `${cat} software engineering`, `general ${cat} domain`];
        }
        for (const text of exemplars) {
          allExemplars.push({ category: cat, text });
        }
      }

      if (allExemplars.length > 0) {
        const out = await this.extractor(allExemplars.map(e => e.text), { pooling: 'mean', normalize: true, truncation: true } as any);
        const dim = out.dims[1];
        const data = out.data as Float32Array;
        
        for (let i = 0; i < allExemplars.length; i++) {
          const exemplarVector = new Float32Array(data.slice(i * dim, (i + 1) * dim));
          this.staticCategoryEmbeddings.push({ category: allExemplars[i].category, vector: exemplarVector });
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

    const out = await this.extractor(text, { pooling: 'mean', normalize: true, truncation: true } as any);
    return Array.from(out.data as Float32Array);
  }

  async predictCategory(name: string, description: string, body?: string): Promise<PredictedCategory | undefined> {
    if (!this.isReady()) await this.init();
    if (!this.extractor) throw new Error("Extractor pipeline not loaded.");

    if (this.staticCategoryEmbeddings.length === 0) return undefined;

    const truncatedBody = body ? body.slice(0, 1500) : '';
    const text = `${name}. ${name}. ${name}. ${description}. ${truncatedBody}`;
    
    const out = await this.extractor(text, { pooling: 'mean', normalize: true, truncation: true } as any);
    const data = out.data as Float32Array;
    const dim = out.dims[1];

    const similarities: { name: string; confidence: number }[] = [];

    for (const cat of this.staticCategoryEmbeddings) {
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += data[j] * cat.vector[j];
      }
      similarities.push({ name: cat.category, confidence: dot });
    }

    similarities.sort((a, b) => b.confidence - a.confidence);

    // K-Nearest Neighbors aggregation (K=5)
    const K = 5;
    const topK = similarities.slice(0, K);
    
    const categoryScores = new Map<string, { sum: number, max: number }>();
    for (const match of topK) {
      const current = categoryScores.get(match.name) || { sum: 0, max: -Infinity };
      categoryScores.set(match.name, {
        sum: current.sum + match.confidence,
        max: Math.max(current.max, match.confidence)
      });
    }

    const aggregatedScores = Array.from(categoryScores.entries())
      .map(([name, stats]) => ({ name, confidence: stats.max, sum: stats.sum }))
      .sort((a, b) => {
        if (b.sum !== a.sum) {
          return b.sum - a.sum;
        }
        // Deterministic tie-breaking
        return a.name.localeCompare(b.name);
      });

    const top = aggregatedScores[0];
    const alternatives = aggregatedScores.slice(1, 3).map(a => ({ name: a.name, confidence: a.confidence }));

    return {
      name: top.name,
      confidence: top.confidence,
      alternatives
    };
  }

  async deriveTags(context: TagProviderContext): Promise<ScoredTag[]> {
    if (!this.isReady()) await this.init();
    if (!this.extractor) throw new Error("Extractor pipeline not loaded.");

    // Truncate the body to ~2500 characters so tokenization doesn't waste CPU on thousands of words
    // that will ultimately be truncated by the 512 token model limit.
    const bodyText = context.body ? context.body.slice(0, 2500) : '';
    const text = `${context.name}. ${context.description}${bodyText ? `\n\n${bodyText}` : ''}`;
    
    const docOutput = await this.extractor(text, { pooling: 'mean', normalize: true, truncation: true } as any);
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
      .filter(w => w.length > 0 && !STOP_WORDS.has(w));

    const candidates = new Set<string>();
    
    for (let i = 0; i < words.length; i++) {
      if (words[i].length >= 3) candidates.add(words[i]);
      if (i < words.length - 1) {
        candidates.add(`${words[i]}-${words[i+1]}`); // bigram
      }
    }

    const localCandidates = Array.from(candidates).filter(c => isValidCandidate(c, context.name));
    const allCandidates: { tag: string; parentKey: string; vector: Float32Array }[] = [...this.staticTagsEmbedding];

    if (localCandidates.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < localCandidates.length; i += BATCH_SIZE) {
        const batch = localCandidates.slice(i, i + BATCH_SIZE);
        const localOut = await this.extractor(batch, { pooling: 'mean', normalize: true, truncation: true } as any);
        const localData = localOut.data as Float32Array;
        for (let j = 0; j < batch.length; j++) {
          const slice = new Float32Array(localData.slice(j * dim, (j + 1) * dim));
          allCandidates.push({ tag: batch[j], parentKey: batch[j], vector: slice });
        }
      }
    }

    const similarities = new Map<string, number>();
    
    for (const cand of allCandidates) {
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += docEmbedding[j] * cand.vector[j];
      }
      
      const existing = similarities.get(cand.parentKey) || 0;
      if (dot > existing) {
        similarities.set(cand.parentKey, dot);
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
  
  // 2. Reject tags that are just meaningless structural prefixes
  const meaninglessPrefixes = ['use-', 'skill-', 'plugin-', 'app-', 'lib-', 'name-', 'description-', 'tags-'];
  if (meaninglessPrefixes.some(p => normalizedTag === p + normalizedName)) return false;
  
  const meaninglessSuffixes = ['-description', '-name', '-tags', '-skill'];
  if (meaninglessSuffixes.some(s => normalizedTag === normalizedName + s)) return false;
  
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
