/**
 * Extraction Types
 * Types for metadata and concept extraction
 */

/**
 * Extracted metadata from content
 */
export interface ExtractedMetadata {
    summary: string;
    tags: string[];
    category: string;
    concepts: string[];       // Abstract concepts (e.g., 'Idempotency', 'Trade-offs')
    thinking_point: string;   // Aphorism/Insight (e.g., 'Reliability requires state tracking')
}

/**
 * Configuration for MetadataExtractor
 */
export interface MetadataExtractorConfig {
    enableAi: boolean;
    provider: 'ollama' | 'openai';
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiUrl?: string;
    openaiModel?: string;
    openaiApiKey?: string;
}

/**
 * Extracted concepts from content
 */
export interface ExtractedConcepts {
    concepts: string[];
    confidence: number;           // Overall confidence (0-1)
    conceptConfidences?: number[]; // Per-concept confidence (v0.6.0+)
}

/**
 * Configuration for ConceptExtractor
 */
export interface ConceptExtractionConfig {
    provider: 'ollama' | 'openai' | 'rules';
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    maxConcepts?: number;

    // v0.6.0 fields
    focusOnAbstractConcepts?: boolean;      // Prioritize abstract concepts
    minConfidence?: number;                 // Minimum confidence threshold
    excludeGenericConcepts?: string[];      // Blocklist of generic concepts
}
