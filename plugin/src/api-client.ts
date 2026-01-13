/**
 * API Client for communicating with the Rust backend
 */

export interface IndexRequest {
    path: string;
    content: string;
    point_type: 'text' | 'image';
}

export interface IndexResponse {
    success: boolean;
    message?: string;
    text_count?: number;
    image_count?: number;
}

export interface SearchRequest {
    query: string;
    limit?: number;
    point_type?: 'text' | 'image';
}

export interface SearchResult {
    path: string;
    content: string;
    point_type: 'text' | 'image';
    score: number;
    line_number?: number;  // Optional: for block-level navigation
    block_id?: string;     // Optional: for block-level navigation
}

export interface SearchResponse {
    success: boolean;
    count: number;
    results: SearchResult[];
}

export interface HealthResponse {
    status: string;
    version: string;
}

export interface StatsResponse {
    success: boolean;
    total_points: number;
    collection_name: string;
}

export interface ClearResponse {
    success: boolean;
    message: string;
}

export class RustApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://localhost:37337') {
        this.baseUrl = baseUrl;
    }

    /**
     * Check if the Rust service is running
     */
    async health(): Promise<HealthResponse> {
        const response = await fetch(`${this.baseUrl}/api/health`);
        if (!response.ok) {
            throw new Error(`Health check failed: ${response.statusText}`);
        }
        return response.json();
    }

    /**
     * Index a document
     */
    async index(request: IndexRequest): Promise<IndexResponse> {
        const response = await fetch(`${this.baseUrl}/api/index`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`Index failed: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Search for documents
     */
    async search(request: SearchRequest): Promise<SearchResponse> {
        const response = await fetch(`${this.baseUrl}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Check if the service is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            await this.health();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get database statistics
     */
    async getStats(): Promise<StatsResponse> {
        const response = await fetch(`${this.baseUrl}/api/stats`);
        if (!response.ok) {
            throw new Error(`Get stats failed: ${response.statusText}`);
        }
        return response.json();
    }

    /**
     * Clear all data from database
     */
    async clearDatabase(): Promise<ClearResponse> {
        const response = await fetch(`${this.baseUrl}/api/clear`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(`Clear database failed: ${response.statusText}`);
        }
        return response.json();
    }
}
