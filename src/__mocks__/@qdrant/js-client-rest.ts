/**
 * Mock for @qdrant/js-client-rest
 */
export class QdrantClient {
    constructor(config?: { url?: string }) { }

    async createCollection(name: string, config: any) { }
    async getCollection(name: string) {
        return { config: {}, points_count: 0 };
    }
    async deleteCollection(name: string) { }
    async upsert(collection: string, data: any) { }
    async search(collection: string, data: any) {
        return [];
    }
    async query(collection: string, data: any) {
        return { points: [] };
    }
    async scroll(collection: string, data: any) {
        return { points: [] };
    }
    async delete(collection: string, data: any) { }
}
