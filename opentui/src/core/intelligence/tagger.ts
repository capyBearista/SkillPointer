import type { ScoredTag, IntelligenceProvider } from './provider-interface.js';
import { STOP_WORDS, normalizeTag } from '../tags.js';

export interface TaggerOptions {
  minConfidence?: number;
  maxTags?: number;
  body?: string;
}

/**
 * Derives and normalizes tags using an NLP Intelligence Provider.
 */
export async function nlpDeriveTags(
  provider: IntelligenceProvider,
  name: string,
  description: string,
  options: TaggerOptions = {}
): Promise<string[]> {
  const minConfidence = options.minConfidence ?? 0.65; // Default threshold
  const maxTags = options.maxTags ?? 10;

  const rawScoredTags = await provider.deriveTags({ name, description, body: options.body, maxTags });

  const filteredTags = rawScoredTags
    .filter(t => t.score >= minConfidence)
    .map(t => t.tag)
    .map(t => normalizeTag(t))
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  // Deduplicate after normalization
  const uniqueTags = Array.from(new Set(filteredTags));

  return uniqueTags.slice(0, maxTags);
}
