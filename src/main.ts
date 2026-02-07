import { Plugin, TFile, Notice } from 'obsidian';
import { IndexSearchView } from './views/index-search-view';
import { ConceptView } from './views/concept-view';
import { MemoEchoSettingTab, MemoEchoSettings, DEFAULT_SETTINGS } from './views/settings';
import { EmbeddingService } from './services/embedding-service';
import type { VectorBackend } from './services/vector-backend';
import { QdrantBackend } from './services/qdrant-backend';
import { Chunker } from './services/chunker';
import { MetadataExtractor } from './services/metadata-extractor';
import { VectorIndexManager } from './services/vector-index-manager';
import { VIEW_TYPE_INDEX_SEARCH, VIEW_TYPE_CONCEPT } from './core/constants';
import { ParagraphDetector } from './services/paragraph-detector';
import { FrontmatterService } from './services/frontmatter-service';
import { ConceptExtractor } from './services/concept-extractor';
import { ConceptRegistry } from './services/concept-registry';
import { SearchService } from './services/search-service';
import type { ExtractedConceptWithMatch } from './core/types/concept';
import type { BaseModelConfig } from './core/types/setting';
import { SettingsManager } from './core/settings/settings-manager';
import { getErrorMessage } from '@utils/error';

// Type for confirmed concepts
interface ConfirmedConcept {
    name: string;
    isNew: boolean;
    createPage: boolean;
    aliases?: string[];
}

export default class MemoEchoPlugin extends Plugin {
    private indexSearchView: IndexSearchView | null = null;
    private conceptView: ConceptView | null = null;

    // Settings
    settings!: MemoEchoSettings;

    // Batch processing state
    private isBatchProcessing = false;
    private shouldStopBatch = false;

    // Services
    embeddingService!: EmbeddingService;
    vectorBackend!: VectorBackend;
    chunker!: Chunker;
    metadataExtractor!: MetadataExtractor;
    indexManager!: VectorIndexManager;

    // v0.5.0 services
    frontmatterService!: FrontmatterService;
    conceptExtractor!: ConceptExtractor;
    conceptRegistry!: ConceptRegistry;

    // v0.7.0 services
    searchService!: SearchService;

    // Settings manager
    settingsManager!: SettingsManager;

    /**
     * Convert BaseModelConfig to EmbeddingConfig for EmbeddingService
     */
    private convertToEmbeddingConfig(config: Partial<BaseModelConfig>): import('./services/embedding-service').EmbeddingConfig {
        const embeddingConfig: import('./services/embedding-service').EmbeddingConfig = {
            provider: config.provider as 'ollama' | 'openai' | 'local',
        };

        if (config.provider === 'ollama') {
            if (config.baseUrl) embeddingConfig.ollamaUrl = config.baseUrl;
            if (config.model) embeddingConfig.ollamaModel = config.model;
        } else if (config.provider === 'openai') {
            if (config.apiKey) embeddingConfig.openaiApiKey = config.apiKey;
            if (config.model) embeddingConfig.openaiModel = config.model;
        }

        return embeddingConfig;
    }

