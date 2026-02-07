/**
 * Search Service - Search for related notes using Qdrant
 * v0.7.0: Focused on searching, independent of Concept/Index services
 */

import type { VectorBackend } from './vector-backend';
import { EmbeddingService } from './embedding-service';

export interface SearchResult {
    notePath: string;
    title: string;
    similarity: number;
    excerpt?: string;
}

export class SearchService {
    constructor(
        private embeddingService: EmbeddingService,
        private vectorBackend: VectorBackend
    ) {}

    /**
     * Search for related notes based on query text
     * @param query - Search query (concept/summary/title)
     * @param excludePath - File path to exclude (e.g., current file)
     * @param limit - Number of results to return
     */
    async search(
        query: string,
        excludePath?: string,
        limit: number = 10
    ): Promise<SearchResult[]> {
        // 1. Vectorize query
        const queryVector = await this.embeddingService.embed(query);

        // 2. Search using vector backend's searchWithFusion method
        const backendResults = await this.vectorBackend.searchWithFusion(queryVector, {
            limit,
            filter: excludePath ? { tags: undefined } : undefined // Note: current backend doesn't support path filtering
        });

        // 3. Filter out excluded path and format results
        const results = backendResults
            .filter(r => r.metadata.filePath !== excludePath)
            .slice(0, limit)
            .map(r => ({
                notePath: r.metadata.filePath,
                title: r.metadata.header_path || r.metadata.filePath.split('/').pop() || r.metadata.filePath,
                similarity: r.score,
                excerpt: r.metadata.summary || r.metadata.content?.slice(0, 100)
            }))
            .sort((a, b) => b.similarity - a.similarity); // Descending by similarity

        return results;
    }

    /**
     * Find related notes based on current file (using summary + title)
     */
    async findRelatedNotes(
        currentFilePath: string,
        summary: string,
        title: string,
        limit: number = 10
    ): Promise<SearchResult[]> {
        const query = `${title}\n${summary}`;
        return this.search(query, currentFilePath, limit);
    }
}
