/**
 * VectorIndexManager - Orchestrates indexing, caching, and persistence
 * Provides unified interface for incremental indexing system
 */

import { MemoryCache, CachedChunk } from './memory-cache';
import { PersistQueue, QueuedChunk } from './persist-queue';
import { VectorStore, SearchResult } from './vector-store';
import { EmbeddingService } from './embedding-service';
import { Chunker, ChunkResult } from './chunker';
import { MetadataExtractor } from './metadata-extractor';

export class VectorIndexManager {
    private memoryCache: MemoryCache;
    private persistQueue: PersistQueue;
    private vectorStore: VectorStore;
    private embeddingService: EmbeddingService;
    private chunker: Chunker;
    private metadataExtractor: MetadataExtractor;

    constructor(
        vectorStore: VectorStore,
        embeddingService: EmbeddingService,
        chunker: Chunker,
        metadataExtractor: MetadataExtractor,
        cacheSize: number = 50 * 1024 * 1024 // 50MB default
    ) {
        this.vectorStore = vectorStore;
        this.embeddingService = embeddingService;
        this.chunker = chunker;
        this.metadataExtractor = metadataExtractor;

        this.memoryCache = new MemoryCache(cacheSize);
        this.persistQueue = new PersistQueue(vectorStore, {
            batchSize: 50,
            flushInterval: 30000,
        });
    }

    /**
     * Index a file
     */
    async indexFile(filePath: string, content: string): Promise<void> {
        // Chunk the content
        const chunks = this.chunker.chunk(content);

        for (const chunk of chunks) {
            await this.indexChunk(filePath, chunk);
        }
    }

    /**
     * Index a single chunk
     */
    private async indexChunk(filePath: string, chunk: ChunkResult): Promise<void> {
        const chunkId = `${filePath}-chunk-${chunk.index}`;

        // Generate embedding
        const embedding = await this.embeddingService.embed(chunk.content);

        // Extract metadata
        const extractedMetadata = await this.metadataExtractor.extract(chunk.content);

        // Create cached chunk
        const cachedChunk: CachedChunk = {
            id: chunkId,
            content: chunk.content,
            embedding,
            metadata: {
                filePath,
                content: chunk.content,
                headers: chunk.headers,
                startPos: chunk.startPos,
                endPos: chunk.endPos,
                start_line: chunk.start_line,
                end_line: chunk.end_line,
                header_path: chunk.header_path,
                summary: extractedMetadata.summary,
                tags: extractedMetadata.tags,
                category: extractedMetadata.category,
                word_count: chunk.content.length,
                indexedAt: Date.now(),
            },
            timestamp: Date.now(),
        };

        // Add to cache
        this.memoryCache.set(chunkId, cachedChunk);

        // Add to persist queue
        const queuedChunk: QueuedChunk = {
            id: chunkId,
            vector: embedding,
            metadata: cachedChunk.metadata,
        };

        this.persistQueue.enqueue(queuedChunk);
    }

    /**
     * Search across cache and vector store
     */
    async search(query: string, limit: number = 10): Promise<SearchResult[]> {
        // Generate query embedding
        const queryEmbedding = await this.embeddingService.embed(query);

        // Search in cache
        const cacheResults = this.searchInCache(queryEmbedding, limit);

        // Search in vector store
        const storeResults = await this.vectorStore.search(queryEmbedding, limit);

        // Combine and deduplicate results
        const combinedResults = this.combineResults(cacheResults, storeResults, limit);

        return combinedResults;
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
     * Flush persist queue to vector store
     */
    async flush(): Promise<void> {
        await this.persistQueue.flush();
    }

    /**
     * Handle file save event
     */
    async onFileSave(filePath: string): Promise<void> {
        // Flush chunks for this file
        const fileChunks = this.persistQueue.getByFilePath(filePath);

        if (fileChunks.length > 0) {
            await this.persistQueue.flush();
        }
    }

    /**
     * Remove file from cache and queue
     */
    removeFile(filePath: string): void {
        this.memoryCache.deleteByFilePath(filePath);
        this.persistQueue.removeByFilePath(filePath);
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