    async onload() {
        console.log('Loading Memo Echo Plugin v0.6.0');

        // Load settings
        await this.loadSettings();
        console.log('📝 Loaded settings:', this.settings);

        // Initialize services with saved settings
        this.embeddingService = new EmbeddingService(this.convertToEmbeddingConfig(this.settings.embeddingConfig));
        console.log(`🤖 Embedding service initialized: ${this.settings.embeddingConfig.provider}`);

        // VectorBackend - using Qdrant by default (v0.5.0)
        this.vectorBackend = new QdrantBackend(
            this.settings.qdrantCollection,
            this.settings.qdrantUrl,
            this.embeddingService  // Pass embeddingService for dimension detection
        );
        console.log(`🗄️ Vector backend initialized: Qdrant @ ${this.settings.qdrantUrl}`);

        this.chunker = new Chunker(500);
        console.log('✂️ Chunker initialized');

        // v0.2.0: Initialize metadata extractor
        this.metadataExtractor = new MetadataExtractor(this.settings.llmConfig);
        console.log('🏷️ Metadata extractor initialized');

        // v0.5.0: Initialize concept extractor
        this.conceptExtractor = new ConceptExtractor(
            () => this.settings.llmConfig,
            this.settings.conceptExtraction
        );
        console.log('💡 Concept extractor initialized (v0.7.0)');

        // v0.7.0: Initialize search service
        this.searchService = new SearchService(
            this.embeddingService,
            this.vectorBackend
        );
        console.log('🔍 Search service initialized (v0.7.0)');

        // v0.5.0: Initialize index manager with VectorBackend
        this.indexManager = new VectorIndexManager(
            this.vectorBackend,
            this.embeddingService,
            this.chunker,
            this.metadataExtractor,
            50 * 1024 * 1024 // 50MB cache
        );

        // v0.5.0: Initialize frontmatter service
        this.frontmatterService = new FrontmatterService(
            this.app,
            this.settings.conceptFE.conceptPagePrefix
        );
        console.log('📝 Frontmatter service initialized');

        // Initialize concept registry
        this.conceptRegistry = new ConceptRegistry(
            this.vectorBackend as QdrantBackend,
            this.embeddingService,
            {
                similarityThreshold: 0.85,
                updateSummary: false,
                conceptPagePrefix: this.settings.conceptFE.conceptPagePrefix,
            }
        );
        console.log('💾 Concept registry initialized');

        // Initialize SettingsManager with service updaters
        this.settingsManager = new SettingsManager(
            this.settings,
            () => this.saveSettings(),
            {
                // Adapter: convert BaseModelConfig (baseUrl, model, apiKey) to EmbeddingConfig
                embedding: (config) => {
                    this.embeddingService.updateConfig(this.convertToEmbeddingConfig(config));
                },
                // Adapter: convert BaseModelConfig (baseUrl, model, apiKey) to MetadataExtractorConfig
                llm: (config) => {
                    const llmConfig: Partial<import('./services/metadata-extractor').MetadataExtractorConfig> = {
                        provider: config.provider as 'ollama' | 'openai',
                    };
                    if (config.provider === 'ollama') {
                        if (config.baseUrl) llmConfig.ollamaUrl = config.baseUrl;
                        if (config.model) llmConfig.ollamaModel = config.model;
                    } else if (config.provider === 'openai') {
                        if (config.baseUrl) llmConfig.openaiUrl = config.baseUrl;
                        if (config.model) llmConfig.openaiModel = config.model;
                        if (config.apiKey) llmConfig.openaiApiKey = config.apiKey;
                    }
                    this.metadataExtractor?.updateConfig(llmConfig);
                },
                conceptExtraction: (config) => this.conceptExtractor?.updateConfig(config),
                conceptExtractionSettings: () => this.updateConceptExtractionSettings(),
                conceptFE: (config) => {
                    this.settings.conceptFE = { ...this.settings.conceptFE, ...config };
                },
                conceptSkip: (config) => {
                    this.settings.conceptSkip = { ...this.settings.conceptSkip, ...config };
                },
            }
        );
        console.log('⚙️ Settings manager initialized');

        // Register the unified search view (combines search + recommendations)
        this.registerView(
            VIEW_TYPE_INDEX_SEARCH,
            (leaf) => {
                this.indexSearchView = new IndexSearchView(
                    leaf,
                    this.searchService,
                    this.indexCurrentFileWithConcepts,
                );
                return this.indexSearchView;
            }
        );

        // v0.7.0: Register concept confirmation view
        this.registerView(
            VIEW_TYPE_CONCEPT,
            (leaf) => {
                this.conceptView = new ConceptView(
                    leaf,
                    this.frontmatterService,
                    () => this.settings,
                    () => this.saveSettings(),
                    this.handleCurrentFileAssociation,
                    this.handleAllFilesAssociation,
                );
                return this.conceptView;
            }
        );

        // Add ribbon icon for unified search (search + recommendations)
        this.addRibbonIcon('search', '检索', () => {
            this.activateUnifiedSearchView();
        });

        // v0.6.0: Add ribbon icon for associations
        this.addRibbonIcon('link-2', '关联建议', () => {
            this.activateAssociationView();
        });

        // Add command to open unified search view
        this.addCommand({
            id: 'open-unified-search',
            name: '打开检索',
            callback: () => {
                this.activateUnifiedSearchView();
            },
        });

        // v0.6.0: Add command to open association view
        this.addCommand({
            id: 'open-associations',
            name: '打开关联建议',
            callback: () => {
                this.activateAssociationView();
            },
        });

        // v0.2.0: Setup paragraph detector
        this.setupParagraphDetector();

        // Setup concept event listeners
        this.setupConceptEventListeners();
        this.setupBatchStopRequestListener();

        // Add settings tab
        this.addSettingTab(new MemoEchoSettingTab(this.app, this));
    }

