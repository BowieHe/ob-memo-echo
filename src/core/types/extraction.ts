/**
 * Extraction Types
 * Types for metadata and concept extraction
 */

/**
 * Language options for concept extraction
 * v0.8.1: Language adaptation for concept extraction
 */
export type ConceptLanguage = 'auto' | 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

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

export interface ExtractedConceptDetail {
    name: string;
    confidence: number;
    reason: string;
}

export interface DetailedConceptExtraction {
    concepts: ExtractedConceptDetail[];
    noteType: 'article' | 'vocabulary' | 'daily' | 'image-collection' | 'template' | 'normal';
    skipReason: string | null;
}

/**
 * Configuration for ConceptExtractor
 */
export interface ConceptExtractionConfig {
    // provider: 'ollama' | 'openai' | 'rules';
    // ollamaUrl?: string;
    // ollamaModel?: string;
    // ollamaNumPredict?: number;
    // openaiApiKey?: string;
    // openaiModel?: string;
    maxConcepts?: number;

    // v0.6.0 fields
    focusOnAbstractConcepts?: boolean;      // Prioritize abstract concepts
    minConfidence?: number;                 // Minimum confidence threshold
    excludeGenericConcepts?: string[];      // Blocklist of generic concepts

    // v0.8.1: Language adaptation
    language?: ConceptLanguage;
}
