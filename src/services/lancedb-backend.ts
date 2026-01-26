/**
 * LanceDBBackend - LanceDB implementation of VectorBackend
 * v0.5.0: Embedded vector database, no server required
 * 
 * Uses three tables to simulate Named Vectors:
 * - content_vectors
 * - summary_vectors
 * - title_vectors
 */

import {
    VectorBackend,
    MultiVectorItem,
    SearchResult,
    SearchOptions,
    VECTOR_NAMES,
    generateUUID,
    rrfFusion,
} from './vector-backend';

// LanceDB types (will be imported from @lancedb/lancedb when installed)
interface LanceTable {
    search(query: number[]): { limit(n: number): { execute(): Promise<any[]> } };
    add(data: any[]): Promise<void>;
    delete(filter: string): Promise<void>;
    countRows(): Promise<number>;
}

interface LanceDB {
    openTable(name: string): Promise<LanceTable>;
    createTable(name: string, data: any[]): Promise<LanceTable>;
    dropTable(name: string): Promise<void>;
    tableNames(): Promise<string[]>;
}

export class LanceDBBackend implements VectorBackend {
    private db: LanceDB | null = null;
    private dbPath: string;
    private tables: {
        content: LanceTable | null;
        summary: LanceTable | null;
        title: LanceTable | null;
    } = { content: null, summary: null, title: null };

    constructor(dbPath: string = '.memo-echo/vectors') {
        this.dbPath = dbPath;
    }

    async initialize(): Promise<void> {
        // Dynamic import to avoid build issues if lancedb not installed
        try {
            // @ts-ignore - dynamic import for optional dependency
            const lancedb = await import('@lancedb/lancedb');
            this.db = await lancedb.connect(this.dbPath);
            console.log('[LanceDB] Connected to:', this.dbPath);

            // Try to open existing tables
            const tableNames = await this.db!.tableNames();
            if (tableNames.includes('content_vectors')) {
                this.tables.content = await this.db!.openTable('content_vectors');
                this.tables.summary = await this.db!.openTable('summary_vectors');
                this.tables.title = await this.db!.openTable('title_vectors');
                console.log('[LanceDB] Opened existing tables');
            }
        } catch (error) {
            console.error('[LanceDB] Failed to initialize:', error);
            throw new Error('LanceDB initialization failed. Please install @lancedb/lancedb');
        }
    }

    async upsertMultiVector(item: MultiVectorItem): Promise<void> {
        if (!this.db) {
            throw new Error('LanceDB not initialized');
        }

        const db = this.db; // Capture for type narrowing

        const uuid = generateUUID();
        const baseRecord = {
            uuid,
            chunk_id: item.id,
            file_path: item.metadata.filePath,
            metadata: JSON.stringify(item.metadata),
        };

        // Create tables if they don't exist
        if (!this.tables.content) {
            this.tables.content = await this.db.createTable('content_vectors', [{
                ...baseRecord,
                vector: item.vectors[VECTOR_NAMES.CONTENT],
            }]);
            this.tables.summary = await this.db.createTable('summary_vectors', [{
                ...baseRecord,
                vector: item.vectors[VECTOR_NAMES.SUMMARY],
            }]);
            this.tables.title = await this.db.createTable('title_vectors', [{
                ...baseRecord,
                vector: item.vectors[VECTOR_NAMES.TITLE],
            }]);
            console.log('[LanceDB] Created tables');
            return;
        }

        // Delete existing entries for this chunk
        await this.delete(item.id);

        // Insert into all three tables
        await this.tables.content.add([{
            ...baseRecord,
            vector: item.vectors[VECTOR_NAMES.CONTENT],
        }]);
        await this.tables.summary!.add([{
            ...baseRecord,
            vector: item.vectors[VECTOR_NAMES.SUMMARY],
        }]);
        await this.tables.title!.add([{
            ...baseRecord,
            vector: item.vectors[VECTOR_NAMES.TITLE],
        }]);
    }

    async searchWithFusion(
        queryVector: number[],
        options: SearchOptions = {}
    ): Promise<SearchResult[]> {
        if (!this.tables.content || !this.tables.summary || !this.tables.title) {
            return [];
        }

        const limit = options.limit || 10;
        const prefetchLimit = limit * 2;

        // Search all three tables in parallel
        const [contentResults, summaryResults, titleResults] = await Promise.all([
            this.tables.content.search(queryVector).limit(prefetchLimit).execute(),
            this.tables.summary.search(queryVector).limit(prefetchLimit).execute(),
            this.tables.title.search(queryVector).limit(prefetchLimit).execute(),
        ]);

        // Transform results to common format
        const transformResults = (results: any[]): SearchResult[] =>
            results.map(r => ({
                id: r.chunk_id,
                score: r._distance ? 1 - r._distance : 0, // Convert distance to similarity
                metadata: JSON.parse(r.metadata),
            }));

        // Apply RRF fusion
        return rrfFusion(
            [
                transformResults(contentResults),
                transformResults(summaryResults),
                transformResults(titleResults),
            ],
            limit
        );
    }

    async delete(id: string): Promise<void> {
        if (!this.tables.content) return;

        const filter = `chunk_id = '${id}'`;
        await Promise.all([
            this.tables.content.delete(filter),
            this.tables.summary?.delete(filter),
            this.tables.title?.delete(filter),
        ]);
    }

    async deleteByFilePath(filePath: string): Promise<void> {
        if (!this.tables.content) return;

        const filter = `file_path = '${filePath}'`;
        await Promise.all([
            this.tables.content.delete(filter),
            this.tables.summary?.delete(filter),
            this.tables.title?.delete(filter),
        ]);
    }

    async count(): Promise<number> {
        if (!this.tables.content) return 0;
        return await this.tables.content.countRows();
    }

    async clear(): Promise<void> {
        if (!this.db) return;

        try {
            await this.db.dropTable('content_vectors');
            await this.db.dropTable('summary_vectors');
            await this.db.dropTable('title_vectors');
            this.tables = { content: null, summary: null, title: null };
            console.log('[LanceDB] Cleared all tables');
        } catch (error) {
            // Tables might not exist
        }
    }
}