    async onunload() {
        console.log('Unloading Memo Echo Plugin');

        // Cleanup
        const detector = (this as any)._paragraphDetector as ParagraphDetector | undefined;
        if (detector) {
            detector.destroy();
            delete (this as any)._paragraphDetector;
        }
        if (this.indexManager) {
            this.indexManager.stop();
        }

        this.app.workspace.detachLeavesOfType(VIEW_TYPE_INDEX_SEARCH);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CONCEPT);
    }

    async activateUnifiedSearchView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_INDEX_SEARCH)[0];

        if (!leaf) {
            // Create new view in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_INDEX_SEARCH,
                    active: true,
                });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    private indexCurrentFileWithConcepts = async (): Promise<void> => {
        console.log('[MemoEcho] Index current file requested (plugin)');
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            console.warn('[MemoEcho] No active file to index');
            return;
        }

        try {
            console.log('[MemoEcho] Reading active file for indexing:', activeFile.path);
            const content = await this.app.vault.read(activeFile);

            await this.indexManager.indexFile(activeFile.path, content);

            console.log('[MemoEcho] Index completed:', activeFile.path);
        } catch (error) {
            console.error('[MemoEcho] Failed to index current file:', error);
        }
    };

    updateConceptExtractionSettings(): void {
        this.frontmatterService.updateConceptPagePrefix(this.settings.conceptFE.conceptPagePrefix);
    }

    // v0.6.0: Activate association view
    async activateAssociationView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CONCEPT)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_CONCEPT,
                    active: true,
                });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * Handle association for current file
     */
    private handleCurrentFileAssociation = async (): Promise<void> => {
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('❌ 没有打开的文件');
            return;
        }

        console.log('[MemoEcho] Association current file requested:', activeFile.path);
        try {
            const content = await this.app.vault.read(activeFile);

            // Extract concepts using ConceptExtractor
            const detailed = await this.conceptExtractor.extractDetailed(content, activeFile.basename);

            if (detailed.skipReason || !detailed.concepts || detailed.concepts.length === 0) {
                new Notice('ℹ️ 当前文件没有提取到概念');
                return;
            }

            // Process concepts through ConceptRegistry for deduplication
            const concepts: ExtractedConceptWithMatch[] = [];
            for (const extracted of detailed.concepts) {
                const result = await this.conceptRegistry.registerOrMatch(
                    extracted.name,
                    extracted.reason
                );
                concepts.push({
                    name: result.concept,
                    confidence: extracted.confidence,
                    reason: extracted.reason,
                    matchInfo: {
                        originalTerm: extracted.name,
                        matchedConcept: result.concept,
                        matchType: result.isNew ? 'new' : 'alias',
                        confidence: result.similarity,
                    },
                });
            }

            // Dispatch event to association view
            window.dispatchEvent(new CustomEvent('memo-echo:concepts-extracted', {
                detail: {
                    note: {
                        path: activeFile.path,
                        title: activeFile.basename,
                        content,
                    },
                    concepts: concepts,
                },
            }));

            new Notice(`💡 有 ${concepts.length} 个概念待确认`);

            (this as any).pendingConceptFile = activeFile;
        } catch (error) {
            console.error('[MemoEcho] Failed to extract concepts from current file:', error);
            new Notice(`❌ 提取概念失败: ${getErrorMessage(error)}`);
        }
    };

    /**
     * Handle association for all files (batch extraction with accumulate mode)
     */
    private handleAllFilesAssociation = async (): Promise<void> => {
        const files = this.app.vault.getMarkdownFiles();

        if (files.length === 0) {
            new Notice('ℹ️ 没有可索引的文件');
            return;
        }

        if (this.isBatchProcessing) {
            // Processing in progress, this is a stop request
            this.shouldStopBatch = true;
            new Notice('🛑 正在终止批量提取...');
            return;
        }

        this.isBatchProcessing = true;
        this.shouldStopBatch = false;

        console.log('[MemoEcho] Association all files requested');
        new Notice(`🔄 开始批量提取概念，共 ${files.length} 个文件`);

        // Initialize batch extraction state
        const batchResults: Array<{
            note: { path: string; title: string; content: string };
            concepts: ExtractedConceptWithMatch[];
        }> = [];

        let processedCount = 0;
        let conceptCount = 0;

        // 🔥 Trigger display every 3 files
        const BATCH_DISPLAY_SIZE = 3;

        // Send start event
        window.dispatchEvent(new CustomEvent('memo-echo:batch-progress', {
            detail: {
                totalFiles: files.length,
                processedFiles: 0,
                totalConcepts: 0,
                isProcessing: true,
            },
        }));

        try {
            for (let i = 0; i < files.length; i++) {
                // Check if should stop
                if (this.shouldStopBatch) {
                    console.log('[MemoEcho] Batch extraction stopped by user');
                    new Notice(`🛑 批量提取已终止，已处理 ${processedCount}/${files.length} 个文件，提取 ${conceptCount} 个概念`);

                    // Send stop event
                    window.dispatchEvent(new CustomEvent('memo-echo:batch-stop', {
                        detail: {
                            processedFiles: processedCount,
                            totalConcepts: conceptCount,
                        },
                    }));

                    break;
                }

                const file = files[i];
                try {
                    const content = await this.app.vault.read(file);

                    // Extract concepts using ConceptExtractor
                    const detailed = await this.conceptExtractor.extractDetailed(content, file.basename);

                    if (detailed.skipReason || !detailed.concepts || detailed.concepts.length === 0) {
                        // File was skipped or no concepts found
                        processedCount++;

                        // Dispatch progress update
                        window.dispatchEvent(new CustomEvent('memo-echo:batch-progress', {
                            detail: {
                                totalFiles: files.length,
                                processedFiles: processedCount,
                                totalConcepts: conceptCount,
                                isProcessing: true,
                            },
                        }));

                        continue;
                    }

                    // Process concepts through ConceptRegistry for deduplication
                    const concepts: ExtractedConceptWithMatch[] = [];
                    for (const extracted of detailed.concepts) {
                        const result = await this.conceptRegistry.registerOrMatch(
                            extracted.name,
                            extracted.reason
                        );
                        concepts.push({
                            name: result.concept,
                            confidence: extracted.confidence,
                            reason: extracted.reason,
                            matchInfo: {
                                originalTerm: extracted.name,
                                matchedConcept: result.concept,
                                matchType: result.isNew ? 'new' : 'alias',
                                confidence: result.similarity,
                            },
                        });
                    }

                    if (concepts.length > 0) {
                        conceptCount += concepts.length;

                        // Accumulate results instead of dispatching events immediately
                        batchResults.push({
                            note: {
                                path: file.path,
                                title: file.basename,
                                content,
                            },
                            concepts: concepts,
                        });
                    }

                    processedCount++;

                    // Dispatch progress update
                    window.dispatchEvent(new CustomEvent('memo-echo:batch-progress', {
                        detail: {
                            totalFiles: files.length,
                            processedFiles: processedCount,
                            totalConcepts: conceptCount,
                            isProcessing: true,
                        },
                    }));

                    // 🔥 Trigger concept display every 3 files or at the end
                    if ((i + 1) % BATCH_DISPLAY_SIZE === 0 || i === files.length - 1) {
                        console.log('[MemoEcho] Dispatching batch-increment event:', {
                            batchCount: batchResults.length,
                            totalFiles: files.length,
                            processedFiles: processedCount,
                            totalConcepts: conceptCount,
                        });

                        window.dispatchEvent(new CustomEvent('memo-echo:batch-increment', {
                            detail: {
                                batch: [...batchResults], // Copy current accumulated results
                                totalFiles: files.length,
                                processedFiles: processedCount,
                                totalConcepts: conceptCount,
                            },
                        }));
                    }
                } catch (error) {
                    console.warn(`Failed to process file ${file.path}:`, error);
                    // Skip files with errors
                }
            }

            // Send final progress event to mark completion
            window.dispatchEvent(new CustomEvent('memo-echo:batch-progress', {
                detail: {
                    totalFiles: files.length,
                    processedFiles: files.length,
                    totalConcepts: conceptCount,
                    isProcessing: false,
                },
            }));

            new Notice(`✅ 批量提取完成: 已处理 ${processedCount} 个文件，提取 ${conceptCount} 个概念`);
        } catch (error) {
            console.error('[MemoEcho] Failed to batch extract concepts:', error);
            new Notice(`❌ 批量提取失败: ${getErrorMessage(error)}`);
        } finally {
            this.isBatchProcessing = false;
            this.shouldStopBatch = false;

            // Send final progress event
            window.dispatchEvent(new CustomEvent('memo-echo:batch-progress', {
                detail: {
                    totalFiles: files.length,
                    processedFiles: processedCount,
                    totalConcepts: conceptCount,
                    isProcessing: false,
                },
            }));
        }
    };

    /**
     * Setup concept event listeners
     */
    private setupConceptEventListeners() {
        // Listen for concept apply events from sidebar
        window.addEventListener('memo-echo:concepts-apply', async (event) => {
            const concepts = event.detail as unknown as ExtractedConceptWithMatch[];
            const pendingFile = (this as any).pendingConceptFile as TFile | undefined;

            if (!pendingFile) {
                console.warn('[MemoEcho] No pending file for concept application');
                return;
            }

            try {
                // Use ConceptRegistry to match/deduplicate concepts
                const confirmedConcepts: ConfirmedConcept[] = [];
                for (const concept of concepts) {
                    const result = await this.conceptRegistry.registerOrMatch(
                        concept.name,
                        concept.reason
                    );
                    confirmedConcepts.push({
                        name: result.concept,
                        isNew: result.isNew,
                        createPage: false,
                    });
                }

                // Save to frontmatter
                const conceptNames = confirmedConcepts.map(c => c.name);
                await this.frontmatterService.setConcepts(pendingFile, conceptNames);

                // Update indexed_at timestamp
                await this.frontmatterService.setIndexedAt(pendingFile);

                console.log('[MemoEcho] Concepts applied:', concepts.length);
            } catch (error) {
                console.error('[MemoEcho] Failed to apply concepts:', error);
                new Notice(`❌ 提取概念失败: ${getErrorMessage(error)}`);
            } finally {
                delete (this as any).pendingConceptFile;
            }
        });

        // Listen for batch concepts apply events
        window.addEventListener('memo-echo:batch-concepts-apply', async (event) => {
            const { groups } = event.detail;

            console.log('[MemoEcho] Batch concepts apply requested for', groups.length, 'files');

            try {
                let appliedCount = 0;
                let conceptCount = 0;

                for (const group of groups) {
                    const file = this.app.vault.getAbstractFileByPath(group.notePath) as TFile;

                    if (!file) {
                        console.warn(`[MemoEcho] File not found: ${group.notePath}`);
                        continue;
                    }

                    const confirmedConcepts: ConfirmedConcept[] = [];
                    for (const c of group.concepts) {
                        const result = await this.conceptRegistry.registerOrMatch(
                            c.matchInfo.matchedConcept,
                            c.reason
                        );
                        confirmedConcepts.push({
                            name: result.concept,
                            isNew: result.isNew,
                            createPage: false,
                            aliases: c.matchInfo.matchType === 'alias' ? [c.matchInfo.originalTerm] : undefined,
                        });
                    }

                    // Save to frontmatter
                    const conceptNames = confirmedConcepts.map(c => c.name);
                    await this.frontmatterService.setConcepts(file, conceptNames);

                    // Update indexed_at timestamp
                    await this.frontmatterService.setIndexedAt(file);

                    appliedCount++;
                    conceptCount += confirmedConcepts.length;
                }

                new Notice(`✅ 已应用 ${conceptCount} 个概念到 ${appliedCount} 个文件`);

                console.log('[MemoEcho] Batch concepts applied:', appliedCount, 'files,', conceptCount, 'concepts');
            } catch (error) {
                console.error('[MemoEcho] Failed to apply batch concepts:', error);
                new Notice(`❌ 批量应用失败: ${getErrorMessage(error)}`);
            }
        });

        // Listen for single concept apply events (no full refresh)
        window.addEventListener('memo-echo:single-concept-apply', async (event) => {
            const { group } = event.detail;

            console.log('[MemoEcho] Single concept apply requested for', group.notePath);

            try {
                const file = this.app.vault.getAbstractFileByPath(group.notePath) as TFile;

                if (!file) {
                    console.warn(`[MemoEcho] File not found: ${group.notePath}`);
                    return;
                }

                const confirmedConcepts: ConfirmedConcept[] = [];
                for (const c of group.concepts) {
                    const result = await this.conceptRegistry.registerOrMatch(
                        c.matchInfo.matchedConcept,
                        c.reason
                    );
                    confirmedConcepts.push({
                        name: result.concept,
                        isNew: result.isNew,
                        createPage: false,
                        aliases: c.matchInfo.matchType === 'alias' ? [c.matchInfo.originalTerm] : undefined,
                    });
                }

                // Save to frontmatter
                const conceptNames = confirmedConcepts.map(c => c.name);
                await this.frontmatterService.setConcepts(file, conceptNames);

                // Update indexed_at timestamp
                await this.frontmatterService.setIndexedAt(file);

                new Notice(`✅ 已应用 ${confirmedConcepts.length} 个概念`);

                // NO full refresh for single concept - the view handles removing the item
                console.log('[MemoEcho] Single concept applied successfully');
            } catch (error) {
                console.error('[MemoEcho] Failed to apply single concept:', error);
                new Notice(`❌ 应用失败: ${getErrorMessage(error)}`);
            }
        });

        // Listen for concept skip events
        window.addEventListener('memo-echo:concepts-skip', () => {
            console.log('[MemoEcho] Concept extraction skipped by user');
            delete (this as any).pendingConceptFile;
        });
    }

    private setupBatchStopRequestListener(): void {
        window.addEventListener('memo-echo:batch-stop-request', () => {
            if (this.isBatchProcessing) {
                this.shouldStopBatch = true;
                console.log('[MemoEcho] Stop batch requested, setting flag');
            }
        });
    }

    /**
     * Setup paragraph detector for auto-recommendations
     */
    private setupParagraphDetector() {
        const detector = new ParagraphDetector({
            minChars: 100,
            debounceMs: 1000,
            onParagraphComplete: async (event) => {
                // Update recommendations in unified search view
                if (this.indexSearchView) {
                    await this.indexSearchView.updateRecommendations(event.content);
                }
            },
        });

        // Register editor change listener
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const cursorPos = editor.posToOffset(cursor);
                detector.onContentChange(content, cursorPos);
            })
        );

        // Store reference for cleanup
        (this as any)._paragraphDetector = detector;
    }

    /**
     * Load settings from disk
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Save settings to disk
     */
    async saveSettings() {
        await this.saveData(this.settings);
        console.log('💾 Settings saved:', this.settings);
    }
}
