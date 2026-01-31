/**
 * Unit tests for PersistQueue (v0.5.0)
 * Tests batch persistence queue with deduplication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistQueue, type QueuedChunk } from '@services/persist-queue';
import type { VectorBackend } from '@backends/vector-backend';

describe('PersistQueue (v0.5.0)', () => {
    let queue: PersistQueue;
    let mockBackend: any;

    beforeEach(() => {
        mockBackend = {
            initialize: vi.fn().mockResolvedValue(undefined),
            upsertMultiVector: vi.fn().mockResolvedValue(undefined),
            searchWithFusion: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined),
            deleteByFilePath: vi.fn().mockResolvedValue(undefined),
            count: vi.fn().mockResolvedValue(0),
            clear: vi.fn().mockResolvedValue(undefined),
        };

        queue = new PersistQueue(mockBackend, {
            batchSize: 10,
            flushInterval: 5000,
            useMultiVector: false, // Use legacy queue for these tests
        });
    });

    afterEach(() => {
        queue.stop();
    });

    describe('Basic Operations', () => {
        // TC-3.11: Add chunk to queue
        it('should add chunk to queue', () => {
            const chunk: QueuedChunk = {
                id: 'chunk-1',
                vector: [0.1, 0.2, 0.3],
                metadata: {
                    filePath: '/test.md',
                    content: 'Test content',
                },
            };

            queue.enqueue(chunk);

            expect(queue.size()).toBe(1);
        });

        // TC-3.12: Deduplicate chunks with same ID
        it('should deduplicate chunks with same ID', () => {
            const chunk1: QueuedChunk = {
                id: 'chunk-1',
                vector: [0.1, 0.2],
                metadata: { content: 'Original' },
            };

            const chunk2: QueuedChunk = {
                id: 'chunk-1',
                vector: [0.3, 0.4],
                metadata: { content: 'Updated' },
            };

            queue.enqueue(chunk1);
            queue.enqueue(chunk2);

            expect(queue.size()).toBe(1);

            const chunks = queue.getAll();
            expect(chunks[0].metadata.content).toBe('Updated');
        });

        // TC-3.13: Get queue size
        it('should return queue size', () => {
            expect(queue.size()).toBe(0);

            queue.enqueue({
                id: 'chunk-1',
                vector: [],
                metadata: {},
            });

            expect(queue.size()).toBe(1);

            queue.enqueue({
                id: 'chunk-2',
                vector: [],
                metadata: {},
            });

            expect(queue.size()).toBe(2);
        });

        // TC-3.14: Clear queue
        it('should clear queue', () => {
            queue.enqueue({
                id: 'chunk-1',
                vector: [],
                metadata: {},
            });

            queue.enqueue({
                id: 'chunk-2',
                vector: [],
                metadata: {},
            });

            expect(queue.size()).toBe(2);

            queue.clear();

            expect(queue.size()).toBe(0);
        });
    });

    describe('Batch Flushing', () => {
        // TC-3.15: Flush when batch size reached
        it('should flush when batch size reached', async () => {
            const smallQueue = new PersistQueue(mockBackend, {
                batchSize: 3,
                flushInterval: 60000,
                useMultiVector: false,
            });

            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            // Add 3 chunks (reaches batch size)
            smallQueue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });
            smallQueue.enqueue({ id: 'chunk-2', vector: [], metadata: {} });
            smallQueue.enqueue({ id: 'chunk-3', vector: [], metadata: {} });

            // Wait for async flush
            await new Promise(resolve => setTimeout(resolve, 100));

            // Called once per chunk
            expect(mockBackend.upsertMultiVector).toHaveBeenCalledTimes(3);

            expect(smallQueue.size()).toBe(0);

            smallQueue.stop();
        });

        // TC-3.16: Manual flush
        it('should flush manually', async () => {
            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            queue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });
            queue.enqueue({ id: 'chunk-2', vector: [], metadata: {} });

            expect(queue.size()).toBe(2);

            await queue.flush();

            // Called once per chunk
            expect(mockBackend.upsertMultiVector).toHaveBeenCalledTimes(2);
            expect(queue.size()).toBe(0);
        });

        // TC-3.17: Periodic flush (interval-based)
        it('should flush periodically', async () => {
            const periodicQueue = new PersistQueue(mockBackend, {
                batchSize: 100,
                flushInterval: 100, // 100ms for faster test
                useMultiVector: false,
            });

            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            periodicQueue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });

            expect(periodicQueue.size()).toBe(1);

            // Wait for periodic flush
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockBackend.upsertMultiVector).toHaveBeenCalled();
            expect(periodicQueue.size()).toBe(0);

            periodicQueue.stop();
        }, { timeout: 5000 });

        // TC-3.18: Don't flush empty queue
        it('should not flush empty queue', async () => {
            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            await queue.flush();

            expect(mockBackend.upsertMultiVector).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        // TC-3.19: Handle flush errors gracefully
        it('should handle flush errors gracefully', async () => {
            mockBackend.upsertMultiVector.mockRejectedValue(new Error('Network error'));

            queue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });

            await expect(queue.flush()).rejects.toThrow('Network error');

            // Queue should still contain the chunk after failed flush
            expect(queue.size()).toBe(1);
        });

        // TC-3.20: Retry on failure (optional)
        it('should keep chunks in queue on flush failure', async () => {
            mockBackend.upsertMultiVector.mockRejectedValueOnce(new Error('Temporary error'));

            queue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });
            queue.enqueue({ id: 'chunk-2', vector: [], metadata: {} });

            try {
                await queue.flush();
            } catch (error) {
                // Expected
            }

            // Chunks should still be in queue
            expect(queue.size()).toBe(2);

            // Retry should work
            mockBackend.upsertMultiVector.mockResolvedValueOnce(undefined);
            await queue.flush();

            expect(queue.size()).toBe(0);
        });
    });

    describe('File-based Operations', () => {
        it('should get chunks by file path', () => {
            queue.enqueue({
                id: 'file1-chunk1',
                vector: [],
                metadata: { filePath: '/file1.md' },
            });

            queue.enqueue({
                id: 'file1-chunk2',
                vector: [],
                metadata: { filePath: '/file1.md' },
            });

            queue.enqueue({
                id: 'file2-chunk1',
                vector: [],
                metadata: { filePath: '/file2.md' },
            });

            const file1Chunks = queue.getByFilePath('/file1.md');

            expect(file1Chunks.length).toBe(2);
            expect(file1Chunks.every(c => c.metadata.filePath === '/file1.md')).toBe(true);
        });

        it('should remove chunks by file path', () => {
            queue.enqueue({
                id: 'file1-chunk1',
                vector: [],
                metadata: { filePath: '/file1.md' },
            });

            queue.enqueue({
                id: 'file2-chunk1',
                vector: [],
                metadata: { filePath: '/file2.md' },
            });

            expect(queue.size()).toBe(2);

            queue.removeByFilePath('/file1.md');

            expect(queue.size()).toBe(1);
            expect(queue.getByFilePath('/file1.md')).toEqual([]);
        });
    });

    describe('Statistics', () => {
        it('should track total flushed count', async () => {
            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            queue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });
            await queue.flush();

            queue.enqueue({ id: 'chunk-2', vector: [], metadata: {} });
            queue.enqueue({ id: 'chunk-3', vector: [], metadata: {} });
            await queue.flush();

            const stats = queue.getStats();

            expect(stats.totalFlushed).toBe(3);
            expect(stats.flushCount).toBe(2);
        });

        it('should track failed flushes', async () => {
            mockBackend.upsertMultiVector.mockRejectedValue(new Error('Error'));

            queue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });

            try {
                await queue.flush();
            } catch (error) {
                // Expected
            }

            const stats = queue.getStats();

            expect(stats.failedFlushes).toBe(1);
        });
    });

    describe('Lifecycle', () => {
        it('should stop periodic flushing', () => {
            vi.useFakeTimers();

            const periodicQueue = new PersistQueue(mockBackend, {
                batchSize: 100,
                flushInterval: 1000,
                useMultiVector: false,
            });

            mockBackend.upsertMultiVector.mockResolvedValue(undefined);

            periodicQueue.enqueue({ id: 'chunk-1', vector: [], metadata: {} });

            periodicQueue.stop();

            // Fast-forward time
            vi.advanceTimersByTime(5000);

            // Should not flush after stop
            expect(mockBackend.upsertMultiVector).not.toHaveBeenCalled();

            vi.useRealTimers();
        });
    });
});
