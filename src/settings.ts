/**
 * Settings Tab - Refactored with indexing features
 */

import { App, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type { ConceptCountRule, SkipRules } from '@core/types/concept';
import type { ConceptLanguage } from '@core/types/extraction';
import { buildAssociationExport } from './services/association-exporter';
import type MemoEchoPlugin from './main';

export interface MemoEchoSettings {
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

    // v0.5.0: Concept extraction provider
    conceptExtractionProvider: 'ollama' | 'openai' | 'rules';

    // v0.6.0: Abstract Concept Extraction settings
    focusOnAbstractConcepts: boolean;  // Focus on abstract concepts vs specific tech
    minConceptConfidence: number;      // Minimum confidence threshold for concepts
    excludeGenericConcepts: string;    // Comma-separated list of generic concepts to exclude

    // v0.8.0: Concept extraction settings
    enableConceptExtraction: boolean;
    injectToFrontmatter: boolean;
    autoCreateConceptPage: boolean;
    conceptPagePrefix: string;
    conceptCountRules: ConceptCountRule[];
    skipRules: SkipRules;
    conceptDictionaryPath: string;
    conceptLanguage: 'auto' | 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

    // v0.6.0: Association management settings
    associationMinConfidence: number;          // Minimum confidence to display
    associationAutoAccept: boolean;            // Auto-accept high confidence associations
    associationAutoAcceptConfidence: number;   // Threshold for auto-accept
    associationAutoScanBatchSize: number;      // Max notes to scan on auto-scan
    associationIgnoredAssociations: string[];  // Persist ignored association IDs
    associationDeletedConcepts: Record<string, string[]>; // Persist deleted concepts

    debugLogging: boolean;
}

export const DEFAULT_SETTINGS: MemoEchoSettings = {
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

    // v0.5.0 defaults
    conceptExtractionProvider: 'ollama',

    // v0.6.0 defaults
    focusOnAbstractConcepts: true,
    minConceptConfidence: 0.7,
    excludeGenericConcepts: '技术开发,总结,概述,简介,设计',

    // v0.8.0 defaults
    enableConceptExtraction: true,
    injectToFrontmatter: true,
    autoCreateConceptPage: false,
    conceptPagePrefix: '_me',
    conceptCountRules: [
        { minChars: 0, maxChars: 199, maxConcepts: 1 },
        { minChars: 200, maxChars: 499, maxConcepts: 2 },
        { minChars: 500, maxChars: 999, maxConcepts: 3 },
        { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
    ],
    skipRules: {
        skipPaths: ['_me/', 'templates/', 'daily/'],
        skipTags: ['vocabulary', 'daily', 'template', 'image-collection'],
        minTextLength: 100,
        maxImageRatio: 0.7,
    },
    conceptDictionaryPath: '_me/_concept-dictionary.json',
    conceptLanguage: 'auto',

    // v0.6.0 association defaults
    associationMinConfidence: 0.5,
    associationAutoAccept: false,
    associationAutoAcceptConfidence: 0.9,
    associationAutoScanBatchSize: 50,
    associationIgnoredAssociations: [],
    associationDeletedConcepts: {},
    debugLogging: true,
};

export class MemoEchoSettingTab extends PluginSettingTab {
    plugin: MemoEchoPlugin;
    private isIndexing = false;

    constructor(app: App, plugin: MemoEchoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Memo Echo 设置' });

        this.addOverviewSection(containerEl);
        this.addEnvironmentSection(containerEl);
        this.addAiGenerationSection(containerEl);
        this.addConceptSection(containerEl);
        this.addIndexingSection(containerEl);
        this.addDatabaseActionsSection(containerEl);
    }

    private addOverviewSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '概览' });

        const overviewGrid = containerEl.createDiv('overview-grid');

        const dbStatsCard = overviewGrid.createDiv('overview-card');
        this.updateStats(dbStatsCard);

        const associationCard = overviewGrid.createDiv('overview-card');
        associationCard.createEl('h4', { text: '关联统计' });
        const associationContainer = associationCard.createDiv('association-stats');
        this.updateAssociationStats(associationContainer);
    }

    private addEnvironmentSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '环境配置' });

        const group = containerEl.createDiv('memo-echo-settings-group');
        this.addServiceStatusSection(group);
        this.addQdrantSection(group);
        this.addEmbeddingSection(group);
        this.addDebugSection(group);
    }

    private addDebugSection(containerEl: HTMLElement): void {
        containerEl.createEl('h4', { text: '调试' });

        new Setting(containerEl)
            .setName('启用调试日志')
            .setDesc('输出概念提取与匹配的中间日志')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugLogging)
                .onChange(async (value) => {
                    this.plugin.settings.debugLogging = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateLogger();
                }));
    }

    private addIndexingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '索引管理' });

        const group = containerEl.createDiv('memo-echo-settings-group');

        // Index current file
        new Setting(group)
            .setName('索引当前文件')
            .setDesc('索引当前打开的 Markdown 文件')
            .addButton(button => button
                .setButtonText('索引当前文件')
                .setCta()
                .onClick(async () => {
                    await this.indexCurrentFile();
                }));

        // Sync all files
        new Setting(group)
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

            // Use indexManager.indexFile() (v0.5.0)
            await this.plugin.indexManager.indexFile(activeFile.path, content);
            await this.plugin.indexManager.flush();

            console.log(`\n========== 索引完成 ==========`);
            new Notice(`✅ 文件已索引`);

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
            '这将索引所有 Markdown 文件。\n' +
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
            let failed = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                try {
                    // Show progress every 10 files
                    if (i % 10 === 0) {
                        new Notice(`同步中: ${i}/${files.length} 文件...`);
                    }

                    // Read and index using indexManager (v0.5.0)
                    const content = await this.app.vault.read(file);
                    await this.plugin.indexManager.updateFile(file.path, content);
                    indexed++;

                } catch (error) {
                    console.error(`Failed to sync ${file.path}:`, error);
                    failed++;
                }
            }

            // Flush all pending chunks
            await this.plugin.indexManager.flush();

            new Notice(
                `✅ 同步完成!\n\n` +
                `已索引: ${indexed} 个文件\n` +
                `失败: ${failed}`,
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

    private addServiceStatusSection(containerEl: HTMLElement): void {
        containerEl.createEl('h4', { text: '连接状态' });

        const statusContainer = containerEl.createDiv('stats-container');

        // Qdrant Status
        new Setting(statusContainer)
            .setName('Qdrant 状态')
            .setDesc('向量数据库连接状态')
            .addButton(button => button
                .setButtonText('检查连接')
                .onClick(async () => {
                    try {
                        const count = await this.plugin.vectorBackend.count();
                        new Notice(`✅ Qdrant 已连接 (${count} 个向量)`);
                    } catch (error) {
                        new Notice(`❌ Qdrant 连接失败: ${error.message}`);
                    }
                }));

    }

    private addEmbeddingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h4', { text: 'Embedding 设置' });

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
                .setDesc('OpenAI-compatible 服务的 API Key (本地 Ollama 可留空)')
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
        containerEl.createEl('h3', { text: 'AI 总结与标签' });

        const group = containerEl.createDiv('memo-echo-settings-group');

        // Toggle
        new Setting(group)
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
        new Setting(group)
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
            new Setting(group)
                .setName('Ollama API URL')
                .setDesc('Ollama 服务地址 (本地默认 http://localhost:11434)')
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

            const genModelSetting = new Setting(group)
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
            new Setting(group)
                .setName('OpenAI API Key')
                .setDesc('OpenAI-compatible 服务的 API Key (本地 Ollama 可留空)')
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

            new Setting(group)
                .setName('OpenAI URL (Base URL)')
                .setDesc('OpenAI-compatible API 地址 (如 https://api.deepseek.com/v1)')
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

            new Setting(group)
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
        containerEl.createEl('h4', { text: 'Qdrant 设置' });

        new Setting(containerEl)
            .setName('Qdrant URL')
            .setDesc('Qdrant 服务地址 (修改后需重启插件)')
            .addText(text => text
                .setPlaceholder('http://localhost:6333')
                .setValue(this.plugin.settings.qdrantUrl)
                .onChange(async (value) => {
                    this.plugin.settings.qdrantUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('集合名称')
            .setDesc('Qdrant 集合名称 (修改后需重启插件)')
            .addText(text => text
                .setPlaceholder('obsidian_notes')
                .setValue(this.plugin.settings.qdrantCollection)
                .onChange(async (value) => {
                    this.plugin.settings.qdrantCollection = value;
                    await this.plugin.saveSettings();
                }));
    }

    // v0.5.0: Concept Injection Settings Section
    private addConceptSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '知识图谱' });
        containerEl.createEl('h4', { text: '概念注入' });

        const conceptGroup = containerEl.createDiv('memo-echo-settings-group');

        new Setting(conceptGroup)
            .setName('启用概念提取')
            .setDesc('使用 AI 提取高层级概念')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableConceptExtraction)
                .onChange(async (value) => {
                    this.plugin.settings.enableConceptExtraction = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateConceptExtractionSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableConceptExtraction) {
            new Setting(conceptGroup)
                .setName('注入到 frontmatter')
                .setDesc('将概念写入 me_concepts (Wikilinks)')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.injectToFrontmatter)
                    .onChange(async (value) => {
                        this.plugin.settings.injectToFrontmatter = value;
                        await this.plugin.saveSettings();
                        this.plugin.updateConceptExtractionSettings();
                        this.display();
                    }));

            if (this.plugin.settings.injectToFrontmatter) {
                new Setting(conceptGroup)
                    .setName('自动创建概念页面')
                    .setDesc('为新概念创建页面 (可能产生大量文件)')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.autoCreateConceptPage)
                        .onChange(async (value) => {
                            this.plugin.settings.autoCreateConceptPage = value;
                            await this.plugin.saveSettings();
                            this.plugin.updateConceptExtractionSettings();
                        }));
            }

            new Setting(conceptGroup)
                .setName('概念提取方式')
                .setDesc('AI 或规则提取')
                .addDropdown(dropdown => dropdown
                    .addOption('ollama', 'Ollama (推荐)')
                    .addOption('openai', 'OpenAI')
                    .addOption('rules', '规则提取 (无需 AI)')
                    .setValue(this.plugin.settings.conceptExtractionProvider)
                    .onChange(async (value: 'ollama' | 'openai' | 'rules') => {
                        this.plugin.settings.conceptExtractionProvider = value;
                        await this.plugin.saveSettings();
                        this.plugin.conceptExtractor.updateConfig({ provider: value });
                    }));

            new Setting(conceptGroup)
                .setName('概念页前缀')
                .setDesc('用于生成 [[前缀/概念]]')
                .addText(text => text
                    .setPlaceholder('_me')
                    .setValue(this.plugin.settings.conceptPagePrefix)
                    .onChange(async (value) => {
                        this.plugin.settings.conceptPagePrefix = value || '_me';
                        this.plugin.settings.conceptDictionaryPath = `${this.plugin.settings.conceptPagePrefix}/_concept-dictionary.json`;
                        await this.plugin.saveSettings();
                        this.plugin.updateConceptExtractionSettings();
                    }));

            // v0.8.1: Language adaptation settings
            new Setting(conceptGroup)
                .setName('概念语言')
                .setDesc('提取概念时使用的语言 (auto: 根据笔记内容自动判断)')
                .addDropdown(dropdown => dropdown
                    .addOption('auto', '自动检测')
                    .addOption('en', 'English')
                    .addOption('zh', '中文')
                    .addOption('ja', '日本語')
                    .addOption('ko', '한국어')
                    .addOption('es', 'Español')
                    .addOption('fr', 'Français')
                    .addOption('de', 'Deutsch')
                    .setValue(this.plugin.settings.conceptLanguage)
                    .onChange(async (value: ConceptLanguage) => {
                        this.plugin.settings.conceptLanguage = value;
                        await this.plugin.saveSettings();
                        this.plugin.conceptExtractor.updateConfig({ language: value });
                    }));

            // v0.6.0: Abstract concept extraction settings
            containerEl.createEl('h4', { text: '抽象概念提取' });

            const abstractGroup = containerEl.createDiv('memo-echo-settings-group');

            // Focus on abstract concepts
            new Setting(abstractGroup)
                .setName('专注于抽象概念')
                .setDesc('更偏模式/原理，而非技术名词')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.focusOnAbstractConcepts)
                    .onChange(async (value) => {
                        this.plugin.settings.focusOnAbstractConcepts = value;
                        await this.plugin.saveSettings();
                        this.plugin.conceptExtractor.updateConfig({ focusOnAbstractConcepts: value });
                    }));

            // Minimum concept confidence
            new Setting(abstractGroup)
                .setName('最小概念置信度')
                .setDesc('过滤低置信度概念')
                .addSlider(slider => slider
                    .setLimits(0.1, 1.0, 0.1)
                    .setValue(this.plugin.settings.minConceptConfidence)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.minConceptConfidence = value;
                        await this.plugin.saveSettings();
                        this.plugin.conceptExtractor.updateConfig({ minConfidence: value });
                    }));

            // Exclude generic concepts
            new Setting(abstractGroup)
                .setName('排除通用概念')
                .setDesc('逗号分隔，如 总结,概述')
                .addText(text => text
                    .setPlaceholder('技术开发,总结,概述,简介,设计')
                    .setValue(this.plugin.settings.excludeGenericConcepts)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeGenericConcepts = value;
                        await this.plugin.saveSettings();
                        const excludeList = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        this.plugin.conceptExtractor.updateConfig({ excludeGenericConcepts: excludeList });
                    }));

            containerEl.createEl('h4', { text: '跳过规则' });

            const skipGroup = containerEl.createDiv('memo-echo-settings-group');

            new Setting(skipGroup)
                .setName('跳过路径 (每行一个)')
                .addTextArea(text => text
                    .setValue(this.plugin.settings.skipRules.skipPaths.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.skipRules.skipPaths = value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                        await this.plugin.saveSettings();
                        this.plugin.updateConceptExtractionSettings();
                    }));

            new Setting(skipGroup)
                .setName('跳过标签 (逗号分隔)')
                .addText(text => text
                    .setValue(this.plugin.settings.skipRules.skipTags.join(', '))
                    .onChange(async (value) => {
                        this.plugin.settings.skipRules.skipTags = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        await this.plugin.saveSettings();
                        this.plugin.updateConceptExtractionSettings();
                    }));

            new Setting(skipGroup)
                .setName('最小文本长度')
                .addText(text => text
                    .setValue(this.plugin.settings.skipRules.minTextLength.toString())
                    .onChange(async (value) => {
                        const parsed = Number(value);
                        if (!Number.isNaN(parsed)) {
                            this.plugin.settings.skipRules.minTextLength = parsed;
                            await this.plugin.saveSettings();
                            this.plugin.updateConceptExtractionSettings();
                        }
                    }));

            new Setting(skipGroup)
                .setName('图片占比阈值')
                .setDesc('0-1 之间')
                .addText(text => text
                    .setValue(this.plugin.settings.skipRules.maxImageRatio.toString())
                    .onChange(async (value) => {
                        const parsed = Number(value);
                        if (!Number.isNaN(parsed)) {
                            this.plugin.settings.skipRules.maxImageRatio = parsed;
                            await this.plugin.saveSettings();
                            this.plugin.updateConceptExtractionSettings();
                        }
                    }));

            // Clear all me_* fields button
            new Setting(abstractGroup)
                .setName('清除所有概念标记')
                .setDesc('移除所有笔记的 me_* 字段')
                .addButton(button => button
                    .setButtonText('清除所有')
                    .setWarning()
                    .onClick(async () => {
                        const confirmed = confirm(
                            '⚠️ 确定要清除所有笔记中的 me_* 字段吗?\n\n此操作会修改所有带有概念标记的笔记。'
                        );

                        if (confirmed) {
                            try {
                                new Notice('🔄 正在清除...');
                                const result = await this.plugin.frontmatterService.clearAllMemoEchoFields();
                                new Notice(`✅ 已清除 ${result.cleared} 个文件${result.failed > 0 ? `, ${result.failed} 个失败` : ''}`);
                            } catch (error) {
                                new Notice(`❌ 清除失败: ${error.message}`);
                            }
                        }
                    }));

            // v0.6.0: Clear recent concepts (last 7 days)
            new Setting(abstractGroup)
                .setName('清除最近添加的概念')
                .setDesc('移除最近 7 天的概念标记')
                .addButton(button => button
                    .setButtonText('清除最近')
                    .onClick(async () => {
                        try {
                            const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                            const recentFiles = await this.plugin.frontmatterService.getFilesIndexedAfter(cutoffDate);

                            if (recentFiles.length === 0) {
                                new Notice('没有最近添加的概念');
                                return;
                            }

                            const confirmed = confirm(
                                `确定要清除最近 7 天添加的概念吗?\n\n将影响 ${recentFiles.length} 个文件。`
                            );

                            if (!confirmed) return;

                            new Notice('🔄 正在清除...');
                            let cleared = 0;
                            for (const file of recentFiles) {
                                try {
                                    await this.plugin.frontmatterService.clearMemoEchoFields(file);
                                    cleared++;
                                } catch (e) {
                                    // Skip errors
                                }
                            }
                            new Notice(`✅ 已清除 ${cleared} 个文件的概念`);
                        } catch (error) {
                            new Notice(`❌ 清除失败: ${error.message}`);
                        }
                    }));

            // v0.6.0: Association management settings
            containerEl.createEl('h4', { text: '关联发现' });

            const associationGroup = containerEl.createDiv('memo-echo-settings-group');

            const statsContainer = associationGroup.createDiv('association-stats');
            this.updateAssociationStats(statsContainer);

            new Setting(associationGroup)
                .setName('自动接受高质量关联')
                .setDesc('高置信度自动写入')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.associationAutoAccept)
                    .onChange(async (value) => {
                        this.plugin.settings.associationAutoAccept = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(associationGroup)
                .setName('高级选项')
                .setDesc('阈值与批量采用默认值');

            new Setting(associationGroup)
                .setName('重置忽略列表')
                .setDesc('清空所有已忽略的关联')
                .addButton(button => button
                    .setButtonText('重置忽略')
                    .onClick(async () => {
                        await this.plugin.associationPreferences.clearIgnoredAssociations();
                        new Notice('✅ 已清空忽略列表');
                    }));

            new Setting(associationGroup)
                .setName('重置删除概念')
                .setDesc('清空所有已删除的共享概念')
                .addButton(button => button
                    .setButtonText('重置删除')
                    .onClick(async () => {
                        await this.plugin.associationPreferences.clearDeletedConcepts();
                        new Notice('✅ 已清空删除概念');
                    }));


            // v0.6.0: Rescan associations button
            new Setting(associationGroup)
                .setName('重新扫描关联')
                .setDesc('清除关联索引并重新发现笔记间的关联')
                .addButton(button => button
                    .setButtonText('重新扫描')
                    .setCta()
                    .onClick(async () => {
                        try {
                            new Notice('🔄 正在扫描关联...');

                            // Clear existing index
                            this.plugin.associationEngine.clearIndex();

                            // Re-index all markdown files (limit for performance)
                            const limit = Math.max(10, this.plugin.settings.associationAutoScanBatchSize || 50);
                            const files = this.app.vault.getMarkdownFiles().slice(0, limit);
                            let indexed = 0;

                            for (const file of files) {
                                try {
                                    const content = await this.app.vault.read(file);
                                    await this.plugin.associationEngine.indexNote(file.path, content, file.basename);
                                    indexed++;
                                } catch (e) {
                                    // Skip files with errors
                                }
                            }

                            // Discover associations
                            const raw = await this.plugin.associationEngine.discoverAssociations();
                            const filtered = this.plugin.associationPreferences.filterAssociations(raw)
                                .filter((assoc) => assoc.confidence >= this.plugin.settings.associationMinConfidence);

                            new Notice(`✅ 已索引 ${indexed} 个笔记，发现 ${filtered.length} 个关联`);

                            // Refresh stats display
                            this.updateAssociationStats(statsContainer);
                        } catch (error) {
                            new Notice(`❌ 扫描失败: ${error.message}`);
                        }
                    }));

            // v0.6.0: Export association stats
            new Setting(associationGroup)
                .setName('导出关联统计')
                .setDesc('导出当前关联统计和索引概览')
                .addButton(button => button
                    .setButtonText('导出统计')
                    .onClick(async () => {
                        try {
                            const stats = this.plugin.associationEngine.getStats();
                            const raw = await this.plugin.associationEngine.discoverAssociations();
                            const filtered = this.plugin.associationPreferences.filterAssociations(raw)
                                .filter((assoc) => assoc.confidence >= this.plugin.settings.associationMinConfidence);

                            const payload = buildAssociationExport(filtered, stats, {
                                filteredBy: `minConfidence:${this.plugin.settings.associationMinConfidence}`,
                            });

                            const fileName = `memo-echo-association-export-${Date.now()}.json`;
                            await this.app.vault.create(fileName, JSON.stringify(payload, null, 2));
                            new Notice(`✅ 已导出统计和关联到 ${fileName}`);
                        } catch (error) {
                            new Notice(`❌ 导出失败: ${error.message}`);
                        }
                    }));

            // v0.6.0: Open association panel button
            new Setting(associationGroup)
                .setName('打开关联面板')
                .setDesc('在侧边栏查看和管理关联建议')
                .addButton(button => button
                    .setButtonText('打开面板')
                    .onClick(() => {
                        this.plugin.activateAssociationView();
                    }));
        }
    }

    private addDatabaseActionsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '数据库管理' });

        const group = containerEl.createDiv('memo-echo-settings-group');

        // Clear database button
        new Setting(group)
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
                            await this.plugin.vectorBackend.clear();
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
            const count = await this.plugin.vectorBackend.count();

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

    // v0.6.0: Update association statistics display
    private updateAssociationStats(container: HTMLElement): void {
        container.empty();

        try {
            const stats = this.plugin.associationEngine.getStats();

            const statsContent = container.createDiv('stats-content');

            const row1 = statsContent.createDiv('stat-row');
            row1.createEl('span', { text: '已索引笔记: ' });
            row1.createEl('strong', { text: stats.totalNotes.toString() });
            row1.createEl('span', { text: ' | ' });
            row1.createEl('span', { text: '唯一概念: ' });
            row1.createEl('strong', { text: stats.totalConcepts.toString() });

            const row2 = statsContent.createDiv('stat-row');
            row2.createEl('span', { text: '发现关联: ' });
            row2.createEl('strong', { text: stats.totalAssociations.toString() });
            row2.createEl('span', { text: ' | ' });
            row2.createEl('span', { text: '平均概念/笔记: ' });
            row2.createEl('strong', { text: stats.avgConceptsPerNote.toFixed(1) });
        } catch (error) {
            container.createEl('p', {
                text: '无法获取关联统计',
                cls: 'error-text',
            });
        }
    }
}
