/**
 * Types for Intelligence Data Contracts
 */

export interface PredictedCategory {
  name: string;
  confidence: number;
  alternatives?: Array<{
    name: string;
    confidence: number;
  }>;
}

export interface IntelligenceMetadata {
  name: string;
  descriptionHash: string;
  contentHash: string;
  tags: string[];
  tagScores?: Record<string, number>;
  predictedCategory?: PredictedCategory;
  embedding?: {
    ref: string;
  };
  lastComputedAt: string;
  source: {
    provider: "local-ml" | "heuristic";
    fallbackUsed: boolean;
  };
}

export interface IntelligenceIndex {
  version: number;
  model: {
    id: string;
    revision: string;
    dim: number;
  };
  updatedAt: string;
  skills: Record<string, IntelligenceMetadata>;
}
