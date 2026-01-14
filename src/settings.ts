/**
 * Settings Tab - Refactored with indexing features
 */

import { App, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type ImageVectorPlugin from './main';

export interface ImageVectorSettings {
    // Embedding settings
    embeddingProvider: 'local' | 'ollama' | 'openai';
    ollamaUrl: string;       // Used for Ollama Embedding
    ollamaModel: string;     // Embedding model
    openaiApiKey: string;    // Used for OpenAI Embedding
    openaiModel: string;     // Embedding model

    // AI Generation settings (Metadata Extraction)
    enableAiMetadata: boolean;
    aiGenProvider: 'ollama' | 'openai';
    aiGenUrl: string;        // Dedicated URL for generation
    aiGenModel: string;      // Generation/Chat model
    aiGenApiKey: string;     // Dedicated API key for generation

    // Qdrant settings
    qdrantUrl: string;
    qdrantCollection: string;
}

export const DEFAULT_SETTINGS: ImageVectorSettings = {
    embeddingProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'qwen3-embedding:4b',
    openaiApiKey: '',
    openaiModel: 'text-embedding-3-small',

    enableAiMetadata: true,
    aiGenProvider: 'ollama',
    aiGenUrl: 'http://localhost:11434',
    aiGenModel: 'qwen2.5:7b',
    aiGenApiKey: '',

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

        // AI Generation Section (NEW!)
        this.addAiGenerationSection(containerEl);

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
            console.log(`\n========== 开始索引文件 ==========`);
            console.log(`📄 文件: ${activeFile.path}`);

            // Read file content
            const content = await this.app.vault.read(activeFile);
            console.log(`📝 文件长度: ${content.length} 字符`);

            // Chunk the content
            console.log(`\n✂️ 开始分块...`);
            const chunks = this.plugin.chunker.chunk(content);
            console.log(`✅ 分块完成: ${chunks.length} 个块`);

            if (chunks.length === 0) {
                new Notice('⚠️ 文件内容为空');
                console.log(`⚠️ 文件内容为空，跳过索引`);
                return;
            }

            // Log chunk details
            chunks.forEach((chunk, idx) => {
                console.log(`\n--- 块 ${idx + 1}/${chunks.length} ---`);
                console.log(`  📍 位置: 行 ${chunk.start_line}-${chunk.end_line}`);
                console.log(`  📏 长度: ${chunk.content.length} 字符`);
                console.log(`  🏷️ 标题路径: ${chunk.header_path || '(无)'}`);
                console.log(`  📖 内容预览: ${chunk.content.substring(0, 100)}...`);
            });

            // Generate embeddings and store
            console.log(`\n🤖 开始生成 Embedding...`);
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`\n[${i + 1}/${chunks.length}] 处理块...`);

                // Generate embedding
                const startTime = Date.now();
                const embedding = await this.plugin.embeddingService.embed(chunk.content);
                const embedTime = Date.now() - startTime;
                console.log(`  ✅ Embedding 生成完成 (${embedTime}ms, 维度: ${embedding.length})`);

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
                console.log(`  💾 已存储到 Qdrant`);
            }

            console.log(`\n========== 索引完成 ==========`);
            console.log(`✅ 成功索引 ${chunks.length} 个文本块\n`);
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
        containerEl.createEl('h3', { text: '🤖 Embedding 模型设置 (搜索)' });

        // Provider selection
        new Setting(containerEl)
            .setName('Embedding 提供商')
            .setDesc('选择用于生成向量的服务')
            .addDropdown(dropdown => dropdown
                .addOption('local', '本地 (Transformers.js)')
                .addOption('ollama', 'Ollama')
                .addOption('openai', 'OpenAI')
                .setValue(this.plugin.settings.embeddingProvider)
                .onChange(async (value: 'local' | 'ollama' | 'openai') => {
                    this.plugin.settings.embeddingProvider = value;
                    await this.plugin.saveSettings();
                    this.plugin.embeddingService.updateConfig({ provider: value });
                    // Refresh to show/hide relevant fields
                    this.display();
                    new Notice(`✅ 已切换到 ${value} 提供商`);
                }));

        if (this.plugin.settings.embeddingProvider === 'ollama') {
            // Ollama settings
            new Setting(containerEl)
                .setName('Ollama URL')
                .setDesc('Ollama 服务地址')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.ollamaUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaUrl = value;
                        await this.plugin.saveSettings();
                        this.plugin.embeddingService.updateConfig({ ollamaUrl: value });
                    }));

            // Ollama Embedding Model dropdown
            const embedModelSetting = new Setting(containerEl)
                .setName('Ollama Embedding 模型')
                .setDesc('用于生成向量的模型 (必须是 Embedding 模型!)');

            embedModelSetting.addDropdown(async (dropdown) => {
                try {
                    const response = await fetch(`${this.plugin.settings.ollamaUrl}/api/tags`);
                    if (response.ok) {
                        const data = await response.json();
                        const models = data.models || [];
                        const embedModels = models.filter((m: any) =>
                            m.name.toLowerCase().includes('embed') ||
                            m.name.toLowerCase().includes('bge')
                        );

                        if (embedModels.length > 0) {
                            embedModels.forEach((model: any) => dropdown.addOption(model.name, model.name));
                        } else {
                            dropdown.addOption('', '(未找到 embedding 模型)');
                            if (this.plugin.settings.ollamaModel) {
                                dropdown.addOption(this.plugin.settings.ollamaModel, this.plugin.settings.ollamaModel);
                            }
                        }
                    } else {
                        dropdown.addOption('', '(无法连接 Ollama)');
                    }
                } catch (error) {
                    dropdown.addOption('', '(Ollama 未运行)');
                }

                dropdown
                    .setValue(this.plugin.settings.ollamaModel)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaModel = value;
                        await this.plugin.saveSettings();
                        this.plugin.embeddingService.updateConfig({ ollamaModel: value });
                    });
            });

            // Add refresh button to refetch models
            embedModelSetting.addButton(button => button
                .setButtonText('刷新列表')
                .setTooltip('刷新模型列表')
                .onClick(() => {
                    this.display();
                }));
        }

        if (this.plugin.settings.embeddingProvider === 'openai') {
            // OpenAI settings
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('你的 OpenAI API 密钥')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.openaiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiApiKey = value;
                        await this.plugin.saveSettings();
                        this.plugin.embeddingService.updateConfig({ openaiApiKey: value });
                    }));

            new Setting(containerEl)
                .setName('OpenAI Embedding 模型')
                .addText(text => text
                    .setPlaceholder('text-embedding-3-small')
                    .setValue(this.plugin.settings.openaiModel)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiModel = value;
                        await this.plugin.saveSettings();
                        this.plugin.embeddingService.updateConfig({ openaiModel: value });
                    }));
        }
    }

    private addAiGenerationSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📝 AI 智能提取设置 (总结/标签)' });

        // Toggle
        new Setting(containerEl)
            .setName('启用 AI 智能提取')
            .setDesc('使用 LLM 模型自动生成文档总结、分类和标签。关闭将使用基于规则的快速提取。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAiMetadata)
                .onChange(async (value) => {
                    this.plugin.settings.enableAiMetadata = value;
                    await this.plugin.saveSettings();
                    if (this.plugin.metadataExtractor) {
                        this.plugin.metadataExtractor.updateConfig({ enableAi: value });
                    }
                    // Refresh to show/hide detailed settings
                    this.display();
                }));

        if (!this.plugin.settings.enableAiMetadata) {
            return;
        }

        // Provider selection
        new Setting(containerEl)
            .setName('AI 提取提供商')
            .setDesc('选择用于生成总结的 AI 服务 (可与 Embedding 不同)')
            .addDropdown(dropdown => dropdown
                .addOption('ollama', 'Ollama (本地)')
                .addOption('openai', 'OpenAI (在线)')
                .setValue(this.plugin.settings.aiGenProvider)
                .onChange(async (value: 'ollama' | 'openai') => {
                    this.plugin.settings.aiGenProvider = value;
                    await this.plugin.saveSettings();
                    if (this.plugin.metadataExtractor) {
                        this.plugin.metadataExtractor.updateConfig({ provider: value });
                    }
                    this.display();
                }));

        // Ollama Generation Settings
        if (this.plugin.settings.aiGenProvider === 'ollama') {
            new Setting(containerEl)
                .setName('Ollama API URL')
                .setDesc('Ollama 服务地址 (独立配置)')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.aiGenUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.aiGenUrl = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.metadataExtractor) {
                            this.plugin.metadataExtractor.updateConfig({ ollamaUrl: value });
                        }
                        // We might want to refresh to reload models list if URL changed, 
                        // but let's leave it for manual refresh or next open to avoid flicker text input
                    }));

            const genModelSetting = new Setting(containerEl)
                .setName('Ollama 生成模型')
                .setDesc('用于提取元数据的对话模型 (切勿选择 Embedding 模型)');

            genModelSetting.addDropdown(async (dropdown) => {
                try {
                    const response = await fetch(`${this.plugin.settings.aiGenUrl}/api/tags`);
                    if (response.ok) {
                        const data = await response.json();
                        const models = data.models || [];
                        // Filter likely generation models (exclude explicit embedding models)
                        const genModels = models.filter((m: any) =>
                            !m.name.toLowerCase().includes('embed') &&
                            !m.name.toLowerCase().includes('bge')
                        );

                        if (genModels.length > 0) {
                            genModels.forEach((model: any) => dropdown.addOption(model.name, model.name));
                        } else {
                            dropdown.addOption('', '(未找到生成模型)');
                            if (this.plugin.settings.aiGenModel) {
                                dropdown.addOption(this.plugin.settings.aiGenModel, this.plugin.settings.aiGenModel);
                            }
                        }
                    }
                } catch (error) {
                    dropdown.addOption('', '(Ollama 未运行)');
                }

                dropdown
                    .setValue(this.plugin.settings.aiGenModel)
                    .onChange(async (value) => {
                        if (value.toLowerCase().includes('embed')) {
                            new Notice('⚠️ 警告: 选择 Embedding 模型可能导致失败');
                        }
                        this.plugin.settings.aiGenModel = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.metadataExtractor) {
                            this.plugin.metadataExtractor.updateConfig({ ollamaModel: value });
                        }
                    });
            });

            genModelSetting.addButton(button => button
                .setButtonText('刷新列表')
                .onClick(() => this.display()));
        }

        // OpenAI Generation Settings
        if (this.plugin.settings.aiGenProvider === 'openai') {
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('用于总结的 API Key (如果不填则可能共用某个Key, 建议单独填)')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.aiGenApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.aiGenApiKey = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.metadataExtractor) {
                            this.plugin.metadataExtractor.updateConfig({ openaiApiKey: value });
                        }
                    }));

            new Setting(containerEl)
                .setName('OpenAI URL (Base URL)')
                .setDesc('兼容 OpenAI 格式的 API 地址 (如 https://api.deepseek.com/v1)')
                .addText(text => text
                    .setPlaceholder('https://api.openai.com/v1')
                    .setValue(this.plugin.settings.aiGenUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.aiGenUrl = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.metadataExtractor) {
                            this.plugin.metadataExtractor.updateConfig({ openaiUrl: value });
                        }
                    }));

            new Setting(containerEl)
                .setName('模型名称')
                .setDesc('例如: gpt-3.5-turbo, deepseek-chat')
                .addText(text => text
                    .setValue(this.plugin.settings.aiGenModel)
                    .onChange(async (value) => {
                        this.plugin.settings.aiGenModel = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.metadataExtractor) {
                            this.plugin.metadataExtractor.updateConfig({ openaiModel: value });
                        }
                    }));
        }
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
