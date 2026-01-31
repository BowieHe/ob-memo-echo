/**
 * VectorBackend - Abstract interface and utilities for vector storage
 * Provides abstraction for different vector storage implementations
 */

export type { VectorBackend, MultiVectorItem, SearchResult, SearchOptions } from '@core/types/vector';

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
 * RRF (Reciprocal Rank Fusion) implementation (synchronous version)
 * Used by backends that don't have native fusion support
 * 
 * Algorithm: Combines multiple ranked result sets using reciprocal rank fusion
 * Score = sum(1 / (k + rank + 1)) for each result across all result sets
 * 
 * @param resultSets - Array of result sets to fuse
 * @param limit - Maximum number of results to return
 * @param k - Constant parameter (default 60) to avoid division by zero
 * @returns Fused results sorted by score
 */
export function rrfFusionSync(
    resultSets: Array<Array<{ id: string; score: number; metadata: Record<string, any> }>>,
    limit: number,
    k: number = 60
): Array<{ id: string; score: number; metadata: Record<string, any> }> {
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

/**
 * Alias for compatibility - same as rrfFusionSync
 */
export function rrfFusion(
    resultSets: Array<Array<{ id: string; score: number; metadata: Record<string, any> }>>,
    limit: number,
    k: number = 60
): Array<{ id: string; score: number; metadata: Record<string, any> }> {
    return rrfFusionSync(resultSets, limit, k);
}

