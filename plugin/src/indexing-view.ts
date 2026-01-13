/**
 * IndexingView - Sidebar view for indexing files
 * Supports both single file and vault-wide incremental sync
 */

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { EmbeddingService } from './services/embedding-service';
import { VectorStore } from './services/vector-store';
import { Chunker } from './services/chunker';

export const INDEXING_VIEW_TYPE = 'image-vector-indexing';

export class IndexingView extends ItemView {
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStore;
    private chunker: Chunker;
    private isIndexing = false;
    private isSyncing = false;

    constructor(
        leaf: WorkspaceLeaf,
        embeddingService: EmbeddingService,
        vectorStore: VectorStore,
        chunker: Chunker
    ) {
        super(leaf);
        this.embeddingService = embeddingService;
        this.vectorStore = vectorStore;
        this.chunker = chunker;
    }

    getViewType(): string {
        return INDEXING_VIEW_TYPE;
    }

    getDisplayText(): string {
        return '向量索引';
    }

    getIcon(): string {
        return 'database';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('image-vector-indexing-view');

        // Header
        const header = container.createEl('div', { cls: 'indexing-header' });
        header.createEl('h4', { text: '向量索引' });

        // Current file info
        const fileInfo = container.createEl('div', { cls: 'file-info' });
        this.updateFileInfo(fileInfo);

        // Index current file button
        const buttonContainer = container.createEl('div', { cls: 'button-container' });
        const indexButton = buttonContainer.createEl('button', {
            text: '索引当前文件',
            cls: 'mod-cta',
        });

        indexButton.addEventListener('click', async () => {
            await this.indexCurrentFile();
        });

        // Sync all files button
        const syncButton = buttonContainer.createEl('button', {
            text: '同步所有文档',
            cls: 'mod-warning',
        });

        syncButton.addEventListener('click', async () => {
            await this.syncAllFiles();
        });

        // Status area
        const statusArea = container.createEl('div', { cls: 'status-area' });
        statusArea.createEl('div', { cls: 'status-text', text: '就绪' });

        // Progress area
        const progressArea = container.createEl('div', { cls: 'progress-area' });
        progressArea.style.display = 'none';

        // Stats
        const statsArea = container.createEl('div', { cls: 'stats-area' });
        await this.updateStats(statsArea);

        // Listen for active file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateFileInfo(fileInfo);
            })
        );
    }

    private updateFileInfo(container: HTMLElement) {
        container.empty();

        const activeFile = this.app.workspace.getActiveFile();

        if (activeFile) {
            container.createEl('p', {
                text: `当前文件: ${activeFile.basename}`,
                cls: 'current-file'
            });
            container.createEl('p', {
                text: `路径: ${activeFile.path}`,
                cls: 'file-path'
            });
        } else {
            container.createEl('p', {
                text: '没有打开的文件',
                cls: 'no-file'
            });
        }
    }

    private async indexCurrentFile() {
        if (this.isIndexing) {
            new Notice('正在索引中,请稍候...');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('没有打开的文件');
            return;
        }

        if (activeFile.extension !== 'md') {
            new Notice('只支持 Markdown 文件');
            return;
        }

        await this.indexFile(activeFile);
    }

    private async indexFile(file: TFile) {
        this.isIndexing = true;
        const statusEl = this.containerEl.querySelector('.status-text');

        try {
            if (statusEl) statusEl.setText('正在读取文件...');

            // Read file content
            const content = await this.app.vault.read(file);

            if (statusEl) statusEl.setText('正在切分文本...');

            // Chunk the content
            const chunks = this.chunker.chunk(content);

            if (chunks.length === 0) {
                new Notice('文件内容为空');
                return;
            }

            if (statusEl) statusEl.setText(`正在生成向量 (0/${chunks.length})...`);

            // Generate embeddings and store
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                if (statusEl) statusEl.setText(`正在生成向量 (${i + 1}/${chunks.length})...`);

                const embedding = await this.embeddingService.embed(chunk.content);

                await this.vectorStore.upsert({
                    id: `${file.path}-chunk-${chunk.index}`,
                    vector: embedding,
                    metadata: {
                        filePath: file.path,
                        fileName: file.basename,
                        content: chunk.content,
                        headers: chunk.headers,
                        startPos: chunk.startPos,
                        endPos: chunk.endPos,
                        indexedAt: Date.now(),
                    },
                });
            }

            if (statusEl) statusEl.setText('索引完成!');
            new Notice(`✅ 成功索引 ${chunks.length} 个文本块`);

            // Update stats
            const statsArea = this.containerEl.querySelector('.stats-area');
            if (statsArea) {
                await this.updateStats(statsArea as HTMLElement);
            }

        } catch (error) {
            console.error('索引失败:', error);
            new Notice(`❌ 索引失败: ${error.message}`);
            if (statusEl) statusEl.setText('索引失败');
        } finally {
            this.isIndexing = false;
        }
    }

    private async syncAllFiles() {
        if (this.isSyncing) {
            new Notice('正在同步中,请稍候...');
            return;
        }

        const confirmed = confirm(
            '确定要同步所有 Markdown 文件吗?\n\n' +
            '这将:\n' +
            '- 索引新文件\n' +
            '- 更新已修改的文件\n' +
            '- 跳过未修改的文件\n\n' +
            '可能需要一些时间,是否继续?'
        );

        if (!confirmed) {
            return;
        }

        this.isSyncing = true;
        const statusEl = this.containerEl.querySelector('.status-text');
        const progressArea = this.containerEl.querySelector('.progress-area') as HTMLElement;

        try {
            if (statusEl) statusEl.setText('正在扫描 Vault...');
            if (progressArea) progressArea.style.display = 'block';

            // Get all markdown files
            const files = this.app.vault.getMarkdownFiles();

            if (statusEl) statusEl.setText(`找到 ${files.length} 个文件,开始同步...`);

            let indexed = 0;
            let updated = 0;
            let skipped = 0;
            let failed = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                try {
                    if (statusEl) {
                        statusEl.setText(
                            `同步中 (${i + 1}/${files.length}): ${file.basename}\n` +
                            `新增: ${indexed} | 更新: ${updated} | 跳过: ${skipped} | 失败: ${failed}`
                        );
                    }

                    // Check if file needs indexing (incremental)
                    const needsIndexing = await this.checkIfNeedsIndexing(file);

                    if (!needsIndexing) {
                        skipped++;
                        continue;
                    }

                    // Read and chunk
                    const content = await this.app.vault.read(file);
                    const chunks = this.chunker.chunk(content);

                    if (chunks.length === 0) {
                        skipped++;
                        continue;
                    }

                    // Delete old chunks for this file
                    const oldChunks = await this.getFileChunks(file.path);
                    if (oldChunks.length > 0) {
                        for (const oldChunk of oldChunks) {
                            await this.vectorStore.delete(oldChunk);
                        }
                        updated++;
                    } else {
                        indexed++;
                    }

                    // Index new chunks
                    for (const chunk of chunks) {
                        const embedding = await this.embeddingService.embed(chunk.content);

                        await this.vectorStore.upsert({
                            id: `${file.path}-chunk-${chunk.index}`,
                            vector: embedding,
                            metadata: {
                                filePath: file.path,
                                fileName: file.basename,
                                content: chunk.content,
                                headers: chunk.headers,
                                startPos: chunk.startPos,
                                endPos: chunk.endPos,
                                indexedAt: Date.now(),
                                fileModified: file.stat.mtime,
                            },
                        });
                    }

                } catch (error) {
                    console.error(`Failed to sync ${file.path}:`, error);
                    failed++;
                }
            }

            if (statusEl) statusEl.setText('同步完成!');
            if (progressArea) progressArea.style.display = 'none';

            new Notice(
                `✅ 同步完成!\n\n` +
                `新增: ${indexed} 个文件\n` +
                `更新: ${updated} 个文件\n` +
                `跳过: ${skipped} 个文件\n` +
                `失败: ${failed} 个文件`,
                10000
            );

            // Update stats
            const statsArea = this.containerEl.querySelector('.stats-area');
            if (statsArea) {
                await this.updateStats(statsArea as HTMLElement);
            }

        } catch (error) {
            console.error('同步失败:', error);
            new Notice(`❌ 同步失败: ${error.message}`);
            if (statusEl) statusEl.setText('同步失败');
            if (progressArea) progressArea.style.display = 'none';
        } finally {
            this.isSyncing = false;
        }
    }

    private async checkIfNeedsIndexing(file: TFile): Promise<boolean> {
        try {
            // Get existing chunks for this file
            const chunks = await this.getFileChunks(file.path);

            if (chunks.length === 0) {
                // File not indexed yet
                return true;
            }

            // Check if file was modified after last indexing
            const firstChunk = await this.vectorStore.get(chunks[0]);
            if (!firstChunk || !firstChunk.metadata.fileModified) {
                // No modification time stored, re-index
                return true;
            }

            const lastIndexed = firstChunk.metadata.fileModified as number;
            const currentModified = file.stat.mtime;

            // Re-index if file was modified
            return currentModified > lastIndexed;

        } catch (error) {
            // On error, assume needs indexing
            return true;
        }
    }

    private async getFileChunks(filePath: string): Promise<string[]> {
        try {
            // List all items and filter by file path
            const allItems = await this.vectorStore.listAll(1000);
            return allItems
                .filter(item => item.metadata.filePath === filePath)
                .map(item => item.id);
        } catch (error) {
            return [];
        }
    }

    private async updateStats(container: HTMLElement) {
        container.empty();

        try {
            const count = await this.vectorStore.count();
            container.createEl('h5', { text: '数据库统计' });
            container.createEl('p', { text: `总向量数: ${count}` });

            // Estimate number of files (rough estimate)
            const estimatedFiles = Math.ceil(count / 5); // Assume ~5 chunks per file
            container.createEl('p', { text: `约 ${estimatedFiles} 个文件` });
        } catch (error) {
            container.createEl('p', {
                text: '无法获取统计信息',
                cls: 'error-text'
            });
        }
    }

    async onClose() {
        // Cleanup
    }
}
