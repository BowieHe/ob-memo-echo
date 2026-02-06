import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VectorIndexManager } from '../services/vector-index-manager';
import type { SearchResult } from '../services/vector-backend';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Sidebar } from '../components/Sidebar';
import { VIEW_TYPE_UNIFIED_SEARCH } from '../core/constants';

/**
 * UnifiedSearchView - Combines Search and Recommendation functionality
 * 
 * Behavior:
 * - When search box is empty: Shows ambient recommendations (auto-updates on paragraph changes)
 * - When search box has content: Shows search results
 */
export class UnifiedSearchView extends ItemView {
    private indexManager: VectorIndexManager;
    private onIndexCurrentFile: () => Promise<void>;
    private container: HTMLElement;
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        indexManager: VectorIndexManager,
        onIndexCurrentFile: () => Promise<void>,
    ) {
        super(leaf);
        this.indexManager = indexManager;
        this.onIndexCurrentFile = onIndexCurrentFile;
    }

    getViewType(): string {
        return VIEW_TYPE_UNIFIED_SEARCH;
    }

    getDisplayText(): string {
        return '检索';
    }

    getIcon(): string {
        return 'search';
    }

    async onOpen(): Promise<void> {
        this.container = this.containerEl.children[1] as HTMLElement;
        this.container.empty();
        this.container.addClass('unified-search-view');

        // Mount React Component
        this.renderReact();

        // Listen for file open events from React
        window.addEventListener('memo-echo:open-file', this.handleOpenFile);
        // Listen for index current file button click
        window.addEventListener('memo-echo:index-current-file', this.handleIndexCurrentFile);
    }

    private renderReact() {
        this.root = createRoot(this.container);
        this.root.render(
            React.createElement(Sidebar, {
                indexManager: this.indexManager,
                initialMode: 'ambient', // Start with ambient mode (empty search)
                onIndexCurrent: this.handleIndexCurrentFile,
            })
        );
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
    private handleIndexCurrentFile = async () => {
        await this.onIndexCurrentFile();
    };

    /**
     * Handle file open event from React
     */
    private handleOpenFile = async (event: any) => {
        const result = event.detail as SearchResult;
        if (!result || !result.metadata.filePath) return;

        await this.jumpToResult(result);
    };

    /**
     * Called by Main Plugin when paragraph changes (for ambient recommendations)
     * This method enables the paragraph detector integration
     */
    async updateRecommendations(paragraph: string): Promise<void> {
        try {
            // Search for similar content
            const results = await this.indexManager.search(paragraph, { limit: 5 });

            // Dispatch event for React component to update ambient results
            window.dispatchEvent(new CustomEvent('memo-echo:ambient-update', {
                detail: results
            }));
        } catch (error) {
            console.error('[UnifiedSearchView] Failed to get recommendations:', error);
        }
    }

    /**
     * Jump to search result
     */
    private async jumpToResult(result: SearchResult): Promise<void> {
        const filePath = result.metadata.filePath;
        const startLine = result.metadata.start_line || 0;

        if (!filePath) return;

        // Open file
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) return;

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as any);

        // Jump to specific line if available
        const view = leaf.view as any;
        if (view.editor && startLine > 0) {
            const editor = view.editor;
            editor.setCursor({ line: startLine - 1, ch: 0 });

            // Scroll to the target line
            const endLine = result.metadata.end_line || startLine;
            editor.scrollIntoView({
                from: { line: startLine - 1, ch: 0 },
                to: { line: endLine, ch: 0 }
            }, true);
        }
    }
}
