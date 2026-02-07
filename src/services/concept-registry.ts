/**
 * Concept Registry - Concept deduplication and matching service
 * v0.7.0: Uses Qdrant vector storage for concept matching
 */

import type {
    ConceptRecord,
    ConceptMatchResult,
    ConceptRegistryOptions,
} from '@core/types/concept-registry';

// Minimal interface for embedding service
interface IEmbeddingService {
    embed(text: string): Promise<number[]>;
}

// Minimal interface for QdrantBackend concept methods
interface QdrantBackendConceptMethods {
    upsertConcept(
        concept: string,
        summary: string,
        link: string,
        conceptVector: number[],
        summaryVector: number[]
    ): Promise<void>;
    searchSimilarConceptsStrict(
        queryVector: number[],
        options?: { limit?: number; scoreThreshold?: number }
    ): Promise<Array<{ id: string; score: number; payload: ConceptRecord }>>;
    searchSimilarConceptsLoose(
        conceptVector: number[],
        summaryVector: number[],
        options?: { limit?: number; scoreThreshold?: number }
    ): Promise<Array<{ id: string; score: number; payload: ConceptRecord }>>;
    scrollConcepts(options?: { limit?: number; offset?: string }):
        Promise<{ points: Array<{ payload: ConceptRecord }>; nextPage: string | null }>;
    getConcept(concept: string): Promise<{ payload: ConceptRecord; id: string } | null>;
    updateConceptUsageWithVectors(
        concept: string,
        conceptVector: number[],
        summaryVector: number[]
    ): Promise<void>;
}

export class ConceptRegistry {
    private qdrant: QdrantBackendConceptMethods;
    private embeddingService: IEmbeddingService;
    private options: Required<ConceptRegistryOptions>;

    constructor(
        qdrant: QdrantBackendConceptMethods,
        embeddingService: IEmbeddingService,
        options: ConceptRegistryOptions = {}
    ) {
        this.qdrant = qdrant;
        this.embeddingService = embeddingService;
        this.options = {
            similarityThreshold: options.similarityThreshold ?? 0.85,
            updateSummary: options.updateSummary ?? false,
            conceptPagePrefix: options.conceptPagePrefix ?? '_me',
        };
    }

