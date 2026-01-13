import { Plugin } from 'obsidian';
import { SemanticSearchView, VIEW_TYPE_SEMANTIC_SEARCH } from './search-view';
import { ImageVectorSettingTab } from './settings';
import { EmbeddingService } from './services/embedding-service';
import { VectorStore } from './services/vector-store';
import { Chunker } from './services/chunker';

export default class ImageVectorPlugin extends Plugin {
    private searchView: SemanticSearchView | null = null;

    // Services
    embeddingService: EmbeddingService;
    vectorStore: VectorStore;
    chunker: Chunker;

    async onload() {
        console.log('Loading Image Vector Plugin');

        // Initialize services
        this.embeddingService = new EmbeddingService({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen3-embedding:4b',
        });

        // VectorStore without dimension - will auto-detect
        this.vectorStore = new VectorStore(
            'obsidian_notes',
            'http://localhost:6333'
        );

        this.chunker = new Chunker({
            minChunkSize: 500,
            maxChunkSize: 800,
            overlapSize: 100,
        });

        // Register the search view
        this.registerView(
            VIEW_TYPE_SEMANTIC_SEARCH,
            (leaf) => {
                this.searchView = new SemanticSearchView(
                    leaf,
                    this.embeddingService,
                    this.vectorStore
                );
                return this.searchView;
            }
        );

        // Add ribbon icon for search
        this.addRibbonIcon('search', '语义搜索', () => {
            this.activateView();
        });

        // Add command to open search view
        this.addCommand({
            id: 'open-semantic-search',
            name: '打开语义搜索',
            callback: () => {
                this.activateView();
            },
        });

        // Add settings tab
        this.addSettingTab(new ImageVectorSettingTab(this.app, this));
    }

    async onunload() {
        console.log('Unloading Image Vector Plugin');
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SEMANTIC_SEARCH);
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
}
