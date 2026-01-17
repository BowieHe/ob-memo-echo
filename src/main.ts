import { Plugin, MarkdownView } from 'obsidian';
import { SemanticSearchView, VIEW_TYPE_SEMANTIC_SEARCH } from './search-view';
import { RecommendationView, VIEW_TYPE_RECOMMENDATION } from './recommendation-view';
import { MemoEchoSettingTab, MemoEchoSettings, DEFAULT_SETTINGS } from './settings';
import { EmbeddingService } from './services/embedding-service';
import { VectorStore } from './services/vector-store';
import { Chunker } from './services/chunker';
import { MetadataExtractor } from './services/metadata-extractor';
import { VectorIndexManager } from './services/vector-index-manager';
import { ParagraphDetector } from './services/paragraph-detector';

export default class MemoEchoPlugin extends Plugin {
    private searchView: SemanticSearchView | null = null;
    private recommendationView: RecommendationView | null = null;

    // Settings
    settings: MemoEchoSettings;

    // Services
    embeddingService: EmbeddingService;
    vectorStore: VectorStore;
    chunker: Chunker;
    metadataExtractor: MetadataExtractor;
    indexManager: VectorIndexManager;
    paragraphDetector: ParagraphDetector | null = null;

    async onload() {
        console.log('Loading Memo Echo Plugin v0.3.0');

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

        // VectorStore without dimension - will auto-detect
        this.vectorStore = new VectorStore(
            this.settings.qdrantCollection,
            this.settings.qdrantUrl
        );
        console.log(`🗄️ Vector store initialized: ${this.settings.qdrantUrl}`);

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

        // v0.2.0: Initialize index manager
        this.indexManager = new VectorIndexManager(
            this.vectorStore,
            this.embeddingService,
            this.chunker,
            this.metadataExtractor
        );

        // Register the search view
        this.registerView(
            VIEW_TYPE_SEMANTIC_SEARCH,
            (leaf) => {
                this.searchView = new SemanticSearchView(
                    leaf,
                    this.indexManager
                );
                return this.searchView;
            }
        );

        // v0.2.0: Register recommendation view
        this.registerView(
            VIEW_TYPE_RECOMMENDATION,
            (leaf) => {
                this.recommendationView = new RecommendationView(
                    leaf,
                    this.indexManager
                );
                return this.recommendationView;
            }
        );

        // Add ribbon icon for search
        this.addRibbonIcon('search', '语义搜索', () => {
            this.activateView();
        });

        // v0.2.0: Add ribbon icon for recommendations
        this.addRibbonIcon('links', '相关推荐', () => {
            this.activateRecommendationView();
        });

        // Add command to open search view
        this.addCommand({
            id: 'open-semantic-search',
            name: '打开语义搜索',
            callback: () => {
                this.activateView();
            },
        });

        // v0.2.0: Add command to open recommendation view
        this.addCommand({
            id: 'open-recommendations',
            name: '打开相关推荐',
            callback: () => {
                this.activateRecommendationView();
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

        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SEMANTIC_SEARCH);
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_RECOMMENDATION);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_SEMANTIC_SEARCH)[0];

        if (!leaf) {
            // Create new view in right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_SEMANTIC_SEARCH,
                    active: true,
                });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async activateRecommendationView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_RECOMMENDATION)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_RECOMMENDATION,
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
                // Update recommendations
                if (this.recommendationView) {
                    await this.recommendationView.updateRecommendations(event.content);
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
