/**
 * Concept Registry Types
 * Types for concept deduplication and matching using Qdrant vector storage
 */

/**
 * Concept record stored in Qdrant
 */
export interface ConceptRecord {
    concept: string;                      // Standardized concept name (unique identifier)
    summary: string;                      // 30-50 character summary
    link: string;                         // wikilink format [[_me/xxx]]
    noteCount: number;                    // Number of notes associated with this concept
    firstSeenAt: string;                  // First appearance timestamp
    lastUsedAt: string;                   // Last usage timestamp
    [key: string]: unknown;               // Index signature for Qdrant compatibility
}

/**
 * Qdrant payload for concept
 */
export interface ConceptPayload extends ConceptRecord {
    type: 'concept';
}

/**
 * Concept match result
 */
export interface ConceptMatchResult {
    matched: boolean;                     // Whether a match was found
    concept: string;                      // Final concept name used (may be matched)
    summary: string;                      // Concept summary
    similarity: number;                   // Similarity score
    isNew: boolean;                       // Whether this is a new concept
}

/**
 * Concept registry options
 */
export interface ConceptRegistryOptions {
    similarityThreshold?: number;         // Similarity threshold, default 0.85
    updateSummary?: boolean;              // Whether to update existing concept summaries
    conceptPagePrefix?: string;           // Concept page prefix, default '_me'
}
