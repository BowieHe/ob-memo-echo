import { Plugin, TFile, Notice } from 'obsidian';
import { UnifiedSearchView } from './unified-search-view';
import { AssociationView } from './association-view';
import { MemoEchoSettingTab, MemoEchoSettings, DEFAULT_SETTINGS } from './settings';
import { EmbeddingService } from './services/embedding-service';
import type { VectorBackend } from './services/vector-backend';
import { QdrantBackend } from './services/qdrant-backend';
import { Chunker } from './services/chunker';
import { MetadataExtractor } from './services/metadata-extractor';
import { VectorIndexManager } from './services/vector-index-manager';
import { VIEW_TYPE_UNIFIED_SEARCH, VIEW_TYPE_ASSOCIATION } from './core/constants';
import { ParagraphDetector } from './services/paragraph-detector';
import { FrontmatterService } from './services/frontmatter-service';
import { ConceptExtractor } from './services/concept-extractor';
import { ConceptExtractionPipeline } from './services/concept-extraction-pipeline';
import { SimpleAssociationEngine } from './services/association-engine';
import { AssociationPreferences } from './services/association-preferences';
import type { ConceptExtractionSettings, ConfirmedConcept, ExtractedConceptWithMatch } from './core/types/concept';
import { createLogger, type Logger } from './utils/logger';

export default class MemoEchoPlugin extends Plugin {
    private unifiedSearchView: UnifiedSearchView | null = null;
    private associationView: AssociationView | null = null;

    // Settings
    settings: MemoEchoSettings;

    // Batch processing state
    private isBatchProcessing = false;
    private shouldStopBatch = false;

    // Services
    embeddingService: EmbeddingService;
    vectorBackend: VectorBackend;
    chunker: Chunker;
    metadataExtractor: MetadataExtractor;
    indexManager: VectorIndexManager;
    paragraphDetector: ParagraphDetector | null = null;

    // v0.5.0 services
    frontmatterService: FrontmatterService;
    conceptExtractor: ConceptExtractor;
    conceptExtractionPipeline: ConceptExtractionPipeline;

    // v0.6.0 services
    associationEngine: SimpleAssociationEngine;
    associationPreferences: AssociationPreferences;
    logger: Logger;

