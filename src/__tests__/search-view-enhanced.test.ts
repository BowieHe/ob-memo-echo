/**
 * Tests for Enhanced Search View (v0.2.0)
 * Tests line number display, header paths, precise jump, and copy link functionality
 */

import { SemanticSearchView } from '../search-view';
import { EmbeddingService } from '../services/embedding-service';
import { VectorStore, SearchResult } from '../services/vector-store';
import { MetadataExtractor } from '../services/metadata-extractor';

// Mock Obsidian API
const mockApp = {
    workspace: {
        getActiveFile: jest.fn(),
        getLeaf: jest.fn(),
        activeEditor: null,
    },
    vault: {
        getAbstractFileByPath: jest.fn(),
        read: jest.fn(),
    },
} as any;

const mockLeaf = {
    view: null,
    openFile: jest.fn(),
} as any;

describe('Enhanced Search View (v0.2.0)', () => {
    let searchView: SemanticSearchView;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockVectorStore: jest.Mocked<VectorStore>;
    let mockMetadataExtractor: jest.Mocked<MetadataExtractor>;

    beforeEach(() => {
        // Create mocks
        mockEmbeddingService = {
            embed: jest.fn(),
            embedBatch: jest.fn(),
            updateConfig: jest.fn(),
        } as any;

        mockVectorStore = {
            search: jest.fn(),
            upsert: jest.fn(),
            get: jest.fn(),
            count: jest.fn(),
            clear: jest.fn(),
        } as any;

        mockMetadataExtractor = {
            extract: jest.fn(),
            extractWithRules: jest.fn(),
        } as any;

        searchView = new SemanticSearchView(
            mockLeaf,
            mockEmbeddingService,
            mockVectorStore,
            mockMetadataExtractor
        );

        // Mock app
        (searchView as any).app = mockApp;
    });

    describe('Display Line Numbers and Header Paths', () => {
        // TC-1.11: Display line numbers in results
        it('should display line numbers in search results', async () => {
            const mockResults: SearchResult[] = [
                {
                    id: 'chunk-1',
                    score: 0.95,
                    metadata: {
                        filePath: '/notes/test.md',
                        content: 'Test content',
                        start_line: 10,
                        end_line: 25,
                        header_path: '# Test Header',
                    },
                },
            ];

            mockVectorStore.search.mockResolvedValue(mockResults);
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            // Create a mock container
            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            // Display results
            (searchView as any).displayResults(mockResults);

            // Check that line numbers are displayed
            const lineNumberEl = container.querySelector('.result-line-numbers');
            expect(lineNumberEl).toBeTruthy();
            expect(lineNumberEl?.textContent).toContain('10');
            expect(lineNumberEl?.textContent).toContain('25');
        });

        // TC-1.12: Display header path in results
        it('should display header path in search results', async () => {
            const mockResults: SearchResult[] = [
                {
                    id: 'chunk-1',
                    score: 0.92,
                    metadata: {
                        filePath: '/notes/rust.md',
                        content: 'Ownership content',
                        start_line: 15,
                        end_line: 28,
                        header_path: '# Rust > ## Ownership',
                    },
                },
            ];

            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            (searchView as any).displayResults(mockResults);

            // Check that header path is displayed
            const headerPathEl = container.querySelector('.result-header-path');
            expect(headerPathEl).toBeTruthy();
            expect(headerPathEl?.textContent).toContain('# Rust > ## Ownership');
        });

        // TC-1.15: Display summary and tags if available
        it('should display summary and tags when available', async () => {
            const mockResults: SearchResult[] = [
                {
                    id: 'chunk-1',
                    score: 0.88,
                    metadata: {
                        filePath: '/notes/test.md',
                        content: 'Test content',
                        start_line: 1,
                        end_line: 10,
                        header_path: '# Test',
                        summary: 'This is a test summary',
                        tags: ['test', 'example', 'demo'],
                        category: '技术笔记',
                    },
                },
            ];

            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            (searchView as any).displayResults(mockResults);

            // Check summary
            const summaryEl = container.querySelector('.result-summary');
            expect(summaryEl?.textContent).toContain('This is a test summary');

            // Check tags
            const tagsEl = container.querySelector('.result-tags');
            expect(tagsEl).toBeTruthy();
            expect(tagsEl?.textContent).toContain('test');
            expect(tagsEl?.textContent).toContain('example');
            expect(tagsEl?.textContent).toContain('demo');
        });
    });

    describe('Precise Jump to Line', () => {
        // TC-1.13: Jump to specific line on click
        it('should jump to specific line when result is clicked', async () => {
            const mockFile = {
                path: '/notes/test.md',
                basename: 'test',
                extension: 'md',
            } as any;

            const mockEditor = {
                setCursor: jest.fn(),
                scrollIntoView: jest.fn(),
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockApp.workspace.getLeaf.mockReturnValue(mockLeaf);
            mockApp.workspace.activeEditor = { editor: mockEditor };

            await (searchView as any).jumpToLine(mockFile, 15);

            // Should set cursor to line 15 (0-indexed = 14)
            expect(mockEditor.setCursor).toHaveBeenCalledWith(
                expect.objectContaining({ line: 14, ch: 0 })
            );

            // Should scroll into view
            expect(mockEditor.scrollIntoView).toHaveBeenCalled();
        });

        // TC-1.14: Highlight target lines for 2 seconds
        it('should highlight target lines temporarily', async () => {
            jest.useFakeTimers();

            const mockFile = {
                path: '/notes/test.md',
                basename: 'test',
                extension: 'md',
            } as any;

            const mockEditor = {
                setCursor: jest.fn(),
                scrollIntoView: jest.fn(),
                addHighlight: jest.fn(),
                removeHighlight: jest.fn(),
            };

            mockApp.workspace.activeEditor = { editor: mockEditor };

            await (searchView as any).highlightLines(mockEditor, 10, 15);

            // Should add highlight
            expect(mockEditor.addHighlight).toHaveBeenCalled();

            // Fast-forward 2 seconds
            jest.advanceTimersByTime(2000);

            // Should remove highlight after 2 seconds
            expect(mockEditor.removeHighlight).toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Copy Paragraph Link', () => {
        // TC-1.15: Copy paragraph link to clipboard
        it('should copy paragraph link in Obsidian format', async () => {
            const mockClipboard = {
                writeText: jest.fn(),
            };

            Object.assign(navigator, {
                clipboard: mockClipboard,
            });

            const filePath = '/notes/rust.md';
            const headerPath = '# Rust > ## Ownership';

            await (searchView as any).copyParagraphLink(filePath, headerPath);

            // Should copy in format: [[filename#header]]
            expect(mockClipboard.writeText).toHaveBeenCalledWith(
                '[[rust.md#Rust > Ownership]]'
            );
        });

        it('should handle copy link button click', () => {
            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            const mockResults: SearchResult[] = [
                {
                    id: 'chunk-1',
                    score: 0.9,
                    metadata: {
                        filePath: '/notes/test.md',
                        content: 'Content',
                        start_line: 1,
                        end_line: 10,
                        header_path: '# Test',
                    },
                },
            ];

            (searchView as any).displayResults(mockResults);

            // Find copy button
            const copyButton = container.querySelector('.copy-link-button');
            expect(copyButton).toBeTruthy();

            // Click should trigger copy
            const copySpy = jest.spyOn(searchView as any, 'copyParagraphLink');
            copyButton?.dispatchEvent(new MouseEvent('click'));

            expect(copySpy).toHaveBeenCalled();
        });
    });

    describe('Result Formatting', () => {
        it('should format result with all v0.2.0 fields', () => {
            const result: SearchResult = {
                id: 'chunk-1',
                score: 0.923,
                metadata: {
                    filePath: '/notes/rust.md',
                    content: 'Rust ownership system content...',
                    start_line: 15,
                    end_line: 28,
                    header_path: '# Rust > ## Ownership',
                    summary: 'Introduction to Rust ownership',
                    tags: ['rust', 'ownership', 'memory'],
                    category: '技术笔记',
                    word_count: 245,
                },
            };

            const formatted = searchView.formatResult(result);

            expect(formatted.path).toBe('/notes/rust.md');
            expect(formatted.score).toBe('92%');
            expect(formatted.lineRange).toBe('15-28');
            expect(formatted.headerPath).toBe('# Rust > ## Ownership');
            expect(formatted.summary).toBe('Introduction to Rust ownership');
            expect(formatted.tags).toEqual(['rust', 'ownership', 'memory']);
        });

        it('should handle missing optional fields gracefully', () => {
            const result: SearchResult = {
                id: 'chunk-1',
                score: 0.85,
                metadata: {
                    filePath: '/notes/simple.md',
                    content: 'Simple content',
                    // No line numbers, header path, summary, etc.
                },
            };

            const formatted = searchView.formatResult(result);

            expect(formatted.path).toBe('/notes/simple.md');
            expect(formatted.score).toBe('85%');
            expect(formatted.lineRange).toBeUndefined();
            expect(formatted.headerPath).toBeUndefined();
            expect(formatted.summary).toBeUndefined();
        });
    });

    describe('Backwards Compatibility', () => {
        it('should display v0.1.0 results without new fields', () => {
            const oldResults: SearchResult[] = [
                {
                    id: 'old-chunk',
                    score: 0.8,
                    metadata: {
                        filePath: '/notes/old.md',
                        content: 'Old content without new fields',
                        // No start_line, end_line, header_path, etc.
                    },
                },
            ];

            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            // Should not throw error
            expect(() => {
                (searchView as any).displayResults(oldResults);
            }).not.toThrow();

            // Should still display basic info
            expect(container.textContent).toContain('old.md');
            expect(container.textContent).toContain('80');
        });
    });

    describe('UI Layout', () => {
        it('should have proper CSS classes for styling', () => {
            const container = document.createElement('div');
            (searchView as any).resultsContainer = container;

            const mockResults: SearchResult[] = [
                {
                    id: 'chunk-1',
                    score: 0.9,
                    metadata: {
                        filePath: '/notes/test.md',
                        content: 'Test',
                        start_line: 1,
                        end_line: 10,
                        header_path: '# Test',
                    },
                },
            ];

            (searchView as any).displayResults(mockResults);

            // Check for expected CSS classes
            expect(container.querySelector('.result-item')).toBeTruthy();
            expect(container.querySelector('.result-header')).toBeTruthy();
            expect(container.querySelector('.result-line-numbers')).toBeTruthy();
            expect(container.querySelector('.result-header-path')).toBeTruthy();
            expect(container.querySelector('.result-content')).toBeTruthy();
        });
    });
});
