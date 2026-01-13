/**
 * VectorStore - Vector storage and similarity search using Qdrant
 * Auto-detects vector dimension from first insert
 */

import { QdrantClient } from '@qdrant/js-client-rest';

// Simple UUID v4 generator
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export interface VectorItem {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}

export interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}

export class VectorStore {
    private client: QdrantClient;
    private collectionName: string;
    private vectorSize: number | null = null; // Auto-detect
    private isInitialized = false;

    constructor(
        collectionName: string = 'obsidian_notes',
        qdrantUrl: string = 'http://localhost:6333'
    ) {
        this.client = new QdrantClient({ url: qdrantUrl });
        this.collectionName = collectionName;
    }

    /**
     * Insert or update a single vector
     */
    async upsert(item: VectorItem): Promise<void> {
        // Auto-detect dimension from first vector
        if (this.vectorSize === null) {
            this.vectorSize = item.vector.length;
            console.log(`Auto-detected vector dimension: ${this.vectorSize}`);

            // Ensure collection exists with correct dimension
            await this.ensureCollection(this.vectorSize);
        }

        // Validate dimension
        if (item.vector.length !== this.vectorSize) {
            throw new Error(
                `Vector dimension mismatch: expected ${this.vectorSize}, got ${item.vector.length}`
            );
        }

        const uuid = generateUUID();

        await this.client.upsert(this.collectionName, {
            points: [
                {
                    id: uuid,
                    vector: item.vector,
                    payload: {
                        ...item.metadata,
                        _customId: item.id,
                    },
                },
            ],
        });
    }

    /**
     * Ensure collection exists with correct dimension
     */
    private async ensureCollection(dimension: number): Promise<void> {
        try {
            const collection = await this.client.getCollection(this.collectionName);
            console.log('Collection exists:', collection.config);
        } catch (error) {
            // Collection doesn't exist, create it
            console.log(`Creating collection with dimension ${dimension}`);
            await this.client.createCollection(this.collectionName, {
                vectors: {
                    size: dimension,
                    distance: 'Cosine',
                },
            });
            console.log('Collection created successfully');
        }
    }

    /**
     * Insert or update multiple vectors in batch
     */
    async upsertBatch(items: VectorItem[]): Promise<void> {
        if (items.length === 0) return;

        // Auto-detect from first item
        if (this.vectorSize === null) {
            this.vectorSize = items[0].vector.length;
            await this.ensureCollection(this.vectorSize);
        }

        const points = items.map(item => ({
            id: generateUUID(),
            vector: item.vector,
            payload: {
                ...item.metadata,
                _customId: item.id,
            },
        }));

        await this.client.upsert(this.collectionName, { points });
    }

    /**
     * Get a vector by ID
     */
    async get(id: string): Promise<VectorItem | null> {
        const results = await this.client.scroll(this.collectionName, {
            filter: {
                must: [
                    {
                        key: '_customId',
                        match: { value: id },
                    },
                ],
            },
            limit: 1,
            with_payload: true,
            with_vector: true,
        });

        if (results.points.length === 0) return null;

        const point = results.points[0];
        const payload = point.payload as any;
        const { _customId, ...metadata } = payload;

        return {
            id: _customId,
            vector: point.vector as number[],
            metadata,
        };
    }

    /**
     * Search for similar vectors
     */
    async search(queryVector: number[], limit: number = 10): Promise<SearchResult[]> {
        const results = await this.client.search(this.collectionName, {
            vector: queryVector,
            limit,
            with_payload: true,
        });

        return results.map(result => {
            const payload = result.payload as any;
            const { _customId, ...metadata } = payload;

            return {
                id: _customId,
                score: result.score,
                metadata,
            };
        });
    }

    /**
     * Delete a single vector
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
     * Delete multiple vectors
     */
    async deleteBatch(ids: string[]): Promise<void> {
        for (const id of ids) {
            await this.delete(id);
        }
    }

    /**
     * Clear all vectors
     */
    async clear(): Promise<void> {
        try {
            await this.client.deleteCollection(this.collectionName);
            this.vectorSize = null; // Reset dimension
        } catch (error) {
            // Collection might not exist, ignore
        }
    }

    /**
     * Get total count of vectors
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
     * List all items (with pagination)
     */
    async listAll(limit: number = 100): Promise<VectorItem[]> {
        const result = await this.client.scroll(this.collectionName, {
            limit,
            with_payload: true,
            with_vector: true,
        });

        return result.points.map(point => {
            const payload = point.payload as any;
            const { _customId, ...metadata } = payload;

            return {
                id: _customId,
                vector: point.vector as number[],
                metadata,
            };
        });
    }

    /**
     * Initialize (for backwards compatibility)
     */
    async initialize(): Promise<void> {
        // No-op, collection created on first upsert
        this.isInitialized = true;
    }
}
