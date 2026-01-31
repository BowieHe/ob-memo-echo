import { Plugin } from 'obsidian';
import { UnifiedSearchView } from './unified-search-view';
import { AssociationView } from './association-view';
import { MemoEchoSettingTab, MemoEchoSettings, DEFAULT_SETTINGS } from './settings';
import { EmbeddingService } from './services/embedding-service';
import type { VectorBackend } from './backends/vector-backend';
import { QdrantBackend } from './backends/qdrant-backend';
import { Chunker } from './services/chunker';
import { MetadataExtractor } from './services/metadata-extractor';
import { VectorIndexManager } from './services/vector-index-manager';
import { VIEW_TYPE_UNIFIED_SEARCH, VIEW_TYPE_ASSOCIATION } from './core/constants';
import { ParagraphDetector } from './services/paragraph-detector';
import { FrontmatterService } from './services/frontmatter-service';
import { ConceptExtractor } from './services/concept-extractor';
import { SimpleAssociationEngine } from './services/association-engine';
import { AssociationPreferences } from './services/association-preferences';

export default class MemoEchoPlugin extends Plugin {
    private unifiedSearchView: UnifiedSearchView | null = null;
    private associationView: AssociationView | null = null;

    // Settings
    settings: MemoEchoSettings;

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

    // v0.6.0 services
    associationEngine: SimpleAssociationEngine;
    associationPreferences: AssociationPreferences;

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
        });
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
            this.settings.conceptPageFolder
        );
        console.log('📝 Frontmatter service initialized');

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

            if (!this.settings.injectConcepts) {
                console.log('[MemoEcho] Concept injection disabled; skipping frontmatter write');
                return;
            }

            let concepts = this.associationEngine.getNoteConcepts(activeFile.path);
            if (!concepts || concepts.length === 0) {
                const extracted = await this.conceptExtractor.extract(content, activeFile.basename);
                concepts = extracted.concepts;
            }

            if (!concepts || concepts.length === 0) {
                console.warn('[MemoEcho] No concepts extracted; skipping frontmatter write');
                return;
            }

            await this.frontmatterService.updateAfterIndexing(activeFile, concepts);
            console.log('[MemoEcho] Frontmatter updated with concepts:', concepts.length);
        } catch (error) {
            console.error('[MemoEcho] Failed to index current file:', error);
        }
    };

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
