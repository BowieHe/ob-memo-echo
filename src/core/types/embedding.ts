/**
 * Embedding Types
 * Configuration and interfaces for embedding generation
 */

export type EmbeddingProvider = 'local' | 'ollama' | 'openai';

/**
 * Configuration for EmbeddingService
 */
export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
}

/**
 * Result of batch embedding operation
 */
export interface BatchEmbeddingResult {
    successful: number[][];
    failed: Array<{ index: number; error: Error }>;
}
