/**
 * SemanticSearchView - Refactored to use TypeScript services
 * No longer depends on Rust API
 */

import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import { EmbeddingService } from './services/embedding-service';
import { VectorStore, SearchResult as VectorSearchResult } from './services/vector-store';

export const VIEW_TYPE_SEMANTIC_SEARCH = 'semantic-search-view';

export class SemanticSearchView extends ItemView {
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStore;
    private searchInput: HTMLInputElement;
    private resultsContainer: HTMLElement;
    private statusBar: HTMLElement;
    private statusIndicator: HTMLElement;
    private refreshButton: HTMLButtonElement;
    private isSearching: boolean = false;
    private isServiceConnected: boolean = false;

    constructor(
        leaf: WorkspaceLeaf,
        embeddingService: EmbeddingService,
        vectorStore: VectorStore
    ) {
        super(leaf);
        this.embeddingService = embeddingService;
        this.vectorStore = vectorStore;
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
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('semantic-search-view');

        // Create header with status indicator
        const header = container.createDiv('search-header');
        const headerTitle = header.createDiv('search-header-title');
        headerTitle.createEl('h4', { text: '🔍 语义搜索' });

        this.statusIndicator = header.createSpan('status-indicator');
        this.updateServiceStatus(false);

        // Create search input container with refresh button
        const searchContainer = container.createDiv('search-input-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '输入查询内容...',
            cls: 'search-input',
        });

        this.refreshButton = searchContainer.createEl('button', {
            text: '🔄',
            cls: 'refresh-button',
        });
        this.refreshButton.title = '刷新服务连接';
        this.refreshButton.addEventListener('click', () => {
            this.checkServiceStatus();
        });

