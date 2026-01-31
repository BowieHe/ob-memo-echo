/**
 * Unit tests for EmbeddingService
 * Tests multiple embedding providers: local, Ollama, OpenAI
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingService, EmbeddingProvider } from '@services/embedding-service';

vi.mock('@xenova/transformers', () => ({
    pipeline: vi.fn().mockResolvedValue(async () => ({
        data: Float32Array.from([0.1, 0.2, 0.3, 0.4]),
    })),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('EmbeddingService', () => {
    let service: EmbeddingService;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Local Provider (Transformers.js)', () => {
        beforeEach(() => {
            service = new EmbeddingService({
                provider: 'local',
            });
        });

        it('should initialize without errors', () => {
            expect(service).toBeDefined();
        });

        it('should generate embeddings for text', async () => {
            // Note: This will be a slow test on first run (downloads model)
            // In CI, we'll mock the transformers library
            const text = 'Hello world';
            const embedding = await service.embed(text);

            expect(embedding).toBeDefined();
            expect(Array.isArray(embedding)).toBe(true);
            expect(embedding.length).toBeGreaterThan(0);
            expect(typeof embedding[0]).toBe('number');
        }, 30000); // 30s timeout for model download

        it('should generate consistent embeddings', async () => {
            const text = 'Test text';
            const embedding1 = await service.embed(text);
            const embedding2 = await service.embed(text);

            expect(embedding1.length).toBe(embedding2.length);
            // Embeddings should be very similar (not exact due to floating point)
            const similarity = cosineSimilarity(embedding1, embedding2);
            expect(similarity).toBeGreaterThan(0.99);
        }, 30000);

        it('should handle empty text', async () => {
            const embedding = await service.embed('');
            expect(embedding).toBeDefined();
            expect(Array.isArray(embedding)).toBe(true);
        });
    });

    describe('Ollama Provider', () => {
        beforeEach(() => {
            service = new EmbeddingService({
                provider: 'ollama',
                ollamaUrl: 'http://localhost:11434',
                ollamaModel: 'nomic-embed-text',
            });
        });

        it('should call Ollama API correctly', async () => {
            const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: mockEmbedding }),
            });

            const text = 'Test text';
            const embedding = await service.embed(text);

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:11434/api/embed',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'nomic-embed-text',
                        input: text,
                    }),
                })
            );

            expect(embedding).toEqual(mockEmbedding);
        });

        it('should handle Ollama errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Connection refused')
            );

            await expect(service.embed('test')).rejects.toThrow();
        });

        it('should handle non-OK responses', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                statusText: 'Model not found',
            });

            await expect(service.embed('test')).rejects.toThrow('Model not found');
        });
    });

    describe('OpenAI Provider', () => {
        beforeEach(() => {
            service = new EmbeddingService({
                provider: 'openai',
                openaiApiKey: 'sk-test-key',
                openaiModel: 'text-embedding-3-small',
            });
        });

        it('should call OpenAI API correctly', async () => {
            const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [{ embedding: mockEmbedding }],
                }),
            });

            const text = 'Test text';
            const embedding = await service.embed(text);

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/embeddings',
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer sk-test-key',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'text-embedding-3-small',
                        input: text,
                    }),
                })
            );

            expect(embedding).toEqual(mockEmbedding);
        });

        it('should handle OpenAI errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Network error')
            );

            await expect(service.embed('test')).rejects.toThrow();
        });

        it('should handle rate limiting', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
            });

            await expect(service.embed('test')).rejects.toThrow();
        });
    });

    describe('Provider Switching', () => {
        it('should switch providers dynamically', async () => {
            service = new EmbeddingService({ provider: 'local' });

            // Switch to Ollama
            service.updateConfig({
                provider: 'ollama',
                ollamaUrl: 'http://localhost:11434',
            });

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ embedding: [1, 2, 3] }),
            });

            await service.embed('test');
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('Batch Embeddings', () => {
        beforeEach(() => {
            service = new EmbeddingService({ provider: 'ollama' });
        });

        it('should generate embeddings for multiple texts', async () => {
            const texts = ['text1', 'text2', 'text3'];

            (global.fetch as any).mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: async () => ({ embedding: [1, 2, 3] }),
                })
            );

            const embeddings = await service.embedBatch(texts);

            expect(embeddings).toHaveLength(3);
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });

        //         it('should handle partial failures in batch', async () => {
        //             const texts = ['text1', 'text2', 'text3'];
        // 
        //             (global.fetch as any)
        //                 .mockResolvedValueOnce({
        //                     ok: true,
        //                     json: async () => ({ embedding: [1, 2, 3] }),
        //                 })
        //                 .mockRejectedValueOnce(new Error('Failed'))
        //                 .mockResolvedValueOnce({
        //                     ok: true,
        //                     json: async () => ({ embedding: [4, 5, 6] }),
        //                 });
        // 
        //             const result = await service.embedBatch(texts, { continueOnError: true });
        // 
        //             expect(result.successful).toHaveLength(2);
        //             expect(result.failed).toHaveLength(1);
        //         });
    });
});

// Helper function for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
