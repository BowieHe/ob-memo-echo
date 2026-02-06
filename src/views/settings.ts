/**
 * Settings Tab - Refactored with indexing features
 */

import { App, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type { ConceptCountRule } from '@core/types/concept';
import { buildAssociationExport } from '../services/association-exporter';
import type MemoEchoPlugin from '../main';
import {
    BaseModelConfig,
    ConceptExtractionConfig,
    ConceptFEConfig,
    ConceptSkipConfig,
    AssociationConfig,
    DEFAULT_EMBEDDING_CONFIG,
    DEFAULT_LLM_CONFIG,
    DEFAULT_CONCEPT_EXTRACTION_CONFIG,
    DEFAULT_CONCEPT_FE_CONFIG,
    DEFAULT_CONCEPT_SKIP_CONFIG,
    DEFAULT_ASSOCIATION_CONFIG,
} from '@core/types/setting';
import { getErrorMessage } from '@utils/error';

export interface MemoEchoSettings {
    // Model configs
    embeddingConfig: BaseModelConfig;
    llmConfig: BaseModelConfig;

    // Qdrant settings
    qdrantUrl: string;
    qdrantCollection: string;

    // Concept extraction configs (使用配置对象)
    conceptExtraction: ConceptExtractionConfig;
    conceptFE: ConceptFEConfig;
    conceptSkip: ConceptSkipConfig;

    // Other concept settings
    enableConceptExtraction: boolean;
    conceptCountRules: ConceptCountRule[];

    // Association config (使用配置对象)
    association: AssociationConfig;
    associationIgnoredAssociations: string[];
    associationDeletedConcepts: Record<string, string[]>;

    debugLogging: boolean;
}

export const DEFAULT_SETTINGS: MemoEchoSettings = {
    // Model configs
    embeddingConfig: DEFAULT_EMBEDDING_CONFIG,
    llmConfig: DEFAULT_LLM_CONFIG,

    // Qdrant settings
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'obsidian_notes',

    // Concept extraction configs
    conceptExtraction: DEFAULT_CONCEPT_EXTRACTION_CONFIG,
    conceptFE: DEFAULT_CONCEPT_FE_CONFIG,
    conceptSkip: DEFAULT_CONCEPT_SKIP_CONFIG,

    // Other concept settings
    enableConceptExtraction: true,
    conceptCountRules: [
        { minChars: 0, maxChars: 199, maxConcepts: 1 },
        { minChars: 200, maxChars: 499, maxConcepts: 2 },
        { minChars: 500, maxChars: 999, maxConcepts: 3 },
        { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
    ],

    // Association config
    association: DEFAULT_ASSOCIATION_CONFIG,
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

    /**
     * Helper method to handle settings update results and show notices
     */
    private handleSettingsResult(
        result: { success: boolean; errors?: Array<{ field: string; message: string }> },
        successMessage?: string,
        errorMessagePrefix = '更新失败'
    ): boolean {
        if (result.success) {
            if (successMessage) {
                new Notice(`✅ ${successMessage}`);
            }
            return true;
        } else {
            const errorMsg = result.errors?.[0]?.message || '未知错误';
            new Notice(`❌ ${errorMessagePrefix}: ${errorMsg}`);
            return false;
        }
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
                    const result = await this.plugin.settingsManager.updateDebugLogging(value);
                    if (!result.success) {
                        new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                    }
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
            new Notice(`❌ 索引失败: ${getErrorMessage(error)}`);
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
            new Notice(`❌ 同步失败: ${getErrorMessage(error)}`);
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
                        new Notice(`❌ Qdrant 连接失败: ${getErrorMessage(error)}`);
                    }
                }));

    }

    private addEmbeddingSection(containerEl: HTMLElement): void {
        containerEl.createEl('h4', { text: 'Embedding 设置' });

        const config = this.plugin.settings.embeddingConfig;

        // Provider selection
        new Setting(containerEl)
            .setName('Embedding 提供商')
            .setDesc('选择用于生成向量的服务')
            .addDropdown(dropdown => dropdown
                .addOption('ollama', 'Ollama')
                .addOption('openai', 'OpenAI')
                .setValue(config.provider)
                .onChange(async (value) => {
                    const result = await this.plugin.settingsManager.updateEmbedding({ provider: value as 'ollama' | 'openai' });
                    if (this.handleSettingsResult(result, `已切换到 ${value} 提供商`)) {
                        this.display();
                    }
                }));

        if (config.provider === 'ollama') {
            // Ollama settings
            new Setting(containerEl)
                .setName('Ollama URL')
                .setDesc('Ollama 服务地址')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(config.baseUrl)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateEmbedding({ baseUrl: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            // Ollama Embedding Model dropdown
            const embedModelSetting = new Setting(containerEl)
                .setName('Ollama Embedding 模型')
                .setDesc('用于生成向量的模型 (必须是 Embedding 模型!)');

            embedModelSetting.addDropdown(async (dropdown) => {
                try {
                    const response = await fetch(`${config.baseUrl}/api/tags`);
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
                            if (config.model) {
                                dropdown.addOption(config.model, config.model);
                            }
                        }
                    } else {
                        dropdown.addOption('', '(无法连接 Ollama)');
                    }
                } catch (error) {
                    dropdown.addOption('', '(Ollama 未运行)');
                }

                dropdown
                    .setValue(config.model)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateEmbedding({ model: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
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

        if (config.provider === 'openai') {
            // OpenAI settings
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('OpenAI-compatible 服务的 API Key (本地 Ollama 可留空)')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(config.apiKey)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateEmbedding({ apiKey: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            new Setting(containerEl)
                .setName('OpenAI Embedding 模型')
                .addText(text => text
                    .setPlaceholder('text-embedding-3-small')
                    .setValue(config.model)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateEmbedding({ model: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));
        }
    }

    private addAiGenerationSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'AI 总结与标签' });

        const group = containerEl.createDiv('memo-echo-settings-group');

        const config = this.plugin.settings.llmConfig;

        // Provider selection
        new Setting(group)
            .setName('AI 提取提供商')
            .setDesc('选择用于生成总结的 AI 服务 (可与 Embedding 不同)')
            .addDropdown(dropdown => dropdown
                .addOption('ollama', 'Ollama (本地)')
                .addOption('openai', 'OpenAI (在线)')
                .setValue(config.provider)
                .onChange(async (value) => {
                    const result = await this.plugin.settingsManager.updateLlm({ provider: value as 'ollama' | 'openai' });
                    if (result.success) {
                        this.display();
                    } else {
                        new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                    }
                }));

        // Ollama Generation Settings
        if (config.provider === 'ollama') {
            new Setting(group)
                .setName('Ollama API URL')
                .setDesc('Ollama 服务地址 (本地默认 http://localhost:11434)')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(config.baseUrl)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateLlm({ baseUrl: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            const genModelSetting = new Setting(group)
                .setName('Ollama 生成模型')
                .setDesc('用于提取元数据的对话模型 (切勿选择 Embedding 模型)');

            genModelSetting.addDropdown(async (dropdown) => {
                try {
                    const response = await fetch(`${config.baseUrl}/api/tags`);
                    if (response.ok) {
                        const data = await response.json();
                        const models = data.models || [];

                        if (models.length > 0) {
                            models.forEach((model: any) => dropdown.addOption(model.name, model.name));
                        } else {
                            dropdown.addOption('', '(未找到生成模型)');
                            if (config.model) {
                                dropdown.addOption(config.model, config.model);
                            }
                        }
                    }
                } catch (error) {
                    dropdown.addOption('', '(Ollama 未运行)');
                }

                dropdown
                    .setValue(config.model)
                    .onChange(async (value) => {
                        if (value.toLowerCase().includes('embed')) {
                            new Notice('⚠️ 警告: 选择 Embedding 模型可能导致失败');
                        }
                        const result = await this.plugin.settingsManager.updateLlm({ model: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    });
            });

            genModelSetting.addButton(button => button
                .setButtonText('刷新列表')
                .onClick(() => this.display()));
        }

        // OpenAI Generation Settings
        if (config.provider === 'openai') {
            new Setting(group)
                .setName('OpenAI API Key')
                .setDesc('OpenAI-compatible 服务的 API Key (本地 Ollama 可留空)')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(config.apiKey)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateLlm({ apiKey: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            new Setting(group)
                .setName('OpenAI URL (Base URL)')
                .setDesc('OpenAI-compatible API 地址 (如 https://api.deepseek.com/v1)')
                .addText(text => text
                    .setPlaceholder('https://api.openai.com/v1')
                    .setValue(config.baseUrl)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateLlm({ baseUrl: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            new Setting(group)
                .setName('模型名称')
                .setDesc('例如: gpt-3.5-turbo, deepseek-chat')
                .addText(text => text
                    .setValue(config.model)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateLlm({ model: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
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
                    .setValue(this.plugin.settings.conceptFE.injectToFrontmatter)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateConceptFE({ injectToFrontmatter: value });
                        if (result.success) {
                            this.display();
                        } else {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            if (this.plugin.settings.conceptFE.injectToFrontmatter) {
                new Setting(conceptGroup)
                    .setName('自动创建概念页面')
                    .setDesc('为新概念创建页面 (可能产生大量文件)')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.conceptFE.autoCreateConceptPage)
                        .onChange(async (value) => {
                            const result = await this.plugin.settingsManager.updateConceptFE({ autoCreateConceptPage: value });
                            if (!result.success) {
                                new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                            }
                        }));
            }

            new Setting(conceptGroup)
                .setName('概念页前缀')
                .setDesc('用于生成 [[前缀/概念]]')
                .addText(text => text
                    .setPlaceholder('_me')
                    .setValue(this.plugin.settings.conceptFE.conceptPagePrefix)
                    .onChange(async (value) => {
                        const prefix = value || '_me';
                        // Note: conceptPagePrefix update also affects conceptSkip.conceptDictionaryPath
                        // This requires special handling since it modifies two settings groups
                        this.plugin.settings.conceptFE.conceptPagePrefix = prefix;
                        this.plugin.settings.conceptSkip.conceptDictionaryPath = `${prefix}/_concept-dictionary.json`;
                        await this.plugin.saveSettings();
                        this.plugin.updateConceptExtractionSettings();
                    }));


            // v0.6.0: Abstract concept extraction settings
            containerEl.createEl('h4', { text: '抽象概念提取' });

            const abstractGroup = containerEl.createDiv('memo-echo-settings-group');

            // Focus on abstract concepts
            new Setting(abstractGroup)
                .setName('专注于抽象概念')
                .setDesc('更偏模式/原理，而非技术名词')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.conceptExtraction.focusOnAbstractConcepts)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateConceptExtraction({ focusOnAbstractConcepts: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            // Minimum concept confidence
            new Setting(abstractGroup)
                .setName('最小概念置信度')
                .setDesc('过滤低置信度概念')
                .addSlider(slider => slider
                    .setLimits(0.1, 1.0, 0.1)
                    .setValue(this.plugin.settings.conceptExtraction.minConfidence)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateConceptExtraction({ minConfidence: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            // Exclude generic concepts
            new Setting(abstractGroup)
                .setName('排除通用概念')
                .setDesc('每行输入一个概念')
                .addTextArea(text => text
                    .setPlaceholder('技术开发\n总结\n概述')
                    .setValue(this.plugin.settings.conceptExtraction.excludeGenericConcepts.join('\n'))
                    .onChange(async (value) => {
                        const excludeList = value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                        const result = await this.plugin.settingsManager.updateConceptExtraction({ excludeGenericConcepts: excludeList });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            containerEl.createEl('h4', { text: '跳过规则' });

            const skipGroup = containerEl.createDiv('memo-echo-settings-group');

            new Setting(skipGroup)
                .setName('跳过路径 (每行一个)')
                .addTextArea(text => text
                    .setValue(this.plugin.settings.conceptSkip.skipPaths.join('\n'))
                    .onChange(async (value) => {
                        const skipPaths = value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                        const result = await this.plugin.settingsManager.updateConceptSkip({ skipPaths });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            new Setting(skipGroup)
                .setName('跳过标签 (逗号分隔)')
                .addText(text => text
                    .setValue(this.plugin.settings.conceptSkip.skipTags.join(', '))
                    .onChange(async (value) => {
                        const skipTags = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        const result = await this.plugin.settingsManager.updateConceptSkip({ skipTags });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
                    }));

            new Setting(skipGroup)
                .setName('最小文本长度')
                .addText(text => text
                    .setValue(this.plugin.settings.conceptSkip.minTextLength.toString())
                    .onChange(async (value) => {
                        const parsed = Number(value);
                        if (!Number.isNaN(parsed)) {
                            const result = await this.plugin.settingsManager.updateConceptSkip({ minTextLength: parsed });
                            if (!result.success) {
                                new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                            }
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
                                new Notice(`❌ 清除失败: ${getErrorMessage(error)}`);
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
                            new Notice(`❌ 清除失败: ${getErrorMessage(error)}`);
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
                    .setValue(this.plugin.settings.association.associationAutoAccept)
                    .onChange(async (value) => {
                        const result = await this.plugin.settingsManager.updateAssociation({ associationAutoAccept: value });
                        if (!result.success) {
                            new Notice(`❌ 更新失败: ${result.errors?.[0]?.message}`);
                        }
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
                            const limit = Math.max(10, this.plugin.settings.association.associationAutoScanBatchSize || 50);
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
                                .filter((assoc) => assoc.confidence >= this.plugin.settings.association.associationMinConfidence);

                            new Notice(`✅ 已索引 ${indexed} 个笔记，发现 ${filtered.length} 个关联`);

                            // Refresh stats display
                            this.updateAssociationStats(statsContainer);
                        } catch (error) {
                            new Notice(`❌ 扫描失败: ${getErrorMessage(error)}`);
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
                                .filter((assoc) => assoc.confidence >= this.plugin.settings.association.associationMinConfidence);

                            const payload = buildAssociationExport(filtered, stats, {
                                filteredBy: `minConfidence:${this.plugin.settings.association.associationMinConfidence}`,
                            });

                            const fileName = `memo-echo-association-export-${Date.now()}.json`;
                            await this.app.vault.create(fileName, JSON.stringify(payload, null, 2));
                            new Notice(`✅ 已导出统计和关联到 ${fileName}`);
                        } catch (error) {
                            new Notice(`❌ 导出失败: ${getErrorMessage(error)}`);
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
                            new Notice(`❌ 清空失败: ${getErrorMessage(error)}`);
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
                text: `无法获取统计信息: ${getErrorMessage(error)}`,
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
                text: `无法获取关联统计: ${getErrorMessage(error)}`,
                cls: 'error-text',
            });
        }
    }
}
