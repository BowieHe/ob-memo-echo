/**
 * RecommendationView - Displays auto-recommendations in sidebar
 * Shows related notes based on current paragraph
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VectorIndexManager } from './services/vector-index-manager';
import { SearchResult } from './services/vector-store';

export const VIEW_TYPE_RECOMMENDATION = 'recommendation-view';

export class RecommendationView extends ItemView {
    private indexManager: VectorIndexManager;
    private recommendations: SearchResult[] = [];
    private isLoading: boolean = false;

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
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('recommendation-view');

        this.renderView(container);
    }

    /**
     * Render the recommendation view
     */
    private renderView(container: HTMLElement): void {
        // Header
        const header = container.createDiv({ cls: 'recommendation-header' });
        header.createEl('h4', { text: '🔗 相关笔记推荐' });
        header.createEl('p', {
            text: '基于当前段落自动查找',
            cls: 'recommendation-subtitle'
        });

        // Loading indicator
        const loadingEl = container.createDiv({ cls: 'recommendation-loading' });
        loadingEl.createEl('p', { text: '💡 等待段落完成...' });
        loadingEl.style.display = this.isLoading ? 'block' : 'none';

        // Results container
        const resultsContainer = container.createDiv({ cls: 'recommendation-results' });

        if (this.recommendations.length === 0 && !this.isLoading) {
            resultsContainer.createEl('p', {
                text: '完成一个段落后，这里会显示相关笔记',
                cls: 'recommendation-empty'
            });
        } else {
            this.renderRecommendations(resultsContainer);
        }

        // Actions
        const actions = container.createDiv({ cls: 'recommendation-actions' });

        const refreshBtn = actions.createEl('button', { text: '刷新推荐' });
        refreshBtn.addEventListener('click', () => this.refresh());

        const manualBtn = actions.createEl('button', { text: '手动触发' });
        manualBtn.addEventListener('click', () => this.triggerManual());
    }

    /**
     * Render recommendation results
     */
    private renderRecommendations(container: HTMLElement): void {
        container.empty();

        for (const result of this.recommendations) {
            const item = container.createDiv({ cls: 'recommendation-item' });

            // File name and score
            const header = item.createDiv({ cls: 'recommendation-item-header' });
            const fileName = result.metadata.filePath?.split('/').pop() || 'Unknown';
            header.createEl('span', {
                text: `📝 ${fileName}`,
                cls: 'recommendation-file'
            });
            header.createEl('span', {
                text: `${Math.round(result.score * 100)}%`,
                cls: 'recommendation-score'
            });

            // Line numbers
            if (result.metadata.start_line && result.metadata.end_line) {
                item.createEl('div', {
                    text: `📍 行 ${result.metadata.start_line}-${result.metadata.end_line}`,
                    cls: 'recommendation-lines'
                });
            }

            // Summary
            if (result.metadata.summary) {
                item.createEl('div', {
                    text: result.metadata.summary,
                    cls: 'recommendation-summary'
                });
            }

            // Tags
            if (result.metadata.tags && result.metadata.tags.length > 0) {
                const tagsContainer = item.createDiv({ cls: 'recommendation-tags' });
                tagsContainer.createEl('span', { text: '🏷️ ' });
                result.metadata.tags.forEach((tag: string) => {
                    tagsContainer.createEl('span', {
                        text: tag,
                        cls: 'recommendation-tag'
                    });
                });
            }

            // Content preview
            const preview = result.metadata.content?.substring(0, 150) || '';
            item.createEl('div', {
                text: preview + (preview.length >= 150 ? '...' : ''),
                cls: 'recommendation-preview'
            });

            // Click to jump
            item.addEventListener('click', () => {
                this.jumpToResult(result);
            });
        }
    }

    /**
     * Update recommendations
     */
    async updateRecommendations(paragraph: string): Promise<void> {
        this.isLoading = true;
        this.refresh();

        try {
            // Search for related paragraphs
            this.recommendations = await this.indexManager.search(paragraph, 5);

            this.isLoading = false;
            this.refresh();
        } catch (error) {
            console.error('Failed to get recommendations:', error);
            this.isLoading = false;
            this.refresh();
        }
    }

    /**
     * Refresh the view
     */
    private refresh(): void {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.renderView(container);
    }

    /**
     * Trigger manual recommendation
     */
    private async triggerManual(): Promise<void> {
        // Get current editor content
        const activeView = this.app.workspace.getActiveViewOfType(ItemView);
        if (!activeView) return;

        // This would need to extract current paragraph from editor
        // For now, just show a notice
        // new Notice('请在编辑器中完成一个段落');
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

        // Jump to line
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor && startLine > 0) {
            editor.setCursor({ line: startLine - 1, ch: 0 });
            editor.scrollIntoView({ from: { line: startLine - 1, ch: 0 }, to: { line: startLine - 1, ch: 0 } }, true);
        }
    }

    async onClose(): Promise<void> {
        // Cleanup
    }
}