    async onload() {
        console.log('Loading Memo Echo Plugin v0.6.0');

        // Load settings
        await this.loadSettings();
        console.log('📝 Loaded settings:', this.settings);

        // Initialize services with saved settings
        this.embeddingService = new EmbeddingService({
            provider: this.settings.embeddingProvider,
            ollamaUrl: this.settings.ollamaUrl,
            ollamaModel: this.settings.ollamaModel,
            openaiApiKey: this.settings.openaiApiKey,
        });
        console.log(`🤖 Embedding service initialized: ${this.settings.embeddingProvider}`);

        // VectorBackend - using Qdrant by default (v0.5.0)
        this.vectorBackend = new QdrantBackend(
            this.settings.qdrantCollection,
            this.settings.qdrantUrl
        );
        console.log(`🗄️ Vector backend initialized: Qdrant @ ${this.settings.qdrantUrl}`);

        this.chunker = new Chunker({
            minChunkSize: 500,
            maxChunkSize: 800,
            overlapSize: 100,
        });
        console.log('✂️ Chunker initialized');

        // v0.2.0: Initialize metadata extractor
        this.metadataExtractor = new MetadataExtractor({
            enableAi: this.settings.enableAiMetadata,
            provider: this.settings.aiGenProvider,
            ollamaUrl: this.settings.aiGenUrl,
            ollamaModel: this.settings.aiGenModel,
            openaiUrl: this.settings.aiGenUrl,
            openaiModel: this.settings.aiGenModel,
            openaiApiKey: this.settings.aiGenApiKey
        });
        console.log('🏷️ Metadata extractor initialized');

        this.logger = createLogger(this.settings.debugLogging);

        // v0.5.0: Initialize concept extractor
        this.conceptExtractor = new ConceptExtractor({
            provider: this.settings.conceptExtractionProvider,
            ollamaUrl: this.settings.ollamaUrl,
            ollamaModel: this.settings.aiGenModel,
            openaiApiKey: this.settings.openaiApiKey,
            // v0.6.0: Abstract concept extraction settings
            focusOnAbstractConcepts: this.settings.focusOnAbstractConcepts,
            minConfidence: this.settings.minConceptConfidence,
            excludeGenericConcepts: this.settings.excludeGenericConcepts
                ? this.settings.excludeGenericConcepts.split(',').map(s => s.trim()).filter(s => s.length > 0)
                : [],
            // v0.8.1: Language adaptation
            language: this.settings.conceptLanguage,
        }, this.logger);
        console.log('💡 Concept extractor initialized (v0.6.0)');

        // v0.6.0: Initialize association engine (before indexManager)
        this.associationEngine = new SimpleAssociationEngine(this.conceptExtractor, {
            minConfidence: this.settings.associationMinConfidence,
        });
        console.log('🔗 Association engine initialized (v0.6.0)');

        // v0.6.0: Initialize association preferences
        this.associationPreferences = new AssociationPreferences(
            () => ({
                ignoredAssociations: this.settings.associationIgnoredAssociations,
                deletedConcepts: this.settings.associationDeletedConcepts,
            }),
            async (next) => {
                this.settings.associationIgnoredAssociations = next.ignoredAssociations;
                this.settings.associationDeletedConcepts = next.deletedConcepts;
                await this.saveSettings();
            },
        );

        // v0.5.0: Initialize index manager with VectorBackend
        this.indexManager = new VectorIndexManager(
            this.vectorBackend,
            this.embeddingService,
            this.chunker,
            this.metadataExtractor,
            50 * 1024 * 1024, // 50MB cache
            this.associationEngine,
        );

        // v0.5.0: Initialize frontmatter service
        this.frontmatterService = new FrontmatterService(
            this.app,
            this.settings.conceptPagePrefix
        );
        console.log('📝 Frontmatter service initialized');

        this.conceptExtractionPipeline = new ConceptExtractionPipeline(
            this.app,
            this.conceptExtractor,
            this.frontmatterService,
            this.getConceptExtractionSettings(),
            this.logger
        );

        // Register the unified search view (combines search + recommendations)
        this.registerView(
            VIEW_TYPE_UNIFIED_SEARCH,
            (leaf) => {
                this.unifiedSearchView = new UnifiedSearchView(
                    leaf,
                    this.indexManager,
                    this.indexCurrentFileWithConcepts,
                );
                return this.unifiedSearchView;
            }
        );

        // v0.6.0: Register association view
        this.registerView(
            VIEW_TYPE_ASSOCIATION,
            (leaf) => {
                this.associationView = new AssociationView(
                    leaf,
                    this.associationEngine,
                    this.frontmatterService,
                    this.associationPreferences,
                    () => this.settings,
                    this.handleCurrentFileAssociation,
                    this.handleAllFilesAssociation,
                );
                return this.associationView;
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
        if (this.paragraphDetector) {
            this.paragraphDetector.destroy();
        }
        if (this.indexManager) {
            this.indexManager.stop();
        }

        this.app.workspace.detachLeavesOfType(VIEW_TYPE_UNIFIED_SEARCH);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_ASSOCIATION);
    }

    async activateUnifiedSearchView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_UNIFIED_SEARCH)[0];

        if (!leaf) {
            // Create new view in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_UNIFIED_SEARCH,
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

    private getConceptExtractionSettings(): ConceptExtractionSettings {
        return {
            enableConceptExtraction: this.settings.enableConceptExtraction,
            injectToFrontmatter: this.settings.injectToFrontmatter,
            autoCreateConceptPage: this.settings.autoCreateConceptPage,
            conceptPagePrefix: this.settings.conceptPagePrefix,
            conceptCountRules: this.settings.conceptCountRules,
            skipRules: this.settings.skipRules,
            conceptDictionaryPath: this.settings.conceptDictionaryPath,
        };
    }

    updateConceptExtractionSettings(): void {
        this.frontmatterService.updateConceptPagePrefix(this.settings.conceptPagePrefix);
        this.conceptExtractionPipeline.updateSettings(this.getConceptExtractionSettings());
    }

    updateLogger(): void {
        this.logger = createLogger(this.settings.debugLogging);
        this.conceptExtractor.setLogger(this.logger);
        this.conceptExtractionPipeline.setLogger(this.logger);
    }

    // v0.6.0: Activate association view
    async activateAssociationView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_ASSOCIATION)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_ASSOCIATION,
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
            const tags = this.app.metadataCache.getFileCache(activeFile)?.tags?.map((t) => t.tag) || [];

            const result = await this.conceptExtractionPipeline.extract({
                path: activeFile.path,
                title: activeFile.basename,
                content,
                tags,
            });

            if (result.skipped || !result.concepts || result.concepts.length === 0) {
                new Notice('ℹ️ 当前文件没有提取到概念');
                return;
            }

            // Dispatch event to association view
            window.dispatchEvent(new CustomEvent('memo-echo:concepts-extracted', {
                detail: {
                    note: {
                        path: activeFile.path,
                        title: activeFile.basename,
                        content,
                    },
                    concepts: result.concepts,
                },
            }));

            new Notice(`💡 有 ${result.concepts.length} 个概念待确认`);

