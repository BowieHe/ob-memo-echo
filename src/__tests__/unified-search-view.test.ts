import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { UnifiedSearchView } from '../unified-search-view';
import { VectorIndexManager } from '@services/vector-index-manager';
import { WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_UNIFIED_SEARCH } from '@core/constants';

// Mock dependencies
vi.mock('react-dom/client', () => ({
    createRoot: vi.fn(() => ({
        render: vi.fn(),
        unmount: vi.fn(),
    })),
}));
vi.mock('../services/vector-index-manager');

describe('UnifiedSearchView', () => {
    let view: UnifiedSearchView;
    let mockLeaf: any;
    let mockIndexManager: any;
    let mockOnIndexCurrentFile: Mock;
    let mockApp: any;

    beforeEach(() => {
        // Setup app mock
        mockApp = {
            vault: {
                getAbstractFileByPath: vi.fn(),
            },
            workspace: {
                getLeaf: vi.fn(),
            },
        };

        // Setup leaf mocks
        mockLeaf = {
            view: null,
            workspace: {} as any,
        } as any;

        mockIndexManager = {
            search: vi.fn().mockResolvedValue([]),
        } as any;

        mockOnIndexCurrentFile = vi.fn().mockResolvedValue(undefined);

        // Create view instance
        view = new UnifiedSearchView(
            mockLeaf,
            mockIndexManager,
            mockOnIndexCurrentFile,
        );

        // Set app on view
        (view as any).app = mockApp;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('View Type and Display', () => {
        it('should return correct view type', () => {
            expect(view.getViewType()).toBe(VIEW_TYPE_UNIFIED_SEARCH);
        });

        it('should return correct display text', () => {
            expect(view.getDisplayText()).toBe('检索');
        });

        it('should return correct icon', () => {
            expect(view.getIcon()).toBe('search');
        });
    });

    describe('Initialization', () => {
        it('should initialize with ambient mode (empty search)', () => {
            // The view should render Sidebar component with initialMode='ambient'
            // This is tested through React component rendering
            expect(view).toBeDefined();
        });

        it('should register event listeners on open', async () => {
            const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

            // Mock containerEl with Obsidian HTMLElement methods
            const mockContainer = document.createElement('div');
            (mockContainer as any).empty = vi.fn();
            (mockContainer as any).addClass = vi.fn();

            view.containerEl = {
                children: [null, mockContainer],
            } as any;

            await view.onOpen();

            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'memo-echo:open-file',
                expect.any(Function)
            );
            expect(addEventListenerSpy).toHaveBeenCalledWith(
                'memo-echo:index-current-file',
                expect.any(Function)
            );

            addEventListenerSpy.mockRestore();
        });

        it('should remove event listeners on close', async () => {
            const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

            await view.onClose();

            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'memo-echo:open-file',
                expect.any(Function)
            );
            expect(removeEventListenerSpy).toHaveBeenCalledWith(
                'memo-echo:index-current-file',
                expect.any(Function)
            );

            removeEventListenerSpy.mockRestore();
        });
    });

    describe('Index Current File Handler', () => {
        it('should call onIndexCurrentFile when index button is triggered', async () => {
            // Mock containerEl with Obsidian HTMLElement methods
            const mockContainer = document.createElement('div');
            (mockContainer as any).empty = vi.fn();
            (mockContainer as any).addClass = vi.fn();

            view.containerEl = {
                children: [null, mockContainer],
            } as any;

            await view.onOpen();

            // Simulate index current file event
            window.dispatchEvent(new CustomEvent('memo-echo:index-current-file'));

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockOnIndexCurrentFile).toHaveBeenCalled();
        });
    });

    describe('Recommendation Updates (Ambient Mode)', () => {
        it('should have updateRecommendations method for paragraph detector', async () => {
            expect(view.updateRecommendations).toBeDefined();
        });

        it('should search and dispatch ambient-update event when updateRecommendations is called', async () => {
            const mockResults = [
                { id: '1', score: 0.9, metadata: { filePath: 'test.md' } },
            ];
            mockIndexManager.search.mockResolvedValue(mockResults as any);

            const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

            await view.updateRecommendations('test paragraph content');

            expect(mockIndexManager.search).toHaveBeenCalledWith(
                'test paragraph content',
                { limit: 5 }
            );

            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'memo-echo:ambient-update',
                    detail: mockResults,
                })
            );

            dispatchEventSpy.mockRestore();
        });
    });

    describe('File Open Handler', () => {
        it('should handle file open event from React component', async () => {
            // Setup specific mocks for this test
            const mockFile = { path: 'test.md' };
            const mockEditor = {
                setCursor: vi.fn(),
                scrollIntoView: vi.fn(),
            };
            const mockLeafView = {
                editor: mockEditor,
            };
            const mockNewLeaf = {
                openFile: vi.fn().mockResolvedValue(undefined),
                view: mockLeafView,
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockApp.workspace.getLeaf.mockReturnValue(mockNewLeaf);

            // Mock containerEl with Obsidian HTMLElement methods
            const mockContainer = document.createElement('div');
            (mockContainer as any).empty = vi.fn();
            (mockContainer as any).addClass = vi.fn();

            view.containerEl = {
                children: [null, mockContainer],
            } as any;

            await view.onOpen();

            // Simulate file open event
            const searchResult = {
                id: '1',
                score: 0.9,
                metadata: {
                    filePath: 'test.md',
                    start_line: 10,
                    end_line: 15,
                },
            };

            window.dispatchEvent(
                new CustomEvent('memo-echo:open-file', { detail: searchResult })
            );

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockNewLeaf.openFile).toHaveBeenCalledWith(mockFile);
            expect(mockEditor.setCursor).toHaveBeenCalledWith({
                line: 9, // start_line - 1
                ch: 0,
            });
        });
    });

    describe('Integration with Sidebar Component', () => {
        it('should pass indexManager to Sidebar component', () => {
            // This is implicitly tested through React rendering
            // The actual rendering is mocked, but we can verify the view stores the indexManager
            expect((view as any).indexManager).toBe(mockIndexManager);
        });

        it('should pass onIndexCurrentFile callback to Sidebar component', () => {
            expect((view as any).onIndexCurrentFile).toBe(mockOnIndexCurrentFile);
        });
    });
});
