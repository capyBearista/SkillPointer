import { TagProviderContext } from "../tags.js";
import { PredictedCategory } from "./types.js";

/**
 * Interface for async capable NLP tag providers
 */
export type TagProviderAsync = (context: TagProviderContext) => Promise<string[]>;

export interface ScoredTag {
  tag: string;
  score: number;
}

export interface IntelligenceProvider {
  /**
   * Derive semantically relevant tags
   */
  deriveTags(context: TagProviderContext): Promise<ScoredTag[]>;
  
  /**
   * Predict the category for a skill based on its content
   */
  predictCategory(name: string, description: string, body?: string): Promise<PredictedCategory | undefined>;

  /**
   * Generates an embedding vector for semantic search
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Whether the provider is available and ready for inference
   */
  isReady(): boolean;
}
