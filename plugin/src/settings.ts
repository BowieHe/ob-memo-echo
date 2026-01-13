/**
 * Settings Tab - Refactored with indexing features
 */

import { App, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type ImageVectorPlugin from './main';

export interface ImageVectorSettings {
    // Embedding settings
    embeddingProvider: 'local' | 'ollama' | 'openai';
    ollamaUrl: string;
    ollamaModel: string;
    openaiApiKey: string;
    openaiModel: string;

    // Qdrant settings
    qdrantUrl: string;
    qdrantCollection: string;
}

export const DEFAULT_SETTINGS: ImageVectorSettings = {
    embeddingProvider: 'local',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'bge-m3',
    openaiApiKey: '',
    openaiModel: 'text-embedding-3-small',
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'obsidian_notes',
};

export class ImageVectorSettingTab extends PluginSettingTab {
    plugin: ImageVectorPlugin;
    private isIndexing = false;

    constructor(app: App, plugin: ImageVectorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '向量搜索设置' });

        // Service Status Section
        this.addServiceStatusSection(containerEl);

        // Indexing Section (NEW!)
        this.addIndexingSection(containerEl);

        // Embedding Provider Section
        this.addEmbeddingSection(containerEl);

        // Qdrant Section
        this.addQdrantSection(containerEl);

        // Database Actions Section
        this.addDatabaseActionsSection(containerEl);
    }

    private addIndexingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📚 索引管理' });

        // Index current file
        new Setting(containerEl)
            .setName('索引当前文件')
            .setDesc('索引当前打开的 Markdown 文件')
            .addButton(button => button
                .setButtonText('索引当前文件')
                .setCta()
                .onClick(async () => {
                    await this.indexCurrentFile();
                }));

        // Sync all files
        new Setting(containerEl)
            .setName('同步所有文档')
            .setDesc('增量同步整个 Vault (只索引新文件和已修改的文件)')
            .addButton(button => button
                .setButtonText('开始同步')
                .setWarning()
                .onClick(async () => {
                    await this.syncAllFiles();
                }));
    }

    private async indexCurrentFile() {
        if (this.isIndexing) {
            new Notice('正在索引中,请稍候...');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('❌ 没有打开的文件');
            return;
        }

        if (activeFile.extension !== 'md') {
            new Notice('❌ 只支持 Markdown 文件');
            return;
        }

        this.isIndexing = true;

        try {
            new Notice('🔄 正在索引文件...');

            // Read file content
            const content = await this.app.vault.read(activeFile);

            // Chunk the content
            const chunks = this.plugin.chunker.chunk(content);

            if (chunks.length === 0) {
                new Notice('⚠️ 文件内容为空');
                return;
            }

            // Generate embeddings and store
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.plugin.embeddingService.embed(chunk.content);

                await this.plugin.vectorStore.upsert({
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

            new Notice(`✅ 成功索引 ${chunks.length} 个文本块`);

            // Refresh stats
            this.display();

        } catch (error) {
            console.error('索引失败:', error);
            new Notice(`❌ 索引失败: ${error.message}`);
        } finally {
            this.isIndexing = false;
        }
    }

    private async syncAllFiles() {
        if (this.isIndexing) {
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

        this.isIndexing = true;

        try {
            new Notice('🔄 开始同步 Vault...');

            const files = this.app.vault.getMarkdownFiles();
            let indexed = 0;
            let updated = 0;
            let skipped = 0;
            let failed = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                try {
                    // Show progress every 10 files
                    if (i % 10 === 0) {
                        new Notice(`同步中: ${i}/${files.length} 文件...`);
                    }

                    // Check if file needs indexing
                    const needsIndexing = await this.checkIfNeedsIndexing(file);

                    if (!needsIndexing) {
                        skipped++;
                        continue;
                    }

                    // Read and chunk
                    const content = await this.app.vault.read(file);
                    const chunks = this.plugin.chunker.chunk(content);

                    if (chunks.length === 0) {
                        skipped++;
                        continue;
                    }

                    // Delete old chunks
                    const oldChunks = await this.getFileChunks(file.path);
                    if (oldChunks.length > 0) {
                        for (const oldChunk of oldChunks) {
                            await this.plugin.vectorStore.delete(oldChunk);
                        }
                        updated++;
                    } else {
                        indexed++;
                    }

                    // Index new chunks
                    for (const chunk of chunks) {
                        const embedding = await this.plugin.embeddingService.embed(chunk.content);

                        await this.plugin.vectorStore.upsert({
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

            new Notice(
                `✅ 同步完成!\n\n` +
                `新增: ${indexed} | 更新: ${updated}\n` +
                `跳过: ${skipped} | 失败: ${failed}`,
                10000
            );

            // Refresh stats
            this.display();

        } catch (error) {
            console.error('同步失败:', error);
            new Notice(`❌ 同步失败: ${error.message}`);
        } finally {
            this.isIndexing = false;
        }
    }

    private async checkIfNeedsIndexing(file: TFile): Promise<boolean> {
        try {
            const chunks = await this.getFileChunks(file.path);

            if (chunks.length === 0) {
                return true;
            }

            const firstChunk = await this.plugin.vectorStore.get(chunks[0]);
            if (!firstChunk || !firstChunk.metadata.fileModified) {
                return true;
            }

            const lastIndexed = firstChunk.metadata.fileModified as number;
            const currentModified = file.stat.mtime;

            return currentModified > lastIndexed;

        } catch (error) {
            return true;
        }
    }

    private async getFileChunks(filePath: string): Promise<string[]> {
        try {
            const allItems = await this.plugin.vectorStore.listAll(1000);
            return allItems
                .filter(item => item.metadata.filePath === filePath)
                .map(item => item.id);
        } catch (error) {
            return [];
        }
    }

    private addServiceStatusSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🔌 服务状态' });

        const statusContainer = containerEl.createDiv('stats-container');

        // Qdrant Status
        new Setting(statusContainer)
            .setName('Qdrant 状态')
            .setDesc('向量数据库连接状态')
            .addButton(button => button
                .setButtonText('检查连接')
                .onClick(async () => {
                    try {
                        const count = await this.plugin.vectorStore.count();
                        new Notice(`✅ Qdrant 已连接 (${count} 个向量)`);
                    } catch (error) {
                        new Notice(`❌ Qdrant 连接失败: ${error.message}`);
                    }
                }));

        // Ollama Status
        new Setting(statusContainer)
            .setName('Ollama 状态')
            .setDesc('Ollama 服务连接状态 (可选)')
            .addButton(button => button
                .setButtonText('检查连接')
                .onClick(async () => {
                    try {
                        const response = await fetch('http://localhost:11434/api/tags');
                        if (response.ok) {
                            const data = await response.json();
                            new Notice(`✅ Ollama 已连接 (${data.models?.length || 0} 个模型)`);
                        } else {
                            new Notice('❌ Ollama 连接失败');
                        }
                    } catch (error) {
                        new Notice(`❌ Ollama 未运行`);
                    }
                }));
    }

    private addEmbeddingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🤖 Embedding 设置' });

        // Provider selection
        new Setting(containerEl)
            .setName('Embedding 提供商')
            .setDesc('选择用于生成向量的服务')
            .addDropdown(dropdown => dropdown
                .addOption('local', '本地 (Transformers.js)')
                .addOption('ollama', 'Ollama')
                .addOption('openai', 'OpenAI')
                .setValue('local')
                .onChange(async (value: 'local' | 'ollama' | 'openai') => {
                    this.plugin.embeddingService.updateConfig({ provider: value });
                    new Notice(`✅ 已切换到 ${value} 提供商`);
                }));

        // Ollama settings
        new Setting(containerEl)
            .setName('Ollama URL')
            .setDesc('Ollama 服务地址')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue('http://localhost:11434')
                .onChange(async (value) => {
                    this.plugin.embeddingService.updateConfig({ ollamaUrl: value });
                }));

        new Setting(containerEl)
            .setName('Ollama 模型')
            .setDesc('使用的 Ollama 模型名称')
            .addText(text => text
                .setPlaceholder('bge-m3')
                .setValue('bge-m3')
                .onChange(async (value) => {
                    this.plugin.embeddingService.updateConfig({ ollamaModel: value });
                }));

        // OpenAI settings
        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('你的 OpenAI API 密钥')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue('')
                .onChange(async (value) => {
                    this.plugin.embeddingService.updateConfig({ openaiApiKey: value });
                }));
    }

    private addQdrantSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🗄️ Qdrant 设置' });

        new Setting(containerEl)
            .setName('Qdrant URL')
            .setDesc('Qdrant 服务地址 (修改后需重启插件)')
            .addText(text => text
                .setPlaceholder('http://localhost:6333')
                .setValue('http://localhost:6333'));

        new Setting(containerEl)
            .setName('集合名称')
            .setDesc('Qdrant 集合名称 (修改后需重启插件)')
            .addText(text => text
                .setPlaceholder('obsidian_notes')
                .setValue('obsidian_notes'));
    }

    private addDatabaseActionsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📊 数据库管理' });

        // Database stats
        const statsContainer = containerEl.createDiv('stats-container');
        this.updateStats(statsContainer);

        // Clear database button
        new Setting(containerEl)
            .setName('清空数据库')
            .setDesc('⚠️ 删除所有已索引的向量数据 (不可撤销!)')
            .addButton(button => button
                .setButtonText('清空数据库')
                .setWarning()
                .onClick(async () => {
                    const confirmed = confirm(
                        '⚠️ 确定要清空所有向量数据吗?\n\n此操作不可撤销!'
                    );

                    if (confirmed) {
                        try {
                            await this.plugin.vectorStore.clear();
                            new Notice('✅ 数据库已清空');
                            this.display();
                        } catch (error) {
                            new Notice(`❌ 清空失败: ${error.message}`);
                        }
                    }
                }));
    }

    private async updateStats(container: HTMLElement): Promise<void> {
        container.empty();

        try {
            const count = await this.plugin.vectorStore.count();

            const statsContent = container.createDiv('stats-content');
            statsContent.createEl('h4', { text: '数据库统计' });

            const statItem = statsContent.createDiv('stat-item');
            statItem.createEl('span', { text: '总向量数: ' });
            statItem.createEl('strong', { text: count.toString() });

            // Estimate files
            const estimatedFiles = Math.ceil(count / 5);
            const fileItem = statsContent.createDiv('stat-item');
            fileItem.createEl('span', { text: '约 ' });
            fileItem.createEl('strong', { text: estimatedFiles.toString() });
            fileItem.createEl('span', { text: ' 个文件' });
        } catch (error) {
            container.createEl('p', {
                text: `无法获取统计信息: ${error.message}`,
                cls: 'error-text',
            });
        }
    }
}
