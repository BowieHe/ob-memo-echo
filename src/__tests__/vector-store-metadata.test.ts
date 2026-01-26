/**
 * Unit tests for Vector Store Metadata Enhancement (v0.2.0)
 * Tests storage and retrieval of chunk metadata including line numbers and enhanced fields
 * REQUIRES: Qdrant running on localhost:6333
 */

import { VectorStore, VectorItem, SearchResult } from '../services/vector-store';

// Skip: Requires Qdrant running on localhost:6333
describe.skip('Vector Store Metadata Enhancement (v0.2.0)', () => {
    let vectorStore: VectorStore;
    const testCollectionName = 'test_metadata_collection';

    beforeEach(async () => {
        vectorStore = new VectorStore(testCollectionName, 'http://localhost:6333');
        // Clear any existing data
        await vectorStore.clear();
    });

    afterEach(async () => {
        // Cleanup
        await vectorStore.clear();
    });

    describe('Chunk Metadata Storage', () => {
        // TC-1.7: Store and retrieve chunk with line numbers
        it('should store and retrieve chunk with line numbers', async () => {
            const item: VectorItem = {
                id: 'test-chunk-1',
                vector: [0.1, 0.2, 0.3, 0.4],
                metadata: {
                    file_path: '/notes/test.md',
                    chunk_id: 'test.md#h1',
                    start_line: 10,
                    end_line: 25,
                    header_path: '# Test Header',
                    content: 'Test content',
                    point_type: 'text',
                },
            };

            await vectorStore.upsert(item);

            const retrieved = await vectorStore.get('test-chunk-1');

            expect(retrieved).not.toBeNull();
            expect(retrieved!.metadata.start_line).toBe(10);
            expect(retrieved!.metadata.end_line).toBe(25);
            expect(retrieved!.metadata.header_path).toBe('# Test Header');
        });

        // TC-1.8: Store and retrieve chunk with metadata
        it('should store and retrieve chunk with v0.2.0 metadata', async () => {
            const item: VectorItem = {
                id: 'test-chunk-2',
                vector: [0.5, 0.6, 0.7, 0.8],
                metadata: {
                    file_path: '/notes/rust.md',
                    chunk_id: 'rust.md#ownership',
                    start_line: 15,
                    end_line: 28,
                    header_path: '# Rust > ## Ownership',
                    content: 'Rust ownership system...',
                    point_type: 'text',

                    // v0.2.0 enhanced metadata
                    summary: 'Introduction to Rust ownership system',
                    tags: ['rust', 'ownership', 'memory-safety'],
                    category: '技术笔记',
                    word_count: 245,
                    created_at: Date.now(),
                    updated_at: Date.now(),
                },
            };

            await vectorStore.upsert(item);

            const retrieved = await vectorStore.get('test-chunk-2');

            expect(retrieved).not.toBeNull();
            expect(retrieved!.metadata.summary).toBe('Introduction to Rust ownership system');
            expect(retrieved!.metadata.tags).toEqual(['rust', 'ownership', 'memory-safety']);
            expect(retrieved!.metadata.category).toBe('技术笔记');
            expect(retrieved!.metadata.word_count).toBe(245);
            expect(retrieved!.metadata.created_at).toBeDefined();
            expect(retrieved!.metadata.updated_at).toBeDefined();
        });

        // TC-1.9: Search returns metadata correctly
        it('should return metadata in search results', async () => {
            const items: VectorItem[] = [
                {
                    id: 'chunk-1',
                    vector: [1.0, 0.0, 0.0, 0.0],
                    metadata: {
                        file_path: '/notes/a.md',
                        chunk_id: 'a.md#intro',
                        start_line: 1,
                        end_line: 10,
                        header_path: '# Introduction',
                        content: 'Introduction content',
                        point_type: 'text',
                        summary: 'Intro summary',
                        tags: ['intro', 'basics'],
                        category: '技术笔记',
                    },
                },
                {
                    id: 'chunk-2',
                    vector: [0.9, 0.1, 0.0, 0.0],
                    metadata: {
                        file_path: '/notes/b.md',
                        chunk_id: 'b.md#details',
                        start_line: 20,
                        end_line: 35,
                        header_path: '# Details',
                        content: 'Detailed content',
                        point_type: 'text',
                        summary: 'Details summary',
                        tags: ['advanced', 'details'],
                        category: '技术笔记',
                    },
                },
            ];

            await vectorStore.upsertBatch(items);

            // Search with a similar vector
            const results = await vectorStore.search([1.0, 0.0, 0.0, 0.0], 2);

            expect(results.length).toBeGreaterThan(0);

            // Check that metadata is present in results
            results.forEach(result => {
                expect(result.metadata).toBeDefined();
                expect(result.metadata.start_line).toBeDefined();
                expect(result.metadata.end_line).toBeDefined();
                expect(result.metadata.header_path).toBeDefined();
                expect(result.metadata.content).toBeDefined();

                // Check v0.2.0 fields if present
                if (result.metadata.summary) {
                    expect(typeof result.metadata.summary).toBe('string');
                }
                if (result.metadata.tags) {
                    expect(Array.isArray(result.metadata.tags)).toBe(true);
                }
            });
        });

        // TC-1.10: Batch upsert with metadata
        it('should handle batch upsert with enhanced metadata', async () => {
            const items: VectorItem[] = Array.from({ length: 5 }, (_, i) => ({
                id: `chunk-${i}`,
                vector: [Math.random(), Math.random(), Math.random(), Math.random()],
                metadata: {
                    file_path: `/notes/file-${i}.md`,
                    chunk_id: `file-${i}.md#section`,
                    start_line: i * 10 + 1,
                    end_line: i * 10 + 15,
                    header_path: `# Section ${i}`,
                    content: `Content ${i}`,
                    point_type: 'text',
                    summary: `Summary ${i}`,
                    tags: [`tag-${i}`, 'common'],
                    category: '技术笔记',
                    word_count: 100 + i * 10,
                },
            }));

            await vectorStore.upsertBatch(items);

            // Verify all items were stored
            const count = await vectorStore.count();
            expect(count).toBe(5);

            // Verify metadata for each item
            for (let i = 0; i < 5; i++) {
                const retrieved = await vectorStore.get(`chunk-${i}`);
                expect(retrieved).not.toBeNull();
                expect(retrieved!.metadata.start_line).toBe(i * 10 + 1);
                expect(retrieved!.metadata.end_line).toBe(i * 10 + 15);
                expect(retrieved!.metadata.summary).toBe(`Summary ${i}`);
                expect(retrieved!.metadata.tags).toContain(`tag-${i}`);
                expect(retrieved!.metadata.tags).toContain('common');
            }
        });
    });

    describe('Metadata Field Validation', () => {
        it('should handle missing optional metadata fields gracefully', async () => {
            const item: VectorItem = {
                id: 'minimal-chunk',
                vector: [0.1, 0.2, 0.3, 0.4],
                metadata: {
                    file_path: '/notes/minimal.md',
                    chunk_id: 'minimal.md#section',
                    start_line: 1,
                    end_line: 5,
                    header_path: '# Minimal',
                    content: 'Minimal content',
                    point_type: 'text',
                    // No summary, tags, category, etc.
                },
            };

            await vectorStore.upsert(item);

            const retrieved = await vectorStore.get('minimal-chunk');

            expect(retrieved).not.toBeNull();
            expect(retrieved!.metadata.file_path).toBe('/notes/minimal.md');
            expect(retrieved!.metadata.start_line).toBe(1);
            expect(retrieved!.metadata.end_line).toBe(5);
        });

        it('should preserve all metadata types correctly', async () => {
            const now = Date.now();
            const item: VectorItem = {
                id: 'typed-chunk',
                vector: [0.1, 0.2, 0.3, 0.4],
                metadata: {
                    file_path: '/notes/typed.md',
                    chunk_id: 'typed.md#section',
                    start_line: 10,                    // number
                    end_line: 20,                      // number
                    header_path: '# Typed',            // string
                    content: 'Content',                // string
                    point_type: 'text',                // string
                    summary: 'Summary text',           // string
                    tags: ['tag1', 'tag2', 'tag3'],    // array
                    category: '技术笔记',               // string
                    word_count: 150,                   // number
                    created_at: now,                   // number (timestamp)
                    updated_at: now + 1000,            // number (timestamp)
                },
            };

            await vectorStore.upsert(item);

            const retrieved = await vectorStore.get('typed-chunk');

            expect(retrieved).not.toBeNull();

            // Verify types
            expect(typeof retrieved!.metadata.start_line).toBe('number');
            expect(typeof retrieved!.metadata.end_line).toBe('number');
            expect(typeof retrieved!.metadata.header_path).toBe('string');
            expect(typeof retrieved!.metadata.summary).toBe('string');
            expect(Array.isArray(retrieved!.metadata.tags)).toBe(true);
            expect(typeof retrieved!.metadata.category).toBe('string');
            expect(typeof retrieved!.metadata.word_count).toBe('number');
            expect(typeof retrieved!.metadata.created_at).toBe('number');
            expect(typeof retrieved!.metadata.updated_at).toBe('number');

            // Verify values
            expect(retrieved!.metadata.created_at).toBe(now);
            expect(retrieved!.metadata.updated_at).toBe(now + 1000);
        });
    });

    describe('Backwards Compatibility', () => {
        it('should work with v0.1.0 metadata structure', async () => {
            // Old metadata structure without v0.2.0 fields
            const oldItem: VectorItem = {
                id: 'old-chunk',
                vector: [0.1, 0.2, 0.3, 0.4],
                metadata: {
                    file_path: '/notes/old.md',
                    content: 'Old content',
                    point_type: 'text',
                },
            };

            await vectorStore.upsert(oldItem);

            const retrieved = await vectorStore.get('old-chunk');

            expect(retrieved).not.toBeNull();
            expect(retrieved!.metadata.file_path).toBe('/notes/old.md');
            expect(retrieved!.metadata.content).toBe('Old content');
        });
    });
});