    /**
     * Register or match a concept (core method)
     */
    async registerOrMatch(
        conceptName: string,
        reason: string
    ): Promise<ConceptMatchResult> {
        console.log(`[ConceptRegistry] Registering concept: "${conceptName}"`);

        // 1. Generate vectors
        let conceptVector: number[];
        let summaryVector: number[];
        try {
            conceptVector = await this.embeddingService.embed(conceptName);
            summaryVector = await this.embeddingService.embed(reason);
            console.log(`[ConceptRegistry] Vectors generated for "${conceptName}"`);
        } catch (error) {
            console.error(`[ConceptRegistry] Failed to generate embeddings for "${conceptName}":`, error);
            throw new Error(`Failed to generate embeddings for concept "${conceptName}": ${error}`);
        }

        // 2. Try strict matching first (using only concept_vec)
        let strictMatches: Array<{ id: string; score: number; payload: any }> = [];
        try {
            strictMatches = await this.qdrant.searchSimilarConceptsStrict(
                conceptVector,
                { limit: 1, scoreThreshold: 0.90 }
            );
            console.log(`[ConceptRegistry] Strict search returned ${strictMatches.length} matches`);
        } catch (error: any) {
            console.warn(`[ConceptRegistry] Strict search failed (continuing):`, error?.message || error);
        }

        if (strictMatches.length > 0) {
            // Found match, update usage count
            try {
                await this.qdrant.updateConceptUsageWithVectors(
                    strictMatches[0].payload.concept,
                    conceptVector,
                    summaryVector
                );
                console.log(`[ConceptRegistry] Matched existing concept: "${strictMatches[0].payload.concept}"`);
            } catch (error: any) {
                console.warn(`[ConceptRegistry] Failed to update usage count:`, error?.message || error);
            }
            return {
                matched: true,
                concept: strictMatches[0].payload.concept,
                summary: strictMatches[0].payload.summary,
                similarity: strictMatches[0].score,
                isNew: false,
            };
        }

        // 3. Loose matching (fusion of both vectors)
        let looseMatches: Array<{ id: string; score: number; payload: any }> = [];
        try {
            looseMatches = await this.qdrant.searchSimilarConceptsLoose(
                conceptVector,
                summaryVector,
                { limit: 1, scoreThreshold: this.options.similarityThreshold }
            );
            console.log(`[ConceptRegistry] Loose search returned ${looseMatches.length} matches`);
        } catch (error: any) {
            console.warn(`[ConceptRegistry] Loose search failed (continuing):`, error?.message || error);
        }

        if (looseMatches.length > 0) {
            try {
                await this.qdrant.updateConceptUsageWithVectors(
                    looseMatches[0].payload.concept,
                    conceptVector,
                    summaryVector
                );
                console.log(`[ConceptRegistry] Matched existing concept (loose): "${looseMatches[0].payload.concept}"`);
            } catch (error: any) {
                console.warn(`[ConceptRegistry] Failed to update usage count:`, error?.message || error);
            }
            return {
                matched: true,
                concept: looseMatches[0].payload.concept,
                summary: looseMatches[0].payload.summary,
                similarity: looseMatches[0].score,
                isNew: false,
            };
        }

        // 4. No match, create new concept
        console.log(`[ConceptRegistry] Creating new concept: "${conceptName}"`);
        const link = `[[${this.options.conceptPagePrefix}/${conceptName}]]`;
        try {
            await this.qdrant.upsertConcept(
                conceptName,
                reason,
                link,
                conceptVector,
                summaryVector
            );
            console.log(`[ConceptRegistry] Successfully created concept: "${conceptName}"`);
        } catch (error: any) {
            // Check if it's a connection error
            if (error?.message?.includes('ECONNREFUSED') ||
                error?.message?.includes('Connection refused') ||
                error?.message?.includes('Failed to fetch')) {
                const errorMsg = `无法连接到 Qdrant 服务。请检查：\n1. Qdrant 是否正在运行\n2. URL 配置是否正确（当前: localhost:6333）`;
                console.error(`[ConceptRegistry] ${errorMsg}`);
                throw new Error(errorMsg);
            }
            console.error(`[ConceptRegistry] Failed to upsert concept "${conceptName}":`, error);
            throw error;
        }

        return {
            matched: false,
            concept: conceptName,
            summary: reason,
            similarity: 0,
            isNew: true,
        };
    }

    /**
     * Batch register/match concepts
     */
    async registerOrMatchBatch(
        items: Array<{ concept: string; reason: string }>
    ): Promise<ConceptMatchResult[]> {
        const results: ConceptMatchResult[] = [];

        for (const item of items) {
            const result = await this.registerOrMatch(item.concept, item.reason);
            results.push(result);
        }

        return results;
    }

    /**
     * Get all concepts
     */
    async getAllConcepts(): Promise<ConceptRecord[]> {
        const concepts: ConceptRecord[] = [];
        let nextPage: string | null = null;

        do {
            const result = await this.qdrant.scrollConcepts({ limit: 100, offset: nextPage || undefined });
            concepts.push(...result.points.map(p => p.payload));
            nextPage = result.nextPage;
        } while (nextPage);

        return concepts;
    }

    /**
     * Get single concept details
     */
    async getConcept(concept: string): Promise<ConceptRecord | null> {
        const result = await this.qdrant.getConcept(concept);
        return result?.payload ?? null;
    }

    /**
     * Update concept usage count
     */
    async updateUsage(concept: string): Promise<void> {
        // Note: This method requires re-embedding
        // Consider caching vectors if this becomes a performance issue
        const conceptVector = await this.embeddingService.embed(concept);
        const existing = await this.qdrant.getConcept(concept);

        if (existing) {
            const summaryVector = await this.embeddingService.embed(existing.payload.summary);
            await this.qdrant.updateConceptUsageWithVectors(concept, conceptVector, summaryVector);
        }
    }

    /**
     * Update options
     */
    updateOptions(options: Partial<ConceptRegistryOptions>): void {
        if (options.similarityThreshold !== undefined) {
            this.options.similarityThreshold = options.similarityThreshold;
        }
        if (options.updateSummary !== undefined) {
            this.options.updateSummary = options.updateSummary;
        }
        if (options.conceptPagePrefix !== undefined) {
            this.options.conceptPagePrefix = options.conceptPagePrefix;
        }
    }
}
