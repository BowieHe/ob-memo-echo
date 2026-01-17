/**
 * EmbeddingService - Multi-provider embedding generation
 * Supports: Local (Transformers.js), Ollama, OpenAI
 */

export type EmbeddingProvider = 'local' | 'ollama' | 'openai';

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
}

export interface BatchEmbeddingResult {
    successful: number[][];
    failed: Array<{ index: number; error: Error }>;
}

export class EmbeddingService {
    private config: EmbeddingConfig;
    private localEmbedder: any = null;
    private isInitialized = false;

    constructor(config: EmbeddingConfig) {
        this.config = config;
    }

    /**
     * Update configuration (e.g., switch providers)
     */
    updateConfig(config: Partial<EmbeddingConfig>) {
        this.config = { ...this.config, ...config };
        // Reset initialization if provider changed
        if (config.provider) {
            this.isInitialized = false;
            this.localEmbedder = null;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        switch (this.config.provider) {
            case 'local':
                return this.embedLocal(text);
            case 'ollama':
                return this.embedOllama(text);
            case 'openai':
                return this.embedOpenAI(text);
            default:
                throw new Error(`Unknown provider: ${this.config.provider}`);
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(
        texts: string[],
        options: { continueOnError?: boolean } = {}
    ): Promise<number[][] | BatchEmbeddingResult> {
        const results: number[][] = [];
        const failed: Array<{ index: number; error: Error }> = [];

        for (let i = 0; i < texts.length; i++) {
            try {
                const embedding = await this.embed(texts[i]);
                results.push(embedding);
            } catch (error) {
                if (options.continueOnError) {
                    failed.push({ index: i, error: error as Error });
                } else {
                    throw error;
                }
            }
        }

        if (options.continueOnError) {
            return { successful: results, failed };
        }

        return results;
    }

    /**
     * Local embedding using Transformers.js
     */
    private async embedLocal(text: string): Promise<number[]> {
        if (!this.localEmbedder) {
            await this.initializeLocalEmbedder();
        }

        const output = await this.localEmbedder(text, {
            pooling: 'mean',
            normalize: true,
        });

        return Array.from(output.data);
    }

    /**
     * Initialize Transformers.js model (lazy loading)
     */
    private async initializeLocalEmbedder() {
        if (this.isInitialized) return;

        const { pipeline } = await import('@xenova/transformers');

        this.localEmbedder = await pipeline(
            'feature-extraction',
            'Xenova/bge-m3'
        );

        this.isInitialized = true;
    }

    /**
     * Ollama embedding
     */
    private async embedOllama(text: string): Promise<number[]> {
        const url = `${this.config.ollamaUrl}/api/embed`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.ollamaModel,
                    input: text,
                }),
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.embeddings[0] || data.embedding;
        } catch (error) {
            throw new Error(`Failed to generate Ollama embedding: ${error.message}`);
        }
    }

    /**
     * OpenAI embedding
     */
    private async embedOpenAI(text: string): Promise<number[]> {
        const apiKey = this.config.openaiApiKey;
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const model = this.config.openaiModel || 'text-embedding-3-small';

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }
}
