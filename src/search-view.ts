import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VectorIndexManager } from './services/vector-index-manager';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Sidebar } from './components/Sidebar';

export const VIEW_TYPE_SEMANTIC_SEARCH = 'semantic-search-view';

export class SemanticSearchView extends ItemView {
    private indexManager: VectorIndexManager;
    private container: HTMLElement;
    private root: Root | null = null;

    constructor(leaf: WorkspaceLeaf, indexManager: VectorIndexManager) {
        super(leaf);
        this.indexManager = indexManager;
    }

    getViewType(): string {
        return VIEW_TYPE_SEMANTIC_SEARCH;
    }

    getDisplayText(): string {
        return '语义搜索';
    }

    getIcon(): string {
        return 'search';
    }

    async onOpen() {
        this.container = this.containerEl.children[1] as HTMLElement;
        this.container.empty();
        this.container.addClass('semantic-search-view');

        this.renderReact();

        // Listen for file open events
        window.addEventListener('memo-echo:open-file', this.handleOpenFile);
        window.addEventListener('memo-echo:index-current-file', this.handleIndexCurrentFile);
    }

    private renderReact() {
        this.root = createRoot(this.container);
        this.root.render(
            React.createElement(Sidebar, {
                indexManager: this.indexManager,
                initialMode: 'search'
            })
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }
        window.removeEventListener('memo-echo:open-file', this.handleOpenFile);
        window.removeEventListener('memo-echo:index-current-file', this.handleIndexCurrentFile);
    }

    private handleIndexCurrentFile = async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            console.warn("No active file to index");
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            await this.indexManager.indexFile(activeFile.path, content);
        } catch (e) {
            console.error(e);
        }
    };

    private handleOpenFile = async (event: any) => {
        const result = event.detail;
        if (!result || !result.metadata.filePath) return;

        const file = this.app.vault.getAbstractFileByPath(result.metadata.filePath);
        if (!file) return;

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as any);

        const view = leaf.view as any;
        if (view.editor && result.metadata.start_line > 0) {
            const editor = view.editor;
            editor.setCursor({ line: result.metadata.start_line - 1, ch: 0 });
            editor.scrollIntoView({
                from: { line: result.metadata.start_line - 1, ch: 0 },
                to: { line: result.metadata.start_line - 1, ch: 0 }
            }, true);
        }
    };
}
