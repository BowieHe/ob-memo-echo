/**
 * SemanticSearchView - Refactored to use TypeScript services
 * No longer depends on Rust API
 */

import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import { EmbeddingService } from './services/embedding-service';
import { VectorStore, SearchResult as VectorSearchResult } from './services/vector-store';
import { MetadataExtractor } from './services/metadata-extractor';

export const VIEW_TYPE_SEMANTIC_SEARCH = 'semantic-search-view';

export class SemanticSearchView extends ItemView {
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStore;
    private metadataExtractor: MetadataExtractor;
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
        vectorStore: VectorStore,
        metadataExtractor: MetadataExtractor
    ) {
        super(leaf);
        this.embeddingService = embeddingService;
        this.vectorStore = vectorStore;
        this.metadataExtractor = metadataExtractor;
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
            text: '📑',
            cls: 'index-current-button',
        });
        indexButton.title = '索引当前文件';
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

            // v0.2.0: Line numbers (if available)
            if (result.metadata.start_line && result.metadata.end_line) {
                const lineNumbersEl = resultItem.createDiv('result-line-numbers');
                lineNumbersEl.textContent = `📍 行 ${result.metadata.start_line}-${result.metadata.end_line}`;
            }

            // v0.2.0: Header path (if available)
            if (result.metadata.header_path) {
                const headerPathEl = resultItem.createDiv('result-header-path');
                headerPathEl.textContent = `${result.metadata.header_path}`;
            } else if (result.metadata.headers && result.metadata.headers.length > 0) {
                // Fallback to old format
                const headersEl = resultItem.createDiv('result-header-path');
                const headerPath = result.metadata.headers
                    .map((h: any) => h.text)
                    .join(' > ');
                headersEl.textContent = `${headerPath}`;
            }

            // v0.2.0: Summary (if available)
            if (result.metadata.summary) {
                const summaryEl = resultItem.createDiv('result-summary');
                summaryEl.textContent = `💡 ${result.metadata.summary}`;
            }

            // Content preview
            const contentEl = resultItem.createDiv('result-content');
            contentEl.textContent = this.truncateContent(result.metadata.content || '', 100);

            // v0.2.0: Tags (if available)
            if (result.metadata.tags && result.metadata.tags.length > 0) {
                const tagsContainer = resultItem.createDiv('result-tags');
                result.metadata.tags.forEach((tag: string) => {
                    const tagEl = tagsContainer.createSpan('result-tag');
                    tagEl.textContent = tag;
                });
            }

            // Action buttons container
            const actionsEl = resultItem.createDiv('result-actions');

            // v0.2.0: Copy link button
            const copyButton = actionsEl.createEl('button', {
                text: '🔗',
                cls: 'copy-link-button',
            });
            copyButton.title = '复制段落链接';
            copyButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent opening file
                this.copyParagraphLink(
                    result.metadata.filePath,
                    result.metadata.header_path || ''
                );
            });

            // Click to open with precise jump
            resultItem.addEventListener('click', () => {
                if (result.metadata.start_line) {
                    this.jumpToLine(
                        result.metadata.filePath,
                        result.metadata.start_line
                    );
                } else {
                    this.openFile(result.metadata.filePath, result.metadata.startPos);
                }
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

    /**
     * v0.2.0: Jump to specific line number with highlighting
     */
    async jumpToLine(filePath: string, lineNumber: number) {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);

                // Get the active editor
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    const editor = view.editor;

                    // Set cursor to line (convert to 0-indexed)
                    const line = lineNumber - 1;
                    editor.setCursor({ line, ch: 0 });

                    // Scroll into view
                    editor.scrollIntoView(
                        { from: { line, ch: 0 }, to: { line: line + 1, ch: 0 } },
                        true
                    );

                    // TODO: Add highlighting for 2 seconds
                    // This would require using CodeMirror decorations
                }
            }
        } catch (error) {
            new Notice(`无法跳转到行 ${lineNumber}`);
            console.error('Error jumping to line:', error);
        }
    }

    /**
     * v0.2.0: Copy paragraph link to clipboard
     */
    async copyParagraphLink(filePath: string, headerPath: string) {
        try {
            // Extract filename from path
            const fileName = filePath.split('/').pop() || filePath;

            // Format header path for Obsidian link
            // Convert "# H1 > ## H2" to "H1 > H2"
            const cleanHeaderPath = headerPath
                .replace(/#+\s*/g, '')
                .trim();

            // Create Obsidian link format: [[filename#header]]
            const link = cleanHeaderPath
                ? `[[${fileName}#${cleanHeaderPath}]]`
                : `[[${fileName}]]`;

            await navigator.clipboard.writeText(link);
            new Notice('✅ 已复制段落链接');
        } catch (error) {
            new Notice('❌ 复制失败');
            console.error('Error copying link:', error);
        }
    }

    formatResult(result: VectorSearchResult) {
        return {
            path: result.metadata.filePath || result.id,
            score: `${Math.round(result.score * 100)}%`,
            preview: this.truncateContent(result.metadata.content || '', 100),
            headers: result.metadata.headers || [],
            // v0.2.0 fields
            lineRange: result.metadata.start_line && result.metadata.end_line
                ? `${result.metadata.start_line}-${result.metadata.end_line}`
                : undefined,
            headerPath: result.metadata.header_path,
            summary: result.metadata.summary,
            tags: result.metadata.tags,
            category: result.metadata.category,
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

                // Generate embedding
                const embedding = await this.embeddingService.embed(chunk.content);
                console.log('Embedding generated, dimension:', embedding.length);

                // v0.2.0: Extract metadata using AI/rules
                let extractedMetadata;
                try {
                    extractedMetadata = await this.metadataExtractor.extract(chunk.content);
                    console.log('Metadata extracted:', extractedMetadata);
                } catch (error) {
                    console.warn('Metadata extraction failed, using defaults:', error);
                    extractedMetadata = {
                        summary: '',
                        tags: [],
                        category: '技术笔记',
                    };
                }

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
                        // v0.2.0: Enhanced metadata
                        start_line: chunk.start_line,
                        end_line: chunk.end_line,
                        header_path: chunk.header_path,
                        // v0.2.0: AI-extracted metadata
                        summary: extractedMetadata.summary,
                        tags: extractedMetadata.tags,
                        category: extractedMetadata.category,
                        word_count: chunk.content.length,
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
