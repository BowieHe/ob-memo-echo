/**
 * MemoryCache - In-memory chunk storage with LRU eviction
 * Stores chunks temporarily for real-time recommendations
 */

import type { CachedChunk } from '@core/types/indexing';

export type { CachedChunk };

export class MemoryCache {
    private cache: Map<string, CachedChunk>;
    private accessOrder: Map<string, number>; // Track access time for LRU
    private maxSize: number; // Max size in bytes
    private currentSize: number;
    private accessCounter: number;

    constructor(maxSizeBytes: number = 50 * 1024 * 1024) { // Default 50MB
        this.cache = new Map();
        this.accessOrder = new Map();
        this.maxSize = maxSizeBytes;
        this.currentSize = 0;
        this.accessCounter = 0;
    }

    /**
     * Add or update chunk in cache
     */
    set(id: string, chunk: CachedChunk): void {
        const chunkSize = this.calculateSize(chunk);

        // If updating existing chunk, subtract old size
        if (this.cache.has(id)) {
            const oldChunk = this.cache.get(id)!;
            this.currentSize -= this.calculateSize(oldChunk);
        }

        // Evict LRU chunks if necessary
        while (this.currentSize + chunkSize > this.maxSize && this.cache.size > 0) {
            this.evictLRU();
        }

        // Add chunk
        this.cache.set(id, chunk);
        this.accessOrder.set(id, ++this.accessCounter);
        this.currentSize += chunkSize;
    }

    /**
     * Get chunk from cache (updates access time)
     */
    get(id: string): CachedChunk | undefined {
        const chunk = this.cache.get(id);
        if (chunk) {
            // Update access time
            this.accessOrder.set(id, ++this.accessCounter);
        }
        return chunk;
    }

    /**
     * Check if chunk exists in cache
     */
    has(id: string): boolean {
        return this.cache.has(id);
    }

    /**
     * Delete chunk from cache
     */
    delete(id: string): boolean {
        const chunk = this.cache.get(id);
        if (chunk) {
            this.currentSize -= this.calculateSize(chunk);
            this.accessOrder.delete(id);
            return this.cache.delete(id);
        }
        return false;
    }

    /**
     * Clear all chunks from cache
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder.clear();
        this.currentSize = 0;
        this.accessCounter = 0;
    }

    /**
     * Get number of chunks in cache
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Get current cache size in bytes
     */
    getCurrentSize(): number {
        return this.currentSize;
    }

    /**
     * Get max cache size in bytes
     */
    getMaxSize(): number {
        return this.maxSize;
    }

    /**
     * Get all chunks
     */
    getAll(): CachedChunk[] {
        return Array.from(this.cache.values());
    }

    /**
     * Get chunks by file path
     */
    getByFilePath(filePath: string): CachedChunk[] {
        return Array.from(this.cache.values()).filter(
            chunk => chunk.metadata.filePath === filePath
        );
    }

    /**
     * Delete all chunks for a file
     */
    deleteByFilePath(filePath: string): void {
        const idsToDelete: string[] = [];

        for (const [id, chunk] of this.cache.entries()) {
            if (chunk.metadata.filePath === filePath) {
                idsToDelete.push(id);
            }
        }

        for (const id of idsToDelete) {
            this.delete(id);
        }
    }

    /**
     * Evict least recently used chunk
     */
    private evictLRU(): void {
        let lruId: string | null = null;
        let lruTime = Infinity;

        // Find least recently used
        for (const [id, accessTime] of this.accessOrder.entries()) {
            if (accessTime < lruTime) {
                lruTime = accessTime;
                lruId = id;
            }
        }

        if (lruId) {
            this.delete(lruId);
        }
    }

    /**
     * Calculate approximate size of chunk in bytes
     */
    private calculateSize(chunk: CachedChunk): number {
        // Rough estimation:
        // - content: 2 bytes per char (UTF-16)
        // - embedding: 8 bytes per number (float64)
        // - metadata: JSON string length * 2

        const contentSize = chunk.content.length * 2;
        const embeddingSize = chunk.embedding.length * 8;
        const metadataSize = JSON.stringify(chunk.metadata).length * 2;

        return contentSize + embeddingSize + metadataSize + 100; // +100 for overhead
    }
}
