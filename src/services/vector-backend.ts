/**
 * VectorBackend - Abstract interface for vector storage backends
 * v0.5.0: Supports both Qdrant and LanceDB
 */

import { VECTOR_NAMES, RRF_K } from '@core/constants';
import type { SearchResult } from '@core/types/vector';

// Re-export types from core/types/vector
export type {
    MultiVectorItem,
    SearchResult,
    SearchOptions,
    VectorBackend
} from '@core/types/vector';

// Re-export constants for convenience
export { VECTOR_NAMES, DEFAULT_WEIGHTS } from '@core/constants';

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
