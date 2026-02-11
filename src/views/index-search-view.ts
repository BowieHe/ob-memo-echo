import { ItemView, WorkspaceLeaf } from 'obsidian';
import { SearchService } from '../services/search-service';
import type { SearchResult } from '../services/search-service';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Sidebar } from '../components/Sidebar';
import { VIEW_TYPE_INDEX_SEARCH } from '../core/constants';

/**
 * IndexSearchView - Search and display related notes
 *
 * Behavior:
 * - When search box is empty: Shows related notes (concept/summary/title based)
 * - When search box has content: Shows search results
 */
export class IndexSearchView extends ItemView {
    private searchService: SearchService;
    private onIndexCurrentFile: () => Promise<void>;
    private container!: HTMLElement;
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        searchService: SearchService,
        onIndexCurrentFile: () => Promise<void>,
    ) {
        super(leaf);
        this.searchService = searchService;
        this.onIndexCurrentFile = onIndexCurrentFile;
    }

    getViewType(): string {
        return VIEW_TYPE_INDEX_SEARCH;
    }

    getDisplayText(): string {
        return '检索';
    }

    getIcon(): string {
        return 'search';
    }

    async onOpen(): Promise<void> {
        // Safe: Use existing container or create fallback
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) {
            console.warn('[IndexSearchView] Container element not found at children[1], creating fallback container');
            this.container = this.containerEl.createDiv('unified-search-view-container');
        } else {
            this.container = container;
            this.container.empty();
            this.container.addClass('unified-search-view');
        }

        // Mount React Component
        this.renderReact();

        // Listen for file open events from React
        window.addEventListener('memo-echo:open-file', this.handleOpenFile);
        // Listen for index current file button click
        window.addEventListener('memo-echo:index-current-file', this.handleIndexCurrentFile);
    }

    private renderReact() {
        try {
            if (!this.container) {
                console.error('[IndexSearchView] Container is null, cannot mount React component');
                return;
            }

            this.root = createRoot(this.container);
            this.root.render(
                React.createElement(Sidebar, {
                    searchService: this.searchService,
                    initialMode: 'ambient', // Start with ambient mode (empty search)
                    onIndexCurrent: this.handleIndexCurrentFile,
                })
            );

            console.log('[IndexSearchView] ✅ React component mounted successfully');
        } catch (error) {
            console.error('[IndexSearchView] ❌ Failed to mount React component:', error);
        }
    }

    async onClose(): Promise<void> {
        if (this.root) {
            this.root.unmount();
        }
        window.removeEventListener('memo-echo:open-file', this.handleOpenFile);
        window.removeEventListener('memo-echo:index-current-file', this.handleIndexCurrentFile);
    }

    /**
     * Handle index current file button click
     */
    private handleIndexCurrentFile = () => {
        return this.onIndexCurrentFile();
    };

    /**
     * Handle file open event from React
     */
    private handleOpenFile = (event: WindowEventMap['memo-echo:open-file']) => {
        const result = event.detail;
        if (!result || !result.notePath) return;

        void this.openNote(result.notePath);
    };

    /**
     * Called by Main Plugin when paragraph changes (for ambient recommendations)
     * This method enables the paragraph detector integration
     */
    async updateRecommendations(paragraph: string): Promise<void> {
        try {
            // Search for similar content using SearchService
            const results = await this.searchService.search(paragraph, undefined, 5);

            // Dispatch event for React component to update ambient results
            window.dispatchEvent(new CustomEvent('memo-echo:ambient-update', {
                detail: results
            }));
        } catch (error) {
            console.error('[IndexSearchView] Failed to get recommendations:', error);
        }
    }

    /**
     * Open note in workspace
     */
    private async openNote(notePath: string): Promise<void> {
        if (!notePath) return;

        // Open file
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!file) return;

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as any);
    }
}
