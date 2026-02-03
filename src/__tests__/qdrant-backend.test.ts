/**
 * Unit tests for QdrantBackend
 * Tests conflict handling and collection creation race conditions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QdrantBackend } from '../services/qdrant-backend';
import { QdrantClient } from '@qdrant/js-client-rest';

// Mock QdrantClient
vi.mock('@qdrant/js-client-rest', () => ({
    QdrantClient: vi.fn(),
}));

describe('QdrantBackend', () => {
    let backend: QdrantBackend;
    let mockClient: any;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock client
        mockClient = {
            getCollection: vi.fn(),
            createCollection: vi.fn(),
            query: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            deleteCollection: vi.fn(),
        };

        // Setup QdrantClient constructor to return mock
        vi.mocked(QdrantClient).mockImplementation(() => mockClient as any);

        // Create backend instance
        backend = new QdrantBackend('test_collection', 'http://localhost:6333');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('searchWithFusion - Conflict Handling', () => {
        it('should handle collection not found error and create collection', async () => {
            // Mock getCollection to throw 404 error
            mockClient.getCollection.mockRejectedValue(new Error('Not found'));

            // Mock createCollection to succeed
            mockClient.createCollection.mockResolvedValue({ status: 'ok' });

            // Mock query to return empty results
            mockClient.query.mockResolvedValue({
                points: [],
            });

            const queryVector = Array(384).fill(0.1);
            const result = await backend.searchWithFusion(queryVector);

            // Verify collection was created
            expect(mockClient.getCollection).toHaveBeenCalledWith('test_collection');
            expect(mockClient.createCollection).toHaveBeenCalledWith('test_collection', {
                vectors: {
                    content_vec: { size: 384, distance: 'Cosine' },
                    summary_vec: { size: 384, distance: 'Cosine' },
                    title_vec: { size: 384, distance: 'Cosine' },
                },
            });

            // Should return empty results
            expect(result).toEqual([]);
            expect(mockClient.query).not.toHaveBeenCalled();
        });

        it('should handle empty collection and return empty results', async () => {
            // Mock collection exists but is empty
            mockClient.getCollection.mockResolvedValue({
                points_count: 0,
                config: {},
            });

            const queryVector = Array(384).fill(0.1);
            const result = await backend.searchWithFusion(queryVector);

            // Verify no search was performed
            expect(mockClient.query).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('should perform search when collection has data', async () => {
            // Mock collection exists with data
            mockClient.getCollection.mockResolvedValue({
                points_count: 10,
                config: {},
            });

            // Mock search results
            mockClient.query.mockResolvedValue({
                points: [
                    {
                        id: 'test-point-1',
                        score: 0.95,
                        payload: {
                            _customId: 'chunk-1',
                            filePath: 'test.md',
                            content: 'Test content',
                        },
                    },
                ],
            });

            const queryVector = Array(384).fill(0.1);
            const result = await backend.searchWithFusion(queryVector);

            // Verify search was performed
            expect(mockClient.query).toHaveBeenCalledWith('test_collection', {
                prefetch: [
                    {
                        query: queryVector,
                        using: 'content_vec',
                        limit: 20,
                        filter: undefined,
                    },
                    {
                        query: queryVector,
                        using: 'summary_vec',
                        limit: 20,
                        filter: undefined,
                    },
                    {
                        query: queryVector,
                        using: 'title_vec',
                        limit: 20,
                        filter: undefined,
                    },
                ],
                query: { fusion: 'rrf' },
                limit: 10,
                with_payload: true,
            });

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('chunk-1');
            expect(result[0].score).toBe(0.95);
        });

        it('should handle conflict error during concurrent collection creation', async () => {
            // First call: collection not found
            mockClient.getCollection
                .mockRejectedValueOnce(new Error('Not found'))
                // Second call: collection exists (created by concurrent request)
                .mockResolvedValueOnce({
                    points_count: 0,
                    config: {},
                });

            // Create collection throws conflict (already exists)
            mockClient.createCollection.mockRejectedValue(new Error('Conflict'));

            const queryVector = Array(384).fill(0.1);
            const result = await backend.searchWithFusion(queryVector);

            // Should handle conflict gracefully and return empty results
            expect(result).toEqual([]);
        });

        it('should perform search with tag filter', async () => {
            mockClient.getCollection.mockResolvedValue({
                points_count: 10,
                config: {},
            });

            mockClient.query.mockResolvedValue({ points: [] });

            const queryVector = Array(384).fill(0.1);
            await backend.searchWithFusion(queryVector, {
                limit: 5,
                filter: { tags: ['important', 'todo'] },
            });

            // Verify filter was passed correctly
            expect(mockClient.query).toHaveBeenCalledWith('test_collection', {
                prefetch: [
                    {
                        query: queryVector,
                        using: 'content_vec',
                        limit: 10,
                        filter: {
                            must: [
                                {
                                    key: 'tags',
                                    match: { any: ['important', 'todo'] },
                                },
                            ],
                        },
                    },
                    {
                        query: queryVector,
                        using: 'summary_vec',
                        limit: 10,
                        filter: {
                            must: [
                                {
                                    key: 'tags',
                                    match: { any: ['important', 'todo'] },
                                },
                            ],
                        },
                    },
                    {
                        query: queryVector,
                        using: 'title_vec',
                        limit: 10,
                        filter: {
                            must: [
                                {
                                    key: 'tags',
                                    match: { any: ['important', 'todo'] },
                                },
                            ],
                        },
                    },
                ],
                query: { fusion: 'rrf' },
                limit: 5,
                with_payload: true,
            });
        });
    });

    describe('upsertMultiVector', () => {
        it('should auto-detect vector dimension on first upsert', async () => {
            mockClient.getCollection.mockRejectedValue(new Error('Not found'));
            mockClient.createCollection.mockResolvedValue({ status: 'ok' });
            mockClient.upsert.mockResolvedValue({ status: 'ok' });

            const item = {
                id: 'test-id',
                vectors: {
                    content_vec: Array(384).fill(0.1),
                    summary_vec: Array(384).fill(0.2),
                    title_vec: Array(384).fill(0.3),
                },
                metadata: {
                    filePath: 'test.md',
                    content: 'Test content',
                },
            };

            await backend.upsertMultiVector(item);

            expect(mockClient.createCollection).toHaveBeenCalledWith('test_collection', {
                vectors: {
                    content_vec: { size: 384, distance: 'Cosine' },
                    summary_vec: { size: 384, distance: 'Cosine' },
                    title_vec: { size: 384, distance: 'Cosine' },
                },
            });

            expect(mockClient.upsert).toHaveBeenCalled();
        });

        it('should reuse existing collection dimension on subsequent upserts', async () => {
            mockClient.getCollection.mockResolvedValue({
                points_count: 0,
                config: {},
            });
            mockClient.upsert.mockResolvedValue({ status: 'ok' });

            const item = {
                id: 'test-id',
                vectors: {
                    content_vec: Array(384).fill(0.1),
                    summary_vec: Array(384).fill(0.2),
                    title_vec: Array(384).fill(0.3),
                },
                metadata: {
                    filePath: 'test.md',
                    content: 'Test content',
                },
            };

            await backend.upsertMultiVector(item);

            // Should not try to create collection again
            expect(mockClient.createCollection).not.toHaveBeenCalled();
            expect(mockClient.upsert).toHaveBeenCalled();
        });
    });

    describe('delete and clear', () => {
        it('should delete by ID', async () => {
            mockClient.delete.mockResolvedValue({ status: 'ok' });

            await backend.delete('test-id');

            expect(mockClient.delete).toHaveBeenCalledWith('test_collection', {
                filter: {
                    must: [
                        {
                            key: '_customId',
                            match: { value: 'test-id' },
                        },
                    ],
                },
            });
        });

        it('should delete by file path', async () => {
            mockClient.delete.mockResolvedValue({ status: 'ok' });

            await backend.deleteByFilePath('test/path.md');

            expect(mockClient.delete).toHaveBeenCalledWith('test_collection', {
                filter: {
                    must: [
                        {
                            key: 'filePath',
                            match: { value: 'test/path.md' },
                        },
                    ],
                },
            });
        });

        it('should clear collection', async () => {
            mockClient.deleteCollection.mockResolvedValue({ status: 'ok' });

            await backend.clear();

            expect(mockClient.deleteCollection).toHaveBeenCalledWith('test_collection');
        });

        it('should handle clear when collection does not exist', async () => {
            mockClient.deleteCollection.mockRejectedValue(new Error('Not found'));

            await expect(backend.clear()).resolves.not.toThrow();
        });
    });

    describe('count', () => {
        it('should return count when collection exists', async () => {
            mockClient.getCollection.mockResolvedValue({
                points_count: 42,
                config: {},
            });

            const count = await backend.count();

            expect(count).toBe(42);
        });

        it('should return 0 when collection does not exist', async () => {
            mockClient.getCollection.mockRejectedValue(new Error('Not found'));

            const count = await backend.count();

            expect(count).toBe(0);
        });
    });
});
