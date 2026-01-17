import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VectorIndexManager } from './services/vector-index-manager';
import { SearchResult } from './services/vector-store';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Sidebar } from './components/Sidebar';

export const VIEW_TYPE_RECOMMENDATION = 'recommendation-view';

export class RecommendationView extends ItemView {
    private indexManager: VectorIndexManager;
    private container: HTMLElement;
    private root: Root | null = null;

    constructor(leaf: WorkspaceLeaf, indexManager: VectorIndexManager) {
        super(leaf);
        this.indexManager = indexManager;
    }

    getViewType(): string {
        return VIEW_TYPE_RECOMMENDATION;
    }

    getDisplayText(): string {
        return '🔗 相关笔记推荐';
    }

    getIcon(): string {
        return 'links';
    }

    async onOpen(): Promise<void> {
        this.container = this.containerEl.children[1] as HTMLElement;
        this.container.empty();
        this.container.addClass('recommendation-view');

        // Mount React Component
        this.renderReact();

        // Listen for file open events from React
        window.addEventListener('memo-echo:open-file', this.handleOpenFile);
    }

    private renderReact() {
        this.root = createRoot(this.container);
        this.root.render(
            React.createElement(Sidebar, {
                indexManager: this.indexManager
            })
        );
    }

    async onClose(): Promise<void> {
        if (this.root) {
            this.root.unmount();
        }
        window.removeEventListener('memo-echo:open-file', this.handleOpenFile);
    }

    /**
     * Handle file open event from React
     */
    private handleOpenFile = async (event: CustomEvent<SearchResult>) => {
        const result = event.detail;
        if (!result || !result.metadata.filePath) return;

        await this.jumpToResult(result);
    };

    /**
     * Called by Main Plugin when paragraph changes
     */
    async updateRecommendations(paragraph: string): Promise<void> {
        try {
            // Search manually and dispatch event to React
            const results = await this.indexManager.search(paragraph, { limit: 5 });

            // Dispatch event for React component to listen to
            window.dispatchEvent(new CustomEvent('memo-echo:ambient-update', {
                detail: results
            }));
        } catch (error) {
            console.error('Failed to get recommendations:', error);
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

        const view = leaf.view as any;
        if (view.editor && result.metadata.start_line > 0) {
            const editor = view.editor;
            editor.setCursor({ line: result.metadata.start_line - 1, ch: 0 });

            // Highlight/Scroll
            const endLine = result.metadata.end_line || result.metadata.start_line;
            editor.scrollIntoView({
                from: { line: result.metadata.start_line - 1, ch: 0 },
                to: { line: endLine, ch: 0 }
            }, true);
        }
    }
}
