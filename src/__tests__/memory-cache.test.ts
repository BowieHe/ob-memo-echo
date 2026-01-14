/**
 * Unit tests for MemoryCache (v0.2.0)
 * Tests in-memory chunk storage with LRU eviction
 */

import { MemoryCache, CachedChunk } from '../services/memory-cache';

describe('MemoryCache (v0.2.0)', () => {
    let cache: MemoryCache;

    beforeEach(() => {
        // Create cache with 1MB limit for testing
        cache = new MemoryCache(1024 * 1024); // 1MB
    });

    describe('Basic Operations', () => {
        // TC-3.1: Add chunk to cache
        it('should add chunk to cache', () => {
            const chunk: CachedChunk = {
                id: 'test-chunk-1',
                content: 'Test content',
                embedding: [0.1, 0.2, 0.3],
                metadata: {
                    filePath: '/test.md',
                    start_line: 1,
                    end_line: 10,
                },
                timestamp: Date.now(),
            };

            cache.set('test-chunk-1', chunk);

            const retrieved = cache.get('test-chunk-1');
            expect(retrieved).toEqual(chunk);
        });

        // TC-3.2: Retrieve chunk from cache
        it('should retrieve chunk from cache', () => {
            const chunk: CachedChunk = {
                id: 'chunk-1',
                content: 'Content',
                embedding: [0.1, 0.2],
                metadata: { filePath: '/test.md' },
                timestamp: Date.now(),
            };

            cache.set('chunk-1', chunk);
            const result = cache.get('chunk-1');

            expect(result).toBeDefined();
            expect(result?.id).toBe('chunk-1');
            expect(result?.content).toBe('Content');
        });

        // TC-3.3: Delete chunk from cache
        it('should delete chunk from cache', () => {
            const chunk: CachedChunk = {
                id: 'chunk-1',
                content: 'Content',
                embedding: [0.1],
                metadata: {},
                timestamp: Date.now(),
            };

            cache.set('chunk-1', chunk);
            expect(cache.has('chunk-1')).toBe(true);

            cache.delete('chunk-1');
            expect(cache.has('chunk-1')).toBe(false);
            expect(cache.get('chunk-1')).toBeUndefined();
        });

        // TC-3.4: Check if chunk exists
        it('should check if chunk exists', () => {
            expect(cache.has('nonexistent')).toBe(false);

            cache.set('exists', {
                id: 'exists',
                content: 'Content',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            expect(cache.has('exists')).toBe(true);
        });

        // TC-3.5: Clear all chunks
        it('should clear all chunks', () => {
            cache.set('chunk-1', {
                id: 'chunk-1',
                content: 'Content 1',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            cache.set('chunk-2', {
                id: 'chunk-2',
                content: 'Content 2',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            expect(cache.size()).toBe(2);

            cache.clear();

            expect(cache.size()).toBe(0);
            expect(cache.has('chunk-1')).toBe(false);
            expect(cache.has('chunk-2')).toBe(false);
        });
    });

    describe('LRU Eviction', () => {
        // TC-3.6: Evict least recently used when size limit exceeded
        it('should evict LRU chunk when size limit exceeded', () => {
            // Create cache with very small limit (1KB)
            const smallCache = new MemoryCache(1024);

            // Add chunks that exceed limit
            const chunk1: CachedChunk = {
                id: 'chunk-1',
                content: 'A'.repeat(400), // ~400 bytes
                embedding: new Array(100).fill(0.1), // ~800 bytes
                metadata: {},
                timestamp: Date.now(),
            };

            const chunk2: CachedChunk = {
                id: 'chunk-2',
                content: 'B'.repeat(400),
                embedding: new Array(100).fill(0.2),
                metadata: {},
                timestamp: Date.now() + 1,
            };

            smallCache.set('chunk-1', chunk1);
            smallCache.set('chunk-2', chunk2); // Should evict chunk-1

            expect(smallCache.has('chunk-1')).toBe(false);
            expect(smallCache.has('chunk-2')).toBe(true);
        });

        // TC-3.7: Update access time on get (LRU)
        it('should update access time on get', () => {
            const smallCache = new MemoryCache(2000); // Can hold ~2 chunks

            const chunk1: CachedChunk = {
                id: 'chunk-1',
                content: 'A'.repeat(200), // Smaller chunks
                embedding: new Array(50).fill(0.1),
                metadata: {},
                timestamp: Date.now(),
            };

            const chunk2: CachedChunk = {
                id: 'chunk-2',
                content: 'B'.repeat(200),
                embedding: new Array(50).fill(0.2),
                metadata: {},
                timestamp: Date.now() + 1,
            };

            const chunk3: CachedChunk = {
                id: 'chunk-3',
                content: 'C'.repeat(200),
                embedding: new Array(50).fill(0.3),
                metadata: {},
                timestamp: Date.now() + 2,
            };

            smallCache.set('chunk-1', chunk1);
            smallCache.set('chunk-2', chunk2);

            // Access chunk-1 to make it recently used
            smallCache.get('chunk-1');

            // Add chunk-3, should evict chunk-2 (not chunk-1)
            smallCache.set('chunk-3', chunk3);

            expect(smallCache.has('chunk-1')).toBe(true);
            expect(smallCache.has('chunk-2')).toBe(false);
            expect(smallCache.has('chunk-3')).toBe(true);
        });
    });

    describe('Size Management', () => {
        // TC-3.8: Calculate cache size correctly
        it('should calculate cache size correctly', () => {
            expect(cache.getCurrentSize()).toBe(0);

            const chunk: CachedChunk = {
                id: 'chunk-1',
                content: 'Test content',
                embedding: [0.1, 0.2, 0.3],
                metadata: { filePath: '/test.md' },
                timestamp: Date.now(),
            };

            cache.set('chunk-1', chunk);

            expect(cache.getCurrentSize()).toBeGreaterThan(0);
        });

        // TC-3.9: Return number of cached chunks
        it('should return number of cached chunks', () => {
            expect(cache.size()).toBe(0);

            cache.set('chunk-1', {
                id: 'chunk-1',
                content: 'Content',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            expect(cache.size()).toBe(1);

            cache.set('chunk-2', {
                id: 'chunk-2',
                content: 'Content',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            expect(cache.size()).toBe(2);
        });

        // TC-3.10: Get max size limit
        it('should return max size limit', () => {
            const limit = 1024 * 1024; // 1MB
            const testCache = new MemoryCache(limit);

            expect(testCache.getMaxSize()).toBe(limit);
        });
    });

    describe('Batch Operations', () => {
        it('should get all chunks', () => {
            cache.set('chunk-1', {
                id: 'chunk-1',
                content: 'Content 1',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            cache.set('chunk-2', {
                id: 'chunk-2',
                content: 'Content 2',
                embedding: [],
                metadata: {},
                timestamp: Date.now(),
            });

            const allChunks = cache.getAll();

            expect(allChunks.length).toBe(2);
            expect(allChunks.map(c => c.id)).toContain('chunk-1');
            expect(allChunks.map(c => c.id)).toContain('chunk-2');
        });

        it('should get chunks by file path', () => {
            cache.set('file1-chunk1', {
                id: 'file1-chunk1',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file1.md' },
                timestamp: Date.now(),
            });

            cache.set('file1-chunk2', {
                id: 'file1-chunk2',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file1.md' },
                timestamp: Date.now(),
            });

            cache.set('file2-chunk1', {
                id: 'file2-chunk1',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file2.md' },
                timestamp: Date.now(),
            });

            const file1Chunks = cache.getByFilePath('/file1.md');

            expect(file1Chunks.length).toBe(2);
            expect(file1Chunks.every(c => c.metadata.filePath === '/file1.md')).toBe(true);
        });

        it('should delete chunks by file path', () => {
            cache.set('file1-chunk1', {
                id: 'file1-chunk1',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file1.md' },
                timestamp: Date.now(),
            });

            cache.set('file1-chunk2', {
                id: 'file1-chunk2',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file1.md' },
                timestamp: Date.now(),
            });

            cache.set('file2-chunk1', {
                id: 'file2-chunk1',
                content: 'Content',
                embedding: [],
                metadata: { filePath: '/file2.md' },
                timestamp: Date.now(),
            });

            cache.deleteByFilePath('/file1.md');

            expect(cache.has('file1-chunk1')).toBe(false);
            expect(cache.has('file1-chunk2')).toBe(false);
            expect(cache.has('file2-chunk1')).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty cache operations', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
            expect(cache.getAll()).toEqual([]);
            expect(cache.getByFilePath('/nonexistent.md')).toEqual([]);
        });

        it('should handle very large chunks', () => {
            const largeChunk: CachedChunk = {
                id: 'large',
                content: 'A'.repeat(100000), // 100KB
                embedding: new Array(1000).fill(0.1),
                metadata: {},
                timestamp: Date.now(),
            };

            cache.set('large', largeChunk);

            const retrieved = cache.get('large');
            expect(retrieved?.content.length).toBe(100000);
        });

        it('should handle chunk updates', () => {
            const chunk1: CachedChunk = {
                id: 'chunk-1',
                content: 'Original content',
                embedding: [0.1],
                metadata: {},
                timestamp: Date.now(),
            };

            cache.set('chunk-1', chunk1);

            const chunk2: CachedChunk = {
                id: 'chunk-1',
                content: 'Updated content',
                embedding: [0.2],
                metadata: {},
                timestamp: Date.now() + 1000,
            };

            cache.set('chunk-1', chunk2);

            const retrieved = cache.get('chunk-1');
            expect(retrieved?.content).toBe('Updated content');
            expect(cache.size()).toBe(1); // Should still be 1 chunk
        });
    });
});