            (this as any).pendingConceptFile = activeFile;
        } catch (error) {
            console.error('[MemoEcho] Failed to extract concepts from current file:', error);
            new Notice(`❌ 提取概念失败: ${error.message}`);
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
                    const tags = this.app.metadataCache.getFileCache(file)?.tags?.map((t) => t.tag) || [];

                    const result = await this.conceptExtractionPipeline.extract({
                        path: file.path,
                        title: file.basename,
                        content,
                        tags,
                    });

                    if (!result.skipped && result.concepts && result.concepts.length > 0) {
                        conceptCount += result.concepts.length;

                        // Accumulate results instead of dispatching events immediately
                        batchResults.push({
                            note: {
                                path: file.path,
                                title: file.basename,
                                content,
                            },
                            concepts: result.concepts,
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
            new Notice(`❌ 批量提取失败: ${error.message}`);
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
        window.addEventListener('memo-echo:concepts-apply', async (event: CustomEvent<ConfirmedConcept[]>) => {
            const concepts = event.detail;
            const pendingFile = (this as any).pendingConceptFile as TFile | undefined;

            if (!pendingFile) {
                console.warn('[MemoEcho] No pending file for concept application');
                return;
            }

            try {
                await this.conceptExtractionPipeline.apply(pendingFile, concepts);
                console.log('[MemoEcho] Concepts applied:', concepts.length);
            } catch (error) {
                console.error('[MemoEcho] Failed to apply concepts:', error);
            } finally {
                delete (this as any).pendingConceptFile;
            }
        });

        // Listen for batch concepts apply events
        window.addEventListener('memo-echo:batch-concepts-apply', async (event: CustomEvent<{
            groups: Array<{
                notePath: string;
                noteTitle: string;
                concepts: ExtractedConceptWithMatch[];
            }>;
        }>) => {
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

                    const confirmedConcepts: ConfirmedConcept[] = group.concepts.map(c => ({
                        name: c.matchInfo.matchedConcept,
                        isNew: c.matchInfo.matchType === 'new',
                        createPage: false,
                        aliases: c.matchInfo.matchType === 'alias' ? [c.matchInfo.originalTerm] : undefined,
                    }));

                    await this.conceptExtractionPipeline.apply(file, confirmedConcepts);
                    appliedCount++;
                    conceptCount += confirmedConcepts.length;
                }

                new Notice(`✅ 已应用 ${conceptCount} 个概念到 ${appliedCount} 个文件`);

                // Refresh associations after batch apply
                if (this.associationView) {
                    console.log('[MemoEcho] Refreshing associations after batch apply...');
                    await this.associationView.refreshAssociations({ scan: true });
                    console.log('[MemoEcho] Associations refreshed successfully');
                }

                console.log('[MemoEcho] Batch concepts applied:', appliedCount, 'files,', conceptCount, 'concepts');
            } catch (error) {
                console.error('[MemoEcho] Failed to apply batch concepts:', error);
                new Notice(`❌ 批量应用失败: ${error.message}`);
            }
        });

        // Listen for single concept apply events (no full refresh)
        window.addEventListener('memo-echo:single-concept-apply', async (event: CustomEvent<{
            group: {
                notePath: string;
                noteTitle: string;
                concepts: ExtractedConceptWithMatch[];
            };
        }>) => {
            const { group } = event.detail;

            console.log('[MemoEcho] Single concept apply requested for', group.notePath);

            try {
                const file = this.app.vault.getAbstractFileByPath(group.notePath) as TFile;

                if (!file) {
                    console.warn(`[MemoEcho] File not found: ${group.notePath}`);
                    return;
                }

                const confirmedConcepts: ConfirmedConcept[] = group.concepts.map(c => ({
                    name: c.matchInfo.matchedConcept,
                    isNew: c.matchInfo.matchType === 'new',
                    createPage: false,
                    aliases: c.matchInfo.matchType === 'alias' ? [c.matchInfo.originalTerm] : undefined,
                }));

                await this.conceptExtractionPipeline.apply(file, confirmedConcepts);

                new Notice(`✅ 已应用 ${confirmedConcepts.length} 个概念`);

                // NO full refresh for single concept - the view handles removing the item
                console.log('[MemoEcho] Single concept applied successfully');
            } catch (error) {
                console.error('[MemoEcho] Failed to apply single concept:', error);
                new Notice(`❌ 应用失败: ${error.message}`);
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
        this.paragraphDetector = new ParagraphDetector({
            minChars: 100,
            debounceMs: 1000,
            onParagraphComplete: async (event) => {
                // Update recommendations in unified search view
                if (this.unifiedSearchView) {
                    await this.unifiedSearchView.updateRecommendations(event.content);
                }
            },
        });

        // Register editor change listener
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                const content = editor.getValue();
                const cursor = editor.getCursor();
                const cursorPos = editor.posToOffset(cursor);

                if (this.paragraphDetector) {
                    this.paragraphDetector.onContentChange(content, cursorPos);
                }
            })
        );
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
