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
    dimension?: number;  // Vector dimension for the model
}

/**
 * Default dimensions for common embedding models
 */
export const MODEL_DIMENSIONS: Record<string, number> = {
    // Ollama models
    'bge-m3:latest': 1024,
    'nomic-embed-text': 768,
    'all-MiniLM-L6-v2': 384,
    'mxbai-embed-large-v1': 1024,
    'llama2:7b': 4096,

    // OpenAI models
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
};

/**
 * Result of batch embedding operation
 */
export interface BatchEmbeddingResult {
    successful: number[][];
    failed: Array<{ index: number; error: Error }>;
}
