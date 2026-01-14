/**
 * PersistQueue - Batch persistence queue with deduplication
 * Queues chunks for batch persistence to Qdrant
 */

import { VectorStore, VectorItem } from './vector-store';

export interface QueuedChunk {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

export interface PersistQueueConfig {
    batchSize?: number;
    flushInterval?: number; // milliseconds
}

export interface QueueStats {
    size: number;
    totalFlushed: number;
    flushCount: number;
    failedFlushes: number;
}

export class PersistQueue {
    private queue: Map<string, QueuedChunk>; // Use Map for deduplication
    private vectorStore: VectorStore;
    private batchSize: number;
    private flushInterval: number;
    private flushTimer: NodeJS.Timeout | null = null;
    private stats: QueueStats;

    constructor(
        vectorStore: VectorStore,
        config: PersistQueueConfig = {}
    ) {
        this.vectorStore = vectorStore;
        this.queue = new Map();
        this.batchSize = config.batchSize || 50;
        this.flushInterval = config.flushInterval || 30000; // 30 seconds default
        this.stats = {
            size: 0,
            totalFlushed: 0,
            flushCount: 0,
            failedFlushes: 0,
        };

        // Start periodic flushing
        this.startPeriodicFlush();
    }

    /**
     * Add chunk to queue (deduplicates by ID)
     */
    enqueue(chunk: QueuedChunk): void {
        this.queue.set(chunk.id, chunk);

        // Auto-flush if batch size reached
        if (this.queue.size >= this.batchSize) {
            // Flush asynchronously without blocking
            this.flush().catch(error => {
                console.error('Auto-flush failed:', error);
            });
        }
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.queue.size;
    }

    /**
     * Get all queued chunks
     */
    getAll(): QueuedChunk[] {
        return Array.from(this.queue.values());
    }

    /**
     * Get chunks by file path
     */
    getByFilePath(filePath: string): QueuedChunk[] {
        return Array.from(this.queue.values()).filter(
            chunk => chunk.metadata.filePath === filePath
        );
    }

    /**
     * Remove chunks by file path
     */
    removeByFilePath(filePath: string): void {
        const idsToRemove: string[] = [];

        for (const [id, chunk] of this.queue.entries()) {
            if (chunk.metadata.filePath === filePath) {
                idsToRemove.push(id);
            }
        }

        for (const id of idsToRemove) {
            this.queue.delete(id);
        }
    }

    /**
     * Clear queue
     */
    clear(): void {
        this.queue.clear();
    }

    /**
     * Flush queue to vector store
     */
    async flush(): Promise<void> {
        if (this.queue.size === 0) {
            return;
        }

        const chunks = Array.from(this.queue.values());

        try {
            // Convert to VectorItems
            const items: VectorItem[] = chunks.map(chunk => ({
                id: chunk.id,
                vector: chunk.vector,
                metadata: chunk.metadata,
            }));

            await this.vectorStore.upsertBatch(items);

            // Update stats
            this.stats.totalFlushed += chunks.length;
            this.stats.flushCount++;

            // Clear queue after successful flush
            this.queue.clear();
        } catch (error) {
            this.stats.failedFlushes++;
            throw error; // Re-throw to allow caller to handle
        }
    }

    /**
     * Get statistics
     */
    getStats(): QueueStats {
        return {
            ...this.stats,
            size: this.queue.size,
        };
    }

    /**
     * Start periodic flushing
     */
    private startPeriodicFlush(): void {
        this.flushTimer = setInterval(() => {
            if (this.queue.size > 0) {
                this.flush().catch(error => {
                    console.error('Periodic flush failed:', error);
                });
            }
        }, this.flushInterval);
    }

    /**
     * Stop periodic flushing
     */
    stop(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
}
