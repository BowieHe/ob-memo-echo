/**
 * QdrantBackend - Qdrant implementation of VectorBackend
 * v0.5.0: Refactored from vector-store.ts
 * Supports native Named Vectors and RRF fusion
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type {
    VectorBackend,
    MultiVectorItem,
    SearchResult,
    SearchOptions,
} from '../services/vector-backend';
import { generateUUID } from '@utils/uuid';
import { VECTOR_NAMES } from '@core/constants';

export class QdrantBackend implements VectorBackend {
    private client: QdrantClient;
    private collectionName: string;
    private vectorSize: number | null = null;

    constructor(
        collectionName: string = 'obsidian_notes',
        qdrantUrl: string = 'http://localhost:6333'
    ) {
        this.client = new QdrantClient({ url: qdrantUrl });
        this.collectionName = collectionName;
    }

    async initialize(): Promise<void> {
        // No-op, collection created on first upsert
    }

    async upsertMultiVector(item: MultiVectorItem): Promise<void> {
        // Auto-detect dimension from first vector
        if (this.vectorSize === null) {
            this.vectorSize = item.vectors[VECTOR_NAMES.CONTENT].length;
            console.log(`[Qdrant] Auto-detected vector dimension: ${this.vectorSize}`);
            await this.ensureCollection(this.vectorSize!);
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

    /**
     * Ensure collection exists with named vector configuration
     * Creates collection with three named vectors: content_vec, summary_vec, title_vec
     */
    private async ensureCollection(dimension: number): Promise<void> {
        try {
            const collection = await this.client.getCollection(this.collectionName);
            console.log('[Qdrant] Collection exists:', collection.config);
        } catch (error) {
            console.log(`[Qdrant] Creating collection with Named Vectors, dimension ${dimension}`);
            await this.client.createCollection(this.collectionName, {
                vectors: {
                    [VECTOR_NAMES.CONTENT]: { size: dimension, distance: 'Cosine' },
                    [VECTOR_NAMES.SUMMARY]: { size: dimension, distance: 'Cosine' },
                    [VECTOR_NAMES.TITLE]: { size: dimension, distance: 'Cosine' },
                },
            });
            console.log('[Qdrant] Collection created successfully');
        }
    }

    /**
     * Search with Named Vectors fusion using Qdrant's native RRF
     * Qdrant Query API automatically fuses results from multiple vectors
     */
    async searchWithFusion(
        queryVector: number[],
        options: SearchOptions = {}
    ): Promise<SearchResult[]> {
        const limit = options.limit || 10;
        const prefetchLimit = limit * 2;

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

    /**
     * Delete by custom ID (stored in _customId payload field)
     */
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

    /**
     * Delete all vectors for a specific file by filePath
     */
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

    /**
     * Get total count of vectors in collection
     */
    async count(): Promise<number> {
        try {
            const info = await this.client.getCollection(this.collectionName);
            return info.points_count || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Clear all vectors by deleting and recreating the collection
     */
    async clear(): Promise<void> {
        try {
            await this.client.deleteCollection(this.collectionName);
            this.vectorSize = null;
        } catch (error) {
            // Collection might not exist, ignore
        }
    }
}
