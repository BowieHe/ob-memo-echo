/**
 * Unit tests for VectorIndexManager (v0.2.0)
 * Tests orchestration of indexing, caching, and persistence
 */

import { VectorIndexManager } from '../services/vector-index-manager';
import { MemoryCache } from '../services/memory-cache';
import { PersistQueue } from '../services/persist-queue';
import { VectorStore } from '../services/vector-store';
import { EmbeddingService } from '../services/embedding-service';
import { Chunker } from '../services/chunker';
import { MetadataExtractor } from '../services/metadata-extractor';

describe('VectorIndexManager (v0.2.0)', () => {
    let manager: VectorIndexManager;
    let mockVectorStore: jest.Mocked<VectorStore>;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockChunker: jest.Mocked<Chunker>;
    let mockMetadataExtractor: jest.Mocked<MetadataExtractor>;

    beforeEach(() => {
        mockVectorStore = {
            upsert: jest.fn(),
            upsertBatch: jest.fn(),
            search: jest.fn(),
        } as any;

        mockEmbeddingService = {
            embed: jest.fn(),
            embedBatch: jest.fn(),
        } as any;

        mockChunker = {
            chunk: jest.fn(),
        } as any;

        mockMetadataExtractor = {
            extract: jest.fn(),
            extractWithRules: jest.fn(),
        } as any;

        manager = new VectorIndexManager(
            mockVectorStore,
            mockEmbeddingService,
            mockChunker,
            mockMetadataExtractor
        );
    });

    afterEach(() => {
        manager.stop();
    });

    describe('Indexing Operations', () => {
        // TC-3.21: Index file and store in cache
        it('should index file and store in cache', async () => {
            const content = '# Test\n\nTest content';
            const filePath = '/test.md';

            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Test content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 12,
                    start_line: 1,
                    end_line: 3,
                    header_path: '# Test',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Test summary',
                tags: ['test'],
                category: '技术笔记',
            });

            await manager.indexFile(filePath, content);

            // Should be in cache
            const cached = manager.getFromCache(`${filePath}-chunk-0`);
            expect(cached).toBeDefined();
            expect(cached?.content).toBe('Test content');
        });

        // TC-3.22: Index file and add to persist queue
        it('should add indexed chunks to persist queue', async () => {
            const content = '# Test\n\nContent';
            const filePath = '/test.md';

            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 7,
                    start_line: 1,
                    end_line: 3,
                    header_path: '',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.indexFile(filePath, content);

            const queueSize = manager.getQueueSize();
            expect(queueSize).toBe(1);
        });

        // TC-3.23: Handle indexing errors gracefully
        it('should handle indexing errors gracefully', async () => {
            mockChunker.chunk.mockImplementation(() => {
                throw new Error('Chunking failed');
            });

            await expect(
                manager.indexFile('/test.md', 'content')
            ).rejects.toThrow('Chunking failed');
        });
    });

    describe('Search Operations', () => {
        // TC-3.24: Search in cache and vector store
        it('should search in both cache and vector store', async () => {
            const query = 'test query';
            const queryEmbedding = [0.1, 0.2, 0.3];

            // Setup mocks BEFORE indexFile
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Cached content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 14,
                    start_line: 1,
                    end_line: 3,
                    header_path: '# Test',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '技术笔记',
            });

            // Add chunk to cache
            await manager.indexFile('/test.md', '# Test\n\nCached content');

            // Mock vector store results
            mockVectorStore.search.mockResolvedValue([
                {
                    id: 'persisted-chunk',
                    score: 0.9,
                    metadata: { content: 'Persisted content' },
                },
            ]);

            const results = await manager.search(query, 10);

            // Should combine cache and vector store results
            expect(results.length).toBeGreaterThan(0);
            expect(mockVectorStore.search).toHaveBeenCalledWith(queryEmbedding, 10);
        });

        // TC-3.25: Deduplicate search results
        it('should deduplicate search results from cache and store', async () => {
            const query = 'test';
            const queryEmbedding = [0.1, 0.2];

            mockEmbeddingService.embed.mockResolvedValue(queryEmbedding);

            // Same chunk in both cache and store
            mockVectorStore.search.mockResolvedValue([
                {
                    id: 'chunk-1',
                    score: 0.8,
                    metadata: { content: 'Content' },
                },
            ]);

            // Manually add to cache with same ID
            const cache = (manager as any).memoryCache;
            cache.set('chunk-1', {
                id: 'chunk-1',
                content: 'Content',
                embedding: [0.1, 0.2],
                metadata: { content: 'Content' },
                timestamp: Date.now(),
            });

            const results = await manager.search(query, 10);

            // Should only have one result (deduplicated)
            const uniqueIds = new Set(results.map(r => r.id));
            expect(uniqueIds.size).toBe(results.length);
        });
    });

    describe('Persistence', () => {
        // TC-3.26: Persist queue on demand
        it('should persist queue on demand', async () => {
            mockVectorStore.upsertBatch.mockResolvedValue(undefined);

            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 7,
                    start_line: 1,
                    end_line: 1,
                    header_path: '',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.indexFile('/test.md', 'Content');

            expect(manager.getQueueSize()).toBe(1);

            await manager.flush();

            expect(mockVectorStore.upsertBatch).toHaveBeenCalled();
            expect(manager.getQueueSize()).toBe(0);
        });

        // TC-3.27: Auto-persist on file save
        it('should auto-persist on file save event', async () => {
            mockVectorStore.upsertBatch.mockResolvedValue(undefined);

            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 7,
                    start_line: 1,
                    end_line: 1,
                    header_path: '',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.indexFile('/test.md', 'Content');

            // Simulate file save
            await manager.onFileSave('/test.md');

            expect(mockVectorStore.upsertBatch).toHaveBeenCalled();
        });
    });

    describe('File Management', () => {
        // TC-3.28: Remove file from cache and queue
        it('should remove file from cache and queue', async () => {
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Content 1',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 9,
                    start_line: 1,
                    end_line: 1,
                    header_path: '',
                },
                {
                    content: 'Content 2',
                    headers: [],
                    index: 1,
                    startPos: 10,
                    endPos: 19,
                    start_line: 2,
                    end_line: 2,
                    header_path: '',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.indexFile('/test.md', 'Content 1\nContent 2');

            expect(manager.getCacheSize()).toBe(2);
            expect(manager.getQueueSize()).toBe(2);

            manager.removeFile('/test.md');

            expect(manager.getCacheSize()).toBe(0);
            expect(manager.getQueueSize()).toBe(0);
        });

        // TC-3.29: Update file (remove old, add new)
        it('should update file by removing old and adding new chunks', async () => {
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Old content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 11,
                    start_line: 1,
                    end_line: 1,
                    header_path: '',
                },
            ]);

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Old summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.indexFile('/test.md', 'Old content');

            mockChunker.chunk.mockReturnValue([
                {
                    content: 'New content',
                    headers: [],
                    index: 0,
                    startPos: 0,
                    endPos: 11,
                    start_line: 1,
                    end_line: 1,
                    header_path: '',
                },
            ]);

            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'New summary',
                tags: [],
                category: '技术笔记',
            });

            await manager.updateFile('/test.md', 'New content');

            const cached = manager.getFromCache('/test.md-chunk-0');
            expect(cached?.content).toBe('New content');
        });
    });

    describe('Statistics', () => {
        it('should return cache statistics', () => {
            const stats = manager.getCacheStats();

            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('currentSize');
            expect(stats).toHaveProperty('maxSize');
        });

        it('should return queue statistics', () => {
            const stats = manager.getQueueStats();

            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('totalFlushed');
            expect(stats).toHaveProperty('flushCount');
        });
    });

    describe('Lifecycle', () => {
        it('should stop all background processes', () => {
            manager.stop();

            // Should not throw
            expect(() => manager.stop()).not.toThrow();
        });
    });
});
