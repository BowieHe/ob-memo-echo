/**
 * QdrantBackend - Qdrant implementation of VectorBackend
 * v0.5.0: Refactored from vector-store.ts
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import {
    VectorBackend,
    MultiVectorItem,
    SearchResult,
    SearchOptions,
    VECTOR_NAMES,
} from './vector-backend';
import { generateUUID } from '@utils/uuid';
import { Notice } from 'obsidian';
import type { ConceptPayload } from '@core/types/concept-registry';

// Minimal interface for embedding service dimension access
interface EmbeddingServiceDimension {
    getDimension(): number;
}

export class QdrantBackend implements VectorBackend {
    private client: QdrantClient;
    private collectionName: string;
    private qdrantUrl: string;
    private vectorSize: number | null = null;

    constructor(
        collectionName: string = 'obsidian_notes',
        qdrantUrl: string = 'http://localhost:6333',
        private embeddingService?: EmbeddingServiceDimension
    ) {
        this.client = new QdrantClient({ url: qdrantUrl });
        this.collectionName = collectionName;
        this.qdrantUrl = qdrantUrl;
    }

    async initialize(): Promise<void> {
        // No-op, collection created on first upsert
    }

    async upsertMultiVector(item: MultiVectorItem): Promise<void> {
        // Auto-detect dimension from first vector
        if (this.vectorSize === null) {
            this.vectorSize = item.vectors[VECTOR_NAMES.CONTENT].length;
            console.log(`[Qdrant] Auto-detected vector dimension: ${this.vectorSize}`);
            await this.ensureCollection(this.vectorSize);
        }

        const uuid = generateUUID();

        await this.client.upsert(this.collectionName, {
            points: [
                {
                    id: uuid,
                    vector: {
                        [VECTOR_NAMES.CONTENT]: item.vectors[VECTOR_NAMES.CONTENT],
                        [VECTOR_NAMES.SUMMARY]: item.vectors[VECTOR_NAMES.SUMMARY],
                        [VECTOR_NAMES.TITLE]: item.vectors[VECTOR_NAMES.TITLE],
                    },
                    payload: {
                        ...item.metadata,
                        _customId: item.id,
                    },
                },
            ],
        });
    }

    private async ensureCollection(dimension: number): Promise<void> {
        console.log(`[Qdrant] ensureCollection called with dimension: ${dimension}`);

        try {
            const collection = await this.client.getCollection(this.collectionName);
            console.log('[Qdrant] Collection exists:', collection.config?.params?.vectors);
        } catch (error: any) {
            // Collection doesn't exist, try to create it
            console.log(`[Qdrant] Collection doesn't exist, creating with Named Vectors, dimension ${dimension}`);
            try {
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        // Chunk vectors
                        [VECTOR_NAMES.CONTENT]: { size: dimension, distance: 'Cosine' },
                        [VECTOR_NAMES.SUMMARY]: { size: dimension, distance: 'Cosine' },
                        [VECTOR_NAMES.TITLE]: { size: dimension, distance: 'Cosine' },
                        // Concept vectors (v0.7.0+)
                        concept_vec: { size: dimension, distance: 'Cosine' },
                        concept_summary_vec: { size: dimension, distance: 'Cosine' },
                    },
                });
                console.log('[Qdrant] Collection created successfully');
            } catch (createError: any) {
                console.error('[Qdrant] Failed to create collection:', createError);
                // Better error message for connection issues
                if (createError?.message?.includes('ECONNREFUSED') ||
                    createError?.message?.includes('Connection refused') ||
                    createError?.message?.includes('Failed to fetch') ||
                    createError?.message?.includes('ERR_CONNECTION_REFUSED')) {
                    throw new Error(`无法连接到 Qdrant 服务 (${this.qdrantUrl})。请确保 Qdrant 正在运行。`);
                }
                // Throw the original error with more context
                throw new Error(`Failed to create collection: ${createError?.message || createError}`);
            }
        }

        console.log(`[Qdrant] ensureCollection completed for collection: ${this.collectionName}`);
    }

    async searchWithFusion(
        queryVector: number[],
        options: SearchOptions = {}
    ): Promise<SearchResult[]> {
        const limit = options.limit || 10;
        const prefetchLimit = limit * 2;

        // Check if collection exists, if not create it with query vector dimension
        try {
            const collection = await this.client.getCollection(this.collectionName);
            if (!collection.points_count || collection.points_count === 0) {
                console.log('[Qdrant] Collection is empty, returning empty results');
                return [];
            }
        } catch (error: any) {
            console.log('[Qdrant] Collection does not exist, creating with query dimension');
            const dimension = queryVector.length;
            await this.ensureCollection(dimension);
            console.log('[Qdrant] Collection created, but empty, returning empty results');
            return [];
        }

        // Build filter condition if tags provided
        let filterCondition: any = undefined;
        if (options.filter?.tags && options.filter.tags.length > 0) {
            filterCondition = {
                must: [
                    {
                        key: 'tags',
                        match: { any: options.filter.tags },
                    },
                ],
            };
        }

        // Use Qdrant Query API for native RRF fusion
        const results = await this.client.query(this.collectionName, {
            prefetch: [
                {
                    query: queryVector,
                    using: VECTOR_NAMES.CONTENT,
                    limit: prefetchLimit,
                    filter: filterCondition,
                },
                {
                    query: queryVector,
                    using: VECTOR_NAMES.SUMMARY,
                    limit: prefetchLimit,
                    filter: filterCondition,
                },
                {
                    query: queryVector,
                    using: VECTOR_NAMES.TITLE,
                    limit: prefetchLimit,
                    filter: filterCondition,
                },
            ],
            query: { fusion: 'rrf' },
            limit,
            with_payload: true,
        });

        return results.points.map(point => {
            const payload = point.payload as any;
            const { _customId, ...metadata } = payload;

            return {
                id: _customId,
                score: point.score || 0,
                metadata,
            };
        });
    }

    async delete(id: string): Promise<void> {
        await this.client.delete(this.collectionName, {
            filter: {
                must: [
                    {
                        key: '_customId',
                        match: { value: id },
                    },
                ],
            },
        });
    }

    async deleteByFilePath(filePath: string): Promise<void> {
        await this.client.delete(this.collectionName, {
            filter: {
                must: [
                    {
                        key: 'filePath',
                        match: { value: filePath },
                    },
                ],
            },
        });
    }

    async count(): Promise<number> {
        try {
            const info = await this.client.getCollection(this.collectionName);
            return info.points_count || 0;
        } catch (error) {
            return 0;
        }
    }

    async clear(): Promise<void> {
        try {
            await this.client.deleteCollection(this.collectionName);
            this.vectorSize = null;
        } catch (error) {
            // Collection might not exist, ignore
        }
    }

    async ensureReady(): Promise<void> {
        try {
            await this.flush();
        } catch (error: any) {
            if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Connection refused')) {
                new Notice('❌ Qdrant 服务未运行，请确保 Qdrant 已启动');
            } else if (error.message?.includes('Not Found') || error.message?.includes('404')) {
                console.log('[Qdrant] Collection not found, will be created on next operation');
            } else {
                console.error('[Qdrant] Error ensuring ready:', error);
            }
            throw error;
        }
    }

    private async flush(): Promise<void> {
        try {
            const collection = await this.client.getCollection(this.collectionName);
            console.log('[Qdrant] Collection exists:', collection.config);
        } catch (error) {
            console.log('[Qdrant] Collection does not exist, will be created on next upsert');
            // Collection will be created on first upsert
        }
    }

    // ==================== Concept Registry Methods (v0.7.0+) ====================

    /**
     * Create or update a concept record using Named Vectors
     */
    async upsertConcept(
        concept: string,
        summary: string,
        link: string,
        conceptVector: number[],
        summaryVector: number[]
    ): Promise<void> {
        console.log(`[Qdrant] upsertConcept called for: "${concept}", vector dimension: ${conceptVector.length}`);

        // Always ensure collection exists before upserting
        // Store vectorSize for future use
        if (this.vectorSize === null) {
            this.vectorSize = conceptVector.length;
        }
        await this.ensureCollection(this.vectorSize);

        const now = new Date().toISOString();

        // Check if concept already exists
        console.log(`[Qdrant] Checking if concept "${concept}" exists...`);
        const existing = await this.getConcept(concept);

        if (existing) {
            console.log(`[Qdrant] Concept "${concept}" exists, updating...`);
            // Use existing point ID for update
            const id = existing.id;
            // Update existing concept
            try {
                await this.client.upsert(this.collectionName, {
                    points: [{
                        id,
                        vector: {
                            concept_vec: conceptVector,
                            concept_summary_vec: summaryVector,
                        },
                        payload: {
                            ...existing.payload,
                            summary,
                            link,
                            lastUsedAt: now,
                        } as ConceptPayload,
                    }],
                });
                console.log(`[Qdrant] Updated concept: ${concept}`);
            } catch (error: any) {
                console.error(`[Qdrant] Failed to update concept "${concept}":`, error);
                throw new Error(`Failed to update concept "${concept}": ${error?.message || error}`);
            }
        } else {
            console.log(`[Qdrant] Concept "${concept}" is new, creating...`);
            // Generate new UUID for new concept
            const id = generateUUID();
            // Create new concept
            try {
                await this.client.upsert(this.collectionName, {
                    points: [{
                        id,
                        vector: {
                            concept_vec: conceptVector,
                            concept_summary_vec: summaryVector,
                        },
                        payload: {
                            type: 'concept',
                            concept,
                            summary,
                            link,
                            noteCount: 1,
                            firstSeenAt: now,
                            lastUsedAt: now,
                        } as ConceptPayload,
                    }],
                });
                console.log(`[Qdrant] Created concept: ${concept}`);
            } catch (error: any) {
                console.error(`[Qdrant] Failed to create concept "${concept}":`, error);
                // Provide more helpful error message
                if (error?.message?.includes('Not found')) {
                    throw new Error(`Collection not found. Please try restarting the plugin or check Qdrant configuration.`);
                }
                throw new Error(`Failed to create concept "${concept}": ${error?.message || error}`);
            }
        }
    }

    /**
     * Search for similar concepts using only concept_vec (strict matching)
     */
    async searchSimilarConceptsStrict(
        queryVector: number[],
        options: { limit?: number; scoreThreshold?: number } = {}
    ): Promise<Array<{ id: string; score: number; payload: ConceptPayload }>> {
        const limit = options.limit || 10;
        const scoreThreshold = options.scoreThreshold ?? 0.90;

        try {
            const results = await this.client.search(this.collectionName, {
                vector: {
                    name: 'concept_vec',
                    vector: queryVector,
                },
                limit,
                score_threshold: scoreThreshold,
                with_payload: true,
                filter: {
                    must: [{ key: 'type', match: { value: 'concept' } }],
                },
            });

            // Type assertion to handle Qdrant client response format
            const searchResults = results as any;
            const points = searchResults.points || searchResults || [];

            return (Array.isArray(points) ? points : [points]).map((point: any) => ({
                id: point.id as string,
                score: point.score || 0,
                payload: point.payload as unknown as ConceptPayload,
            }));
        } catch (error) {
            console.warn('[Qdrant] Search failed:', error);
            return [];
        }
    }

    /**
     * Search for similar concepts using RRF fusion of concept_vec and concept_summary_vec (loose matching)
     */
    async searchSimilarConceptsLoose(
        conceptVector: number[],
        summaryVector: number[],
        options: { limit?: number; scoreThreshold?: number } = {}
    ): Promise<Array<{ id: string; score: number; payload: ConceptPayload }>> {
        const limit = options.limit || 10;
        const scoreThreshold = options.scoreThreshold ?? 0.85;

        try {
            const results = await this.client.query(this.collectionName, {
                prefetch: [
                    {
                        query: conceptVector,
                        using: 'concept_vec',
                        limit: limit * 2,
                    },
                    {
                        query: summaryVector,
                        using: 'concept_summary_vec',
                        limit: limit * 2,
                    },
                ],
                query: { fusion: 'rrf' },
                limit,
                score_threshold: scoreThreshold,
                with_payload: true,
                filter: {
                    must: [{ key: 'type', match: { value: 'concept' } }],
                },
            });

            // Type assertion to handle Qdrant client response format
            const queryResults = results as any;
            const points = queryResults.points || queryResults || [];

            return (Array.isArray(points) ? points : [points]).map((point: any) => ({
                id: point.id as string,
                score: point.score || 0,
                payload: point.payload as unknown as ConceptPayload,
            }));
        } catch (error) {
            console.warn('[Qdrant] Query failed:', error);
            return [];
        }
    }

    /**
     * Scroll through all concepts
     */
    async scrollConcepts(options: { limit?: number; offset?: string } = {}
    ): Promise<{ points: Array<{ payload: ConceptPayload }>; nextPage: string | null }> {
        const limit = options.limit || 100;
        const offset = options.offset;

        try {
            const result = await this.client.scroll(this.collectionName, {
                limit,
                offset,
                with_payload: true,
                with_vector: false,
                filter: {
                    must: [{ key: 'type', match: { value: 'concept' } }],
                },
            });

            // Handle scroll result format
            const scrollResult = result as any;
            const points = scrollResult.points || scrollResult || [];

            return {
                points: (Array.isArray(points) ? points : [points]).map((point: any) => ({
                    payload: point.payload as unknown as ConceptPayload,
                })),
                nextPage: (scrollResult.next_page_offset as string | undefined) || null,
            };
        } catch (error) {
            console.warn('[Qdrant] Scroll failed:', error);
            return { points: [], nextPage: null };
        }
    }

    /**
     * Get a single concept by name
     * Returns both payload and point ID (needed for updates)
     */
    async getConcept(concept: string): Promise<{ payload: ConceptPayload; id: string } | null> {
        try {
            const results = await this.client.search(this.collectionName, {
                vector: {
                    name: 'concept_vec',
                    vector: new Array((this.embeddingService?.getDimension() ?? 768)).fill(0), // Placeholder vector (not used for filtering)
                },
                limit: 1,
                with_payload: true,
                with_vector: false,
                filter: {
                    must: [
                        { key: 'type', match: { value: 'concept' } },
                        { key: 'concept', match: { value: concept } },
                    ],
                },
            });

            // Type assertion to handle Qdrant client response format
            const searchResults = results as any;
            const points = searchResults.points || searchResults || [];
            const pointsArray = Array.isArray(points) ? points : [points];

            if (pointsArray.length > 0) {
                return {
                    payload: pointsArray[0].payload as unknown as ConceptPayload,
                    id: pointsArray[0].id as string
                };
            }
            return null;
        } catch (error) {
            console.warn('[Qdrant] Get concept failed:', error);
            return null;
        }
    }

    /**
     * Update concept usage count and last used timestamp
     */
    async updateConceptUsage(concept: string): Promise<void> {
        try {
            const existing = await this.getConcept(concept);
            if (!existing) {
                console.warn(`[Qdrant] Concept not found for update: ${concept}`);
                return;
            }

            // Note: We need to re-embed to update, as Qdrant requires vectors for upsert
            // This is a limitation - in production, you might want to cache vectors
            console.log(`[Qdrant] Concept usage update requires re-embedding: ${concept}`);
            // The caller should handle re-embedding and call upsertConcept directly
        } catch (error) {
            console.error('[Qdrant] Update concept usage failed:', error);
        }
    }

    /**
     * Update concept usage with pre-computed vectors (more efficient)
     */
    async updateConceptUsageWithVectors(
        concept: string,
        conceptVector: number[],
        summaryVector: number[]
    ): Promise<void> {
        try {
            const existing = await this.getConcept(concept);
            if (!existing) {
                console.warn(`[Qdrant] Concept not found for update: ${concept}`);
                return;
            }

            const now = new Date().toISOString();
            await this.client.upsert(this.collectionName, {
                points: [{
                    id: existing.id,  // Use existing point ID
                    vector: {
                        concept_vec: conceptVector,
                        concept_summary_vec: summaryVector,
                    },
                    payload: {
                        ...existing.payload,
                        noteCount: existing.payload.noteCount + 1,
                        lastUsedAt: now,
                    } as ConceptPayload,
                }],
            });
            console.log(`[Qdrant] Updated concept usage: ${concept} (count: ${existing.payload.noteCount + 1})`);
        } catch (error) {
            console.error('[Qdrant] Update concept usage with vectors failed:', error);
        }
    }
}
