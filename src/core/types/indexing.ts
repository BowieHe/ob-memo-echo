/**
 * Indexing Types
 * Types for chunking, caching, and persistence
 */

import type { VECTOR_NAMES } from '@core/constants';

/**
 * Markdown header with level information
 */
export interface Header {
    level: number;
    text: string;
    position: number;
}

/**
 * Chunked content result from Markdown
 */
export interface ChunkResult {
    content: string;
    headers: Array<{ level: number; text: string }>;
    index: number;
    startPos: number;
    endPos: number;
    start_line: number;      // 1-indexed line number where chunk starts
    end_line: number;        // 1-indexed line number where chunk ends
    header_path: string;     // Formatted header hierarchy (e.g., "# H1 > ## H2")
}

/**
 * Configuration for Chunker
 */
export interface ChunkerConfig {
    minChunkSize?: number;
    maxChunkSize?: number;
    overlapSize?: number;
}

/**
 * Chunk cached in memory
 */
export interface CachedChunk {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
    timestamp: number;
}

/**
 * Legacy single-vector queued chunk (for backwards compatibility)
 */
export interface QueuedChunk {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

/**
 * Multi-vector queued chunk (current implementation)
 */
export interface MultiVectorQueuedChunk {
    id: string;
    vectors: {
        [VECTOR_NAMES.CONTENT]: number[];
        [VECTOR_NAMES.SUMMARY]: number[];
        [VECTOR_NAMES.TITLE]: number[];
    };
    metadata: Record<string, any>;
}

/**
 * Configuration for PersistQueue
 */
export interface PersistQueueConfig {
    batchSize?: number;
    flushInterval?: number; // milliseconds
    useMultiVector?: boolean;
}

/**
 * Statistics for PersistQueue
 */
export interface QueueStats {
    size: number;
    totalFlushed: number;
    flushCount: number;
    failedFlushes: number;
}
