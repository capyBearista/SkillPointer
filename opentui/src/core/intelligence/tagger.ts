import type { ScoredTag, IntelligenceProvider } from './provider-interface.js';

export interface TaggerOptions {
  minConfidence?: number;
  maxTags?: number;
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'when', 'then', 'skill', 'use', 'using', 'into', 'your', 'their', 'about', 'across', 'helps', 'helper'
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

  const rawScoredTags = await provider.deriveTags({ name, description, maxTags });

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
