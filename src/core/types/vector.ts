/**
 * Vector Storage Types
 * Core types for vector backend abstraction
 */

import type { VECTOR_NAMES } from '@core/constants';

/**
 * Multi-vector item for indexing with named vectors
 * Supports three named vectors: content_vec, summary_vec, title_vec
 */
export interface MultiVectorItem {
    id: string;
    vectors: Record<VECTOR_NAMES, number[]>;
    metadata: Record<string, any>;
}

/**
 * Search result from vector backend
 */
export interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}

/**
 * Search options for vector queries
 */
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

/**
 * Abstract interface for vector storage backends
 * Implementations: QdrantBackend, LanceDBBackend, etc.
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
