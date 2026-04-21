import type { ScoredTag, IntelligenceProvider } from './provider-interface.js';
import { eng } from 'stopword';

export interface TaggerOptions {
  minConfidence?: number;
  maxTags?: number;
  body?: string;
}

// Combine the standard NLTK-style English stop-words with a few skillcat-specific terms
export const STOP_WORDS = new Set([
  ...eng,
  'skill', 'use', 'using', 'helps', 'helper'
]);

/**
 * Derives and normalizes tags using an NLP Intelligence Provider.
 */
export async function nlpDeriveTags(
  provider: IntelligenceProvider,
  name: string,
  description: string,
  options: TaggerOptions = {}
): Promise<string[]> {
  const minConfidence = options.minConfidence ?? 0.3; // Default threshold
  const maxTags = options.maxTags ?? 5;

  const rawScoredTags = await provider.deriveTags({ name, description, body: options.body, maxTags });

  const filteredTags = rawScoredTags
    .filter(t => t.score >= minConfidence)
    .map(t => t.tag)
    .map(t => normalizeTag(t))
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  // Deduplicate after normalization
  const uniqueTags = Array.from(new Set(filteredTags));

  return uniqueTags.slice(0, maxTags);
}

function normalizeTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
