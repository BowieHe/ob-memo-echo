/**
 * VectorIndexManager - Orchestrates indexing, caching, and persistence
 * v0.5.0: Uses VectorBackend interface for multi-backend support
 */

import { MemoryCache, CachedChunk } from './memory-cache';
import { PersistQueue, MultiVectorQueuedChunk } from './persist-queue';
import type { VectorBackend, SearchResult } from './vector-backend';
import { VECTOR_NAMES } from '@core/constants';
import { EmbeddingService } from './embedding-service';
import { Chunker, ChunkResult } from './chunker';
import { MetadataExtractor } from './metadata-extractor';
import { SimpleAssociationEngine } from './association-engine';

export class VectorIndexManager {
    private memoryCache: MemoryCache;
    private persistQueue: PersistQueue;
    private backend: VectorBackend;
    private embeddingService: EmbeddingService;
    private chunker: Chunker;
    private metadataExtractor: MetadataExtractor;
    private associationEngine?: SimpleAssociationEngine; // v0.6.0: Optional association engine

    constructor(
        backend: VectorBackend,
        embeddingService: EmbeddingService,
        chunker: Chunker,
        metadataExtractor: MetadataExtractor,
        cacheSize: number = 50 * 1024 * 1024, // 50MB default
        associationEngine?: SimpleAssociationEngine // v0.6.0: Optional association engine
    ) {
        this.backend = backend;
        this.embeddingService = embeddingService;
        this.chunker = chunker;
        this.metadataExtractor = metadataExtractor;
        this.associationEngine = associationEngine;

        this.memoryCache = new MemoryCache(cacheSize);
        this.persistQueue = new PersistQueue(backend, {
            batchSize: 50,
            flushInterval: 30000,
            useMultiVector: true,
        });
    }

    /**
     * Index a file
     */
    async indexFile(filePath: string, content: string): Promise<void> {
        console.log('[MemoEcho] Index start:', filePath);

        // Chunk the content
        const chunks = this.chunker.chunk(content);
        console.log('[MemoEcho] Chunk count:', chunks.length, 'Content length:', content.length);

        for (const chunk of chunks) {
            try {
                if (chunks.length <= 3 || chunk.index === 0) {
                    console.log('[MemoEcho] Indexing chunk', chunk.index, 'len', chunk.content.length, 'header', chunk.header_path || '');
                }
                await this.indexChunk(filePath, chunk);
            } catch (error) {
                console.error('[MemoEcho] Failed indexing chunk', chunk.index, 'for', filePath, error);
                throw error;
            }
        }
        console.log('[MemoEcho] Index finished:', filePath);

        // v0.6.0: Update association engine if available
        if (this.associationEngine) {
            try {
                // Extract title from file path (remove extension)
                const title = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath;

                await this.associationEngine.indexNote(filePath, content, title);
                console.log(`🔗 Updated association index for: ${filePath}`);
            } catch (error) {
                console.warn(`Failed to update association index for ${filePath}:`, error);
            }
        }
    }

    /**
     * Index a single chunk with Named Vectors (v0.4.0)
     * Generates three embeddings: content, summary, title
     */
    private async indexChunk(filePath: string, chunk: ChunkResult): Promise<void> {
        const chunkId = `${filePath}-chunk-${chunk.index}`;

        // Extract metadata first (to get summary)
        const extractedMetadata = await this.metadataExtractor.extract(chunk.content);

        // Generate three embeddings in parallel
        const [contentEmbedding, summaryEmbedding, titleEmbedding] = await Promise.all([
            this.embeddingService.embed(chunk.content),
            this.embeddingService.embed(extractedMetadata.summary || chunk.content.slice(0, 200)),
            this.embeddingService.embed(chunk.header_path || filePath),
        ]);

        // Simplified payload (v0.4.0)
        const payload = {
            filePath,
            header_path: chunk.header_path,
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            content: chunk.content,
            summary: extractedMetadata.summary,
            tags: [
                ...extractedMetadata.tags,
                extractedMetadata.category, // Merge category into tags
            ].filter(Boolean),
            word_count: chunk.content.length,
            indexedAt: Date.now(),
        };

        // Create cached chunk (use content embedding for cache search)
        const cachedChunk: CachedChunk = {
            id: chunkId,
            content: chunk.content,
            embedding: contentEmbedding,
            metadata: payload,
            timestamp: Date.now(),
        };

        // Add to cache
        this.memoryCache.set(chunkId, cachedChunk);

        // Add to multi-vector persist queue
        const queuedChunk: MultiVectorQueuedChunk = {
            id: chunkId,
            vectors: {
                [VECTOR_NAMES.CONTENT]: contentEmbedding,
                [VECTOR_NAMES.SUMMARY]: summaryEmbedding,
                [VECTOR_NAMES.TITLE]: titleEmbedding,
            },
            metadata: payload,
        };

        this.persistQueue.enqueueMultiVector(queuedChunk);
    }

