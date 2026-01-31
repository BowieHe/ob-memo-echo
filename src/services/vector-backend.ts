/**
 * VectorBackend - Abstract interface for vector storage backends
 * v0.5.0: Supports both Qdrant and LanceDB
 */

import { VECTOR_NAMES, DEFAULT_WEIGHTS, RRF_K } from '@core/constants';

// Multi-vector item for indexing
export interface MultiVectorItem {
    id: string;
    vectors: Record<VECTOR_NAMES, number[]>;
    metadata: Record<string, any>;
}

// Search result
export interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}

// Search options
export interface SearchOptions {
    limit?: number;
    weights?: {
        content?: number;
        summary?: number;
        title?: number;
    };
    filter?: {
        tags?: string[];
    };
}

// Re-export constants for convenience
export { VECTOR_NAMES, DEFAULT_WEIGHTS } from '@core/constants';

/**
 * Abstract interface for vector storage backends
 */
export interface VectorBackend {
    /**
     * Initialize the backend (create tables/collections if needed)
     */
    initialize(): Promise<void>;

    /**
     * Insert or update with multiple named vectors
     */
    upsertMultiVector(item: MultiVectorItem): Promise<void>;

    /**
     * Search with Named Vectors fusion (RRF)
     */
    searchWithFusion(
        queryVector: number[],
        options?: SearchOptions
    ): Promise<SearchResult[]>;

    /**
     * Delete by chunk ID
     */
    delete(id: string): Promise<void>;

    /**
     * Delete all chunks for a file
     */
    deleteByFilePath(filePath: string): Promise<void>;

    /**
     * Get total count of vectors
     */
    count(): Promise<number>;

    /**
     * Clear all data
     */
    clear(): Promise<void>;
}

/**
 * Simple UUID v4 generator (shared utility)
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * RRF (Reciprocal Rank Fusion) implementation
 * Used by backends that don't have native fusion support
 */
export function rrfFusion(
    resultSets: Array<Array<{ id: string; score: number; metadata: Record<string, any> }>>,
    limit: number,
    k: number = RRF_K
): SearchResult[] {
    const scores = new Map<string, { score: number; metadata: Record<string, any> }>();

    for (const results of resultSets) {
        results.forEach((item, rank) => {
            const rrfScore = 1 / (k + rank + 1);
            const existing = scores.get(item.id);
            if (existing) {
                existing.score += rrfScore;
            } else {
                scores.set(item.id, { score: rrfScore, metadata: item.metadata });
            }
        });
    }

    return Array.from(scores.entries())
        .map(([id, data]) => ({ id, score: data.score, metadata: data.metadata }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
