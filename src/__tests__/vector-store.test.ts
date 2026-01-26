/**
 * Unit tests for VectorStore
 * Tests vector storage, search, and management using Qdrant
 * REQUIRES: Qdrant running on localhost:6333
 */

import { VectorStore } from '../services/vector-store';

// Skip: Requires Qdrant running on localhost:6333
describe.skip('VectorStore', () => {
    let store: VectorStore;
    const testCollection = 'test_collection_' + Date.now();

    beforeEach(async () => {
        store = new VectorStore(testCollection, 'http://localhost:6333');
        await store.initialize();
    });

    afterEach(async () => {
        // Cleanup - delete test collection
        try {
            await store.clear();
        } catch (e) {
            // Collection might not exist
        }
    });

    describe('Initialization', () => {
        it('should initialize without errors', async () => {
            expect(store).toBeDefined();
        });

        it('should create collection', async () => {
            const count = await store.count();
            expect(count).toBe(0);
        });
    });

    describe('Insert Operations', () => {
        it('should insert a single vector', async () => {
            const vector = new Array(384).fill(0).map(() => Math.random());

            await store.upsert({
                id: 'test-1',
                vector,
                metadata: {
                    path: 'test.md',
                    content: 'Test content',
                },
            });

            const result = await store.get('test-1');
            expect(result).toBeDefined();
            expect(result?.id).toBe('test-1');
            expect(result?.metadata.path).toBe('test.md');
        });

        it('should insert multiple vectors in batch', async () => {
            const items = [
                {
                    id: 'test-1',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test1.md', content: 'Content 1' },
                },
                {
                    id: 'test-2',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test2.md', content: 'Content 2' },
                },
                {
                    id: 'test-3',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test3.md', content: 'Content 3' },
                },
            ];

            await store.upsertBatch(items);

            const result1 = await store.get('test-1');
            const result2 = await store.get('test-2');
            const result3 = await store.get('test-3');

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result3).toBeDefined();
        });

        it('should update existing vector', async () => {
            const vector1 = new Array(384).fill(0).map(() => Math.random());
            const vector2 = new Array(384).fill(0).map(() => Math.random());

            await store.upsert({
                id: 'test-1',
                vector: vector1,
                metadata: { path: 'test.md', content: 'Original' },
            });

            await store.upsert({
                id: 'test-1',
                vector: vector2,
                metadata: { path: 'test.md', content: 'Updated' },
            });

            const result = await store.get('test-1');
            expect(result?.metadata.content).toBe('Updated');
        });
    });

    describe('Search Operations', () => {
        beforeEach(async () => {
            // Insert test data
            const items = [
                {
                    id: 'doc-1',
                    vector: [1, 0, 0, ...new Array(381).fill(0)],
                    metadata: { path: 'doc1.md', content: 'First document' },
                },
                {
                    id: 'doc-2',
                    vector: [0, 1, 0, ...new Array(381).fill(0)],
                    metadata: { path: 'doc2.md', content: 'Second document' },
                },
                {
                    id: 'doc-3',
                    vector: [0, 0, 1, ...new Array(381).fill(0)],
                    metadata: { path: 'doc3.md', content: 'Third document' },
                },
            ];

            await store.upsertBatch(items);
        });

        it('should search and return similar vectors', async () => {
            const queryVector = [0.9, 0.1, 0, ...new Array(381).fill(0)];
            const results = await store.search(queryVector, 2);

            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('doc-1'); // Most similar
        });

        it('should respect limit parameter', async () => {
            const queryVector = [1, 1, 1, ...new Array(381).fill(0)];
            const results = await store.search(queryVector, 1);

            expect(results).toHaveLength(1);
        });

        it('should return results sorted by similarity', async () => {
            const queryVector = [0, 0.9, 0.1, ...new Array(381).fill(0)];
            const results = await store.search(queryVector, 3);

            expect(results).toHaveLength(3);
            // Scores should be descending
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
            expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
        });

        it('should handle empty index', async () => {
            const emptyStore = new VectorStore('empty_' + Date.now(), 'http://localhost:6333');
            await emptyStore.initialize();

            const queryVector = new Array(384).fill(0).map(() => Math.random());
            const results = await emptyStore.search(queryVector, 10);

            expect(results).toHaveLength(0);

            await emptyStore.clear();
        });
    });

    describe('Delete Operations', () => {
        it('should delete a single vector', async () => {
            await store.upsert({
                id: 'test-1',
                vector: new Array(384).fill(0).map(() => Math.random()),
                metadata: { path: 'test.md' },
            });

            await store.delete('test-1');

            const result = await store.get('test-1');
            expect(result).toBeNull();
        });

        it('should delete multiple vectors', async () => {
            await store.upsertBatch([
                {
                    id: 'test-1',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test1.md' },
                },
                {
                    id: 'test-2',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test2.md' },
                },
            ]);

            await store.deleteBatch(['test-1', 'test-2']);

            const result1 = await store.get('test-1');
            const result2 = await store.get('test-2');

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should clear all vectors', async () => {
            await store.upsertBatch([
                {
                    id: 'test-1',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test1.md' },
                },
                {
                    id: 'test-2',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test2.md' },
                },
            ]);

            await store.clear();

            const count = await store.count();
            expect(count).toBe(0);
        });
    });

    describe('Statistics', () => {
        it('should return correct item count', async () => {
            await store.upsertBatch([
                {
                    id: 'test-1',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test1.md' },
                },
                {
                    id: 'test-2',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test2.md' },
                },
                {
                    id: 'test-3',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test3.md' },
                },
            ]);

            const count = await store.count();
            expect(count).toBe(3);
        });

        it('should list all items', async () => {
            await store.upsertBatch([
                {
                    id: 'test-1',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test1.md' },
                },
                {
                    id: 'test-2',
                    vector: new Array(384).fill(0).map(() => Math.random()),
                    metadata: { path: 'test2.md' },
                },
            ]);

            const items = await store.listAll();
            expect(items).toHaveLength(2);
            expect(items.map(i => i.id)).toContain('test-1');
            expect(items.map(i => i.id)).toContain('test-2');
        });
    });
});