    /**
     * Search across cache and vector store with Named Vectors fusion (v0.4.0)
     */
    async search(
        query: string,
        options: { limit?: number; tags?: string[] } = {}
    ): Promise<SearchResult[]> {
        const limit = options.limit || 10;

        // Generate query embedding
        const queryEmbedding = await this.embeddingService.embed(query);

        // Search in cache
        const cacheResults = this.searchInCache(queryEmbedding, limit);

        // Search in vector store with fusion (v0.5.0)
        const storeResults = await this.backend.searchWithFusion(queryEmbedding, {
            limit,
            filter: options.tags ? { tags: options.tags } : undefined,
        });

        // Combine and deduplicate results
        const combinedResults = this.combineResults(cacheResults, storeResults, limit);

        return combinedResults;
    }

    async ensureBackendReady(): Promise<void> {
        if (typeof (this.backend as any).ensureReady === 'function') {
            await (this.backend as any).ensureReady();
        }
    }

    /**
     * Search in memory cache
     */
    private searchInCache(queryEmbedding: number[], limit: number): SearchResult[] {
        const allCached = this.memoryCache.getAll();

        // Calculate cosine similarity for each cached chunk
        const results: SearchResult[] = allCached.map(chunk => ({
            id: chunk.id,
            score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
            metadata: chunk.metadata,
        }));

        // Sort by score and limit
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Combine and deduplicate results from cache and store
     */
    private combineResults(
        cacheResults: SearchResult[],
        storeResults: SearchResult[],
        limit: number
    ): SearchResult[] {
        const resultMap = new Map<string, SearchResult>();

        // Add cache results (prioritize cache)
        for (const result of cacheResults) {
            resultMap.set(result.id, result);
        }

        // Add store results (only if not in cache)
        for (const result of storeResults) {
            if (!resultMap.has(result.id)) {
                resultMap.set(result.id, result);
            }
        }

        // Sort by score and limit
        return Array.from(resultMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Calculate cosine similarity
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    /**
     * Flush persist queue to vector store (v0.4.0: uses multi-vector)
     */
    async flush(): Promise<void> {
        await this.persistQueue.flushMultiVector();
    }

    /**
     * Handle file save event
     */
    async onFileSave(filePath: string): Promise<void> {
        // Flush chunks for this file
        const fileChunks = this.persistQueue.getByFilePath(filePath);

        if (fileChunks.length > 0) {
            await this.persistQueue.flushMultiVector();
        }
    }

    /**
     * Remove file from cache and queue
     */
    removeFile(filePath: string): void {
        this.memoryCache.deleteByFilePath(filePath);
        this.persistQueue.removeByFilePath(filePath);

        // v0.6.0: Remove from association engine if available
        if (this.associationEngine) {
            try {
                this.associationEngine.removeNote(filePath);
                console.log(`🔗 Removed from association index: ${filePath}`);
            } catch (error) {
                console.warn(`Failed to remove from association index for ${filePath}:`, error);
            }
        }
    }

    /**
     * Update file (remove old, index new)
     */
    async updateFile(filePath: string, content: string): Promise<void> {
        this.removeFile(filePath);
        await this.indexFile(filePath, content);
    }

    /**
     * Get chunk from cache
     */
    getFromCache(chunkId: string): CachedChunk | undefined {
        return this.memoryCache.get(chunkId);
    }

    /**
     * Get cache size
     */
    getCacheSize(): number {
        return this.memoryCache.size();
    }

    /**
     * Get queue size
     */
    getQueueSize(): number {
        return this.persistQueue.size();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.memoryCache.size(),
            currentSize: this.memoryCache.getCurrentSize(),
            maxSize: this.memoryCache.getMaxSize(),
        };
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        return this.persistQueue.getStats();
    }

    /**
     * Stop all background processes
     */
    stop(): void {
        this.persistQueue.stop();
    }
}
