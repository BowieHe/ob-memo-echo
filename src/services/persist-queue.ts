/**
 * PersistQueue - Batch persistence queue with deduplication
 * v0.4.0: Supports multi-vector items
 */

import { VectorStore, VectorItem, MultiVectorItem, VECTOR_NAMES } from './vector-store';

// Legacy single-vector queued chunk
export interface QueuedChunk {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

// v0.4.0: Multi-vector queued chunk
export interface MultiVectorQueuedChunk {
    id: string;
    vectors: {
        [VECTOR_NAMES.CONTENT]: number[];
        [VECTOR_NAMES.SUMMARY]: number[];
        [VECTOR_NAMES.TITLE]: number[];
    };
    metadata: Record<string, any>;
}

export interface PersistQueueConfig {
    batchSize?: number;
    flushInterval?: number; // milliseconds
    useMultiVector?: boolean; // v0.4.0
}

export interface QueueStats {
    size: number;
    totalFlushed: number;
    flushCount: number;
    failedFlushes: number;
}

export class PersistQueue {
    private queue: Map<string, QueuedChunk>; // Legacy
    private multiVectorQueue: Map<string, MultiVectorQueuedChunk>; // v0.4.0
    private vectorStore: VectorStore;
    private batchSize: number;
    private flushInterval: number;
    private flushTimer: NodeJS.Timeout | null = null;
    private stats: QueueStats;
    private useMultiVector: boolean;

    constructor(
        vectorStore: VectorStore,
        config: PersistQueueConfig = {}
    ) {
        this.vectorStore = vectorStore;
        this.queue = new Map();
        this.multiVectorQueue = new Map();
        this.batchSize = config.batchSize || 50;
        this.flushInterval = config.flushInterval || 30000; // 30 seconds default
        this.useMultiVector = config.useMultiVector ?? true; // v0.4.0 default
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
     * Add chunk to queue (deduplicates by ID) - Legacy
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
     * Add multi-vector chunk to queue (v0.4.0)
     */
    enqueueMultiVector(chunk: MultiVectorQueuedChunk): void {
        this.multiVectorQueue.set(chunk.id, chunk);

        // Auto-flush if batch size reached
        if (this.multiVectorQueue.size >= this.batchSize) {
            this.flushMultiVector().catch(error => {
                console.error('Auto-flush multi-vector failed:', error);
            });
        }
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.useMultiVector ? this.multiVectorQueue.size : this.queue.size;
    }

    /**
     * Get all queued chunks
     */
    getAll(): QueuedChunk[] {
        return Array.from(this.queue.values());
    }

    /**
     * Get chunks by file path
     * Returns legacy chunks or converts multi-vector chunks as needed
     */
    getByFilePath(filePath: string): QueuedChunk[] {
        if (this.useMultiVector) {
            // Return from multi-vector queue, convert to legacy format for compatibility
            return Array.from(this.multiVectorQueue.values())
                .filter(chunk => chunk.metadata.filePath === filePath)
                .map(chunk => ({
                    id: chunk.id,
                    vector: chunk.vectors.content_vec, // Use content vector as primary
                    metadata: chunk.metadata,
                }));
        }
        return Array.from(this.queue.values()).filter(
            chunk => chunk.metadata.filePath === filePath
        );
    }

    /**
     * Remove chunks by file path
     */
    removeByFilePath(filePath: string): void {
        // Legacy queue
        for (const [id, chunk] of this.queue.entries()) {
            if (chunk.metadata.filePath === filePath) {
                this.queue.delete(id);
            }
        }
        // Multi-vector queue
        for (const [id, chunk] of this.multiVectorQueue.entries()) {
            if (chunk.metadata.filePath === filePath) {
                this.multiVectorQueue.delete(id);
            }
        }
    }

    /**
     * Clear queue
     */
    clear(): void {
        this.queue.clear();
        this.multiVectorQueue.clear();
    }

    /**
     * Flush legacy queue to vector store
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
     * Flush multi-vector queue to vector store (v0.4.0)
     */
    async flushMultiVector(): Promise<void> {
        if (this.multiVectorQueue.size === 0) {
            return;
        }

        const chunks = Array.from(this.multiVectorQueue.values());

        try {
            // Upsert each multi-vector item
            for (const chunk of chunks) {
                await this.vectorStore.upsertMultiVector({
                    id: chunk.id,
                    vectors: chunk.vectors,
                    metadata: chunk.metadata,
                });
            }

            // Update stats
            this.stats.totalFlushed += chunks.length;
            this.stats.flushCount++;

            // Clear queue after successful flush
            this.multiVectorQueue.clear();
        } catch (error) {
            this.stats.failedFlushes++;
            throw error;
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
