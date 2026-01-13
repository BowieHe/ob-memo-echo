/**
 * Unit tests for SearchView (refactored version)
 * Tests search functionality using new TypeScript services
 */

import { SemanticSearchView } from '../search-view';
import { EmbeddingService } from '../services/embedding-service';
import { VectorStore } from '../services/vector-store';

// Mock Obsidian API
jest.mock('obsidian', () => ({
    ItemView: class {
        containerEl = {
            children: [null, document.createElement('div')],
        };
        app = {
            workspace: {
                getActiveFile: jest.fn(),
                openLinkText: jest.fn(),
            },
            vault: {
                read: jest.fn(),
            },
        };
    },
    Notice: jest.fn(),
}));

describe('SearchView', () => {
    let searchView: any;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockVectorStore: jest.Mocked<VectorStore>;
    let mockLeaf: any;

    beforeEach(() => {
        // Create mocks
        mockEmbeddingService = {
            embed: jest.fn(),
            embedBatch: jest.fn(),
            updateConfig: jest.fn(),
        } as any;

        mockVectorStore = {
            search: jest.fn(),
            count: jest.fn(),
            initialize: jest.fn(),
        } as any;

        mockLeaf = {
            view: null,
        };

        // Create SearchView instance
        searchView = new SemanticSearchView(
            mockLeaf,
            mockEmbeddingService,
            mockVectorStore
        );
    });

    describe('Search Functionality', () => {
        it('should perform search with query', async () => {
            const query = 'test query';
            const mockEmbedding = new Array(384).fill(0).map(() => Math.random());
            const mockResults = [
                {
                    id: 'doc1-chunk-0',
                    score: 0.95,
                    metadata: {
                        filePath: 'test.md',
                        fileName: 'test',
                        content: 'Test content',
                        headers: [],
                    },
                },
            ];

            mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
            mockVectorStore.search.mockResolvedValue(mockResults);

            await searchView.performSearch(query);

            expect(mockEmbeddingService.embed).toHaveBeenCalledWith(query);
            expect(mockVectorStore.search).toHaveBeenCalledWith(mockEmbedding, 10);
        });

        it('should handle empty query', async () => {
            await searchView.performSearch('');

            expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
            expect(mockVectorStore.search).not.toHaveBeenCalled();
        });

        it('should handle search errors gracefully', async () => {
            mockEmbeddingService.embed.mockRejectedValue(new Error('Embedding failed'));

            await searchView.performSearch('test');

            // Should not throw, should handle error internally
            expect(mockEmbeddingService.embed).toHaveBeenCalled();
        });

        it('should limit results to specified count', async () => {
            const mockEmbedding = new Array(384).fill(0);
            mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
            mockVectorStore.search.mockResolvedValue([]);

            await searchView.performSearch('test', 5);

            expect(mockVectorStore.search).toHaveBeenCalledWith(mockEmbedding, 5);
        });
    });

    describe('Result Display', () => {
        it('should format search results correctly', () => {
            const result = {
                id: 'doc1-chunk-0',
                score: 0.856,
                metadata: {
                    filePath: 'notes/test.md',
                    fileName: 'test',
                    content: 'This is a test content with some text',
                    headers: [
                        { level: 1, text: 'Main Title' },
                        { level: 2, text: 'Section' },
                    ],
                },
            };

            const formatted = searchView.formatResult(result);

            expect(formatted).toHaveProperty('path', 'notes/test.md');
            expect(formatted).toHaveProperty('score', '86%');
            expect(formatted).toHaveProperty('preview');
            expect(formatted.preview.length).toBeLessThanOrEqual(100);
        });

        it('should handle results without headers', () => {
            const result = {
                id: 'doc1-chunk-0',
                score: 0.75,
                metadata: {
                    filePath: 'test.md',
                    fileName: 'test',
                    content: 'Content without headers',
                    headers: [],
                },
            };

            const formatted = searchView.formatResult(result);

            expect(formatted).toBeDefined();
            expect(formatted.headers).toEqual([]);
        });

        it('should truncate long content previews', () => {
            const longContent = 'A'.repeat(500);
            const result = {
                id: 'doc1-chunk-0',
                score: 0.9,
                metadata: {
                    filePath: 'test.md',
                    fileName: 'test',
                    content: longContent,
                    headers: [],
                },
            };

            const formatted = searchView.formatResult(result);

            expect(formatted.preview.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Statistics', () => {
        it('should get database statistics', async () => {
            mockVectorStore.count.mockResolvedValue(150);

            const stats = await searchView.getStats();

            expect(stats.totalVectors).toBe(150);
            expect(mockVectorStore.count).toHaveBeenCalled();
        });

        it('should handle stats errors', async () => {
            mockVectorStore.count.mockRejectedValue(new Error('Connection failed'));

            const stats = await searchView.getStats();

            expect(stats.totalVectors).toBe(0);
            expect(stats.error).toBeDefined();
        });
    });

    describe('File Navigation', () => {
        it('should open file when result is clicked', async () => {
            const filePath = 'notes/test.md';

            await searchView.openFile(filePath);

            expect(searchView.app.workspace.openLinkText).toHaveBeenCalledWith(
                filePath,
                '',
                false
            );
        });

        it('should handle navigation errors', async () => {
            searchView.app.workspace.openLinkText.mockRejectedValue(
                new Error('File not found')
            );

            await searchView.openFile('nonexistent.md');

            // Should not throw
            expect(searchView.app.workspace.openLinkText).toHaveBeenCalled();
        });
    });
});
