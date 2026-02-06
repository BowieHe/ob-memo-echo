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
    getConcept(concept: string): Promise<ConceptRecord | null>;
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
        // 1. Generate vectors
        const conceptVector = await this.embeddingService.embed(conceptName);
        const summaryVector = await this.embeddingService.embed(reason);

        // 2. Try strict matching first (using only concept_vec)
        const strictMatches = await this.qdrant.searchSimilarConceptsStrict(
            conceptVector,
            { limit: 1, scoreThreshold: 0.90 }
        );

        if (strictMatches.length > 0) {
            // Found match, update usage count
            await this.qdrant.updateConceptUsageWithVectors(
                strictMatches[0].payload.concept,
                conceptVector,
                summaryVector
            );
            return {
                matched: true,
                concept: strictMatches[0].payload.concept,
                summary: strictMatches[0].payload.summary,
                similarity: strictMatches[0].score,
                isNew: false,
            };
        }

        // 3. Loose matching (fusion of both vectors)
        const looseMatches = await this.qdrant.searchSimilarConceptsLoose(
            conceptVector,
            summaryVector,
            { limit: 1, scoreThreshold: this.options.similarityThreshold }
        );

        if (looseMatches.length > 0) {
            await this.qdrant.updateConceptUsageWithVectors(
                looseMatches[0].payload.concept,
                conceptVector,
                summaryVector
            );
            return {
                matched: true,
                concept: looseMatches[0].payload.concept,
                summary: looseMatches[0].payload.summary,
                similarity: looseMatches[0].score,
                isNew: false,
            };
        }

        // 4. No match, create new concept
        const link = `[[${this.options.conceptPagePrefix}/${conceptName}]]`;
        await this.qdrant.upsertConcept(
            conceptName,
            reason,
            link,
            conceptVector,
            summaryVector
        );

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
        return await this.qdrant.getConcept(concept);
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
            const summaryVector = await this.embeddingService.embed(existing.summary);
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