        // Add event listeners for search
        this.searchInput.addEventListener('input', () => {
            this.debounceSearch();
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Add index current file button
        const indexButton = searchContainer.createEl('button', {
            text: '📑 索引当前文件',
            cls: 'index-current-button',
        });
        indexButton.addEventListener('click', async () => {
            console.log('Index button clicked!');
            try {
                await this.indexCurrentFile();
            } catch (error) {
                console.error('Error in button handler:', error);
                new Notice(`错误: ${error.message}`);
            }
        });

        // Create status bar
        this.statusBar = container.createDiv('search-status');
        this.updateStatus('准备就绪');

        // Create results container
        this.resultsContainer = container.createDiv('search-results');

        // Show initial message
        this.showEmptyState();

        // Check service status
        await this.checkServiceStatus();
    }

    async onClose() {
        // Cleanup
    }

    private debounceTimer: NodeJS.Timeout | null = null;

    private debounceSearch() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.performSearch();
        }, 500);
    }

    async performSearch(query?: string, limit: number = 10) {
        const searchQuery = query || this.searchInput.value.trim();

        if (!searchQuery) {
            this.showEmptyState();
            return;
        }

        if (!this.isServiceConnected) {
            this.showServiceError();
            return;
        }

        if (this.isSearching) {
            return;
        }

        this.isSearching = true;
        this.updateStatus('搜索中...');
        this.resultsContainer.empty();

        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddingService.embed(searchQuery);

            // Search in vector store
            const results = await this.vectorStore.search(queryEmbedding, limit);

            this.isSearching = false;

            if (results.length > 0) {
                this.updateStatus(`找到 ${results.length} 个结果`);
                this.displayResults(results);
            } else {
                this.updateStatus('未找到相关结果');
                this.showNoResults();
            }
        } catch (error) {
            this.isSearching = false;
            this.updateStatus('搜索失败');
            this.showError(error);
            console.error('Search error:', error);
        }
    }

    private displayResults(results: VectorSearchResult[]) {
        this.resultsContainer.empty();

        results.forEach((result) => {
            const resultItem = this.resultsContainer.createDiv('result-item');

            // Result header
            const resultHeader = resultItem.createDiv('result-header');

            // Icon (always document for now)
            const icon = resultHeader.createSpan('result-icon');
            icon.textContent = '📝';

            // File path
            const pathEl = resultHeader.createSpan('result-path');
            pathEl.textContent = result.metadata.filePath || result.metadata.fileName || result.id;

            // Score
            const scoreEl = resultHeader.createSpan('result-score');
            scoreEl.textContent = `${(result.score * 100).toFixed(1)}%`;

            // Headers (if available)
            if (result.metadata.headers && result.metadata.headers.length > 0) {
                const headersEl = resultItem.createDiv('result-headers');
                const headerPath = result.metadata.headers
                    .map((h: any) => h.text)
                    .join(' > ');
                headersEl.textContent = `📍 ${headerPath}`;
            }

            // Content preview
            const contentEl = resultItem.createDiv('result-content');
            contentEl.textContent = this.truncateContent(result.metadata.content || '', 100);

            // Click to open
            resultItem.addEventListener('click', () => {
                this.openFile(result.metadata.filePath, result.metadata.startPos);
            });

            // Add hover effect
            resultItem.addClass('clickable');
        });
    }

    async openFile(filePath: string, startPos?: number) {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);

                // TODO: Navigate to specific position if startPos is provided
                // This would require converting character position to line/column
            }
        } catch (error) {
            new Notice(`无法打开文件: ${filePath}`);
            console.error('Error opening file:', error);
        }
    }

    formatResult(result: VectorSearchResult) {
        return {
            path: result.metadata.filePath || result.id,
            score: `${Math.round(result.score * 100)}%`,
            preview: this.truncateContent(result.metadata.content || '', 100),
            headers: result.metadata.headers || [],
        };
    }

    async getStats() {
        try {
            const totalVectors = await this.vectorStore.count();
            return {
                totalVectors,
                error: undefined,
            };
        } catch (error) {
            return {
                totalVectors: 0,
                error: (error as Error).message,
            };
        }
    }

    private truncateContent(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength) + '...';
    }

    private showEmptyState() {
        this.resultsContainer.empty();
        const emptyState = this.resultsContainer.createDiv('empty-state');
        emptyState.createEl('p', {
            text: '💡 输入查询内容开始搜索',
            cls: 'empty-state-text',
        });
        this.updateStatus('准备就绪');
    }

    private showNoResults() {
        this.resultsContainer.empty();
        const noResults = this.resultsContainer.createDiv('empty-state');
        noResults.createEl('p', {
            text: '😕 未找到相关结果',
            cls: 'empty-state-text',
        });
    }

    private showServiceError() {
        this.resultsContainer.empty();
        const errorState = this.resultsContainer.createDiv('error-state');
        errorState.createEl('p', {
            text: '❌ 服务未连接',
            cls: 'error-state-text',
        });
        errorState.createEl('p', {
            text: '请点击右上角刷新按钮重试连接',
            cls: 'error-state-detail',
        });
    }

    private showError(error: any) {
        this.resultsContainer.empty();
        const errorState = this.resultsContainer.createDiv('error-state');
        errorState.createEl('p', {
            text: '❌ 搜索失败',
            cls: 'error-state-text',
        });
        errorState.createEl('p', {
            text: error.message || '请检查 Qdrant 服务是否正在运行',
            cls: 'error-state-detail',
        });
    }

    private updateStatus(text: string) {
        this.statusBar.textContent = text;
    }

    private updateServiceStatus(isConnected: boolean) {
        this.isServiceConnected = isConnected;
        this.statusIndicator.textContent = isConnected ? '🟢 已连接' : '🔴 未连接';
        this.statusIndicator.className = isConnected
            ? 'status-indicator connected'
            : 'status-indicator disconnected';
    }

    async checkServiceStatus(): Promise<boolean> {
        try {
            // Check Qdrant connection
            const count = await this.vectorStore.count();
            this.updateServiceStatus(true);
            this.updateStatus(`服务已连接 (${count} 个向量)`);
            return true;
        } catch (error) {
            this.updateServiceStatus(false);
            this.updateStatus('服务未连接');
            return false;
        }
    }

    /**
     * Public method to trigger search from outside
     */
    public async searchFor(query: string) {
        this.searchInput.value = query;
        await this.performSearch();
    }

    async indexCurrentFile() {
        console.log('indexCurrentFile called');
        const activeFile = this.app.workspace.getActiveFile();
        console.log('Active file:', activeFile?.path);

        if (!activeFile) {
            console.log('No active file');
            new Notice('❌ 没有打开的文件');
            return;
        }

        if (activeFile.extension !== 'md') {
            console.log('Not a markdown file');
            new Notice('❌ 只支持 Markdown 文件');
            return;
        }

        try {
            console.log('Starting indexing...');
            new Notice('🔄 正在索引文件...');

            const plugin = (this.app as any).plugins.plugins['obsidian-image-vector'];
            console.log('Plugin:', !!plugin, 'Chunker:', !!plugin?.chunker);

            if (!plugin || !plugin.chunker) {
                console.error('Plugin not loaded properly');
                new Notice('❌ 插件未正确加载');
                return;
            }

            const content = await this.app.vault.read(activeFile);
            console.log('File content length:', content.length);

            const chunks = plugin.chunker.chunk(content);
            console.log('Chunks generated:', chunks.length);

            if (chunks.length === 0) {
                new Notice('⚠️ 文件内容为空');
                return;
            }

            for (let i = 0; i < chunks.length; i++) {
                console.log(`Processing chunk ${i + 1}/${chunks.length}`);
                const chunk = chunks[i];
                const embedding = await this.embeddingService.embed(chunk.content);
                console.log('Embedding generated, dimension:', embedding.length);

                await this.vectorStore.upsert({
                    id: `${activeFile.path}-chunk-${chunk.index}`,
                    vector: embedding,
                    metadata: {
                        filePath: activeFile.path,
                        fileName: activeFile.basename,
                        content: chunk.content,
                        headers: chunk.headers,
                        startPos: chunk.startPos,
                        endPos: chunk.endPos,
                        indexedAt: Date.now(),
                        fileModified: activeFile.stat.mtime,
                    },
                });
            }

            console.log('Indexing completed successfully');
            new Notice(`✅ 成功索引 ${chunks.length} 个文本块`);

        } catch (error) {
            console.error('索引失败:', error);
            new Notice(`❌ 索引失败: ${error.message}`);
        }
    }
}
