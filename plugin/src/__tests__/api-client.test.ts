/**
 * Unit tests for RustApiClient
 * Following TDD: Write tests first, then implement
 */

import { RustApiClient } from '../api-client';

// Mock fetch globally
global.fetch = jest.fn();

describe('RustApiClient', () => {
    let client: RustApiClient;
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
        client = new RustApiClient('http://localhost:37337');
        mockFetch.mockClear();
    });

    describe('health()', () => {
        it('should return health status when service is available', async () => {
            const mockResponse = {
                status: 'ok',
                version: '0.1.0',
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.health();

            expect(mockFetch).toHaveBeenCalledWith('http://localhost:37337/api/health');
            expect(result).toEqual(mockResponse);
        });

        it('should throw error when service is unavailable', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Service Unavailable',
            } as Response);

            await expect(client.health()).rejects.toThrow('Health check failed: Service Unavailable');
        });

        it('should throw error on network failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(client.health()).rejects.toThrow('Network error');
        });
    });

    describe('search()', () => {
        it('should return search results successfully', async () => {
            const mockRequest = {
                query: 'Rust programming',
                limit: 10,
            };

            const mockResponse = {
                success: true,
                count: 2,
                results: [
                    {
                        path: '/notes/rust.md',
                        content: '# Rust\n\nRust is a systems programming language.',
                        point_type: 'text',
                        score: 0.92,
                    },
                    {
                        path: '/notes/programming.md',
                        content: 'Programming languages comparison',
                        point_type: 'text',
                        score: 0.85,
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.search(mockRequest);

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:37337/api/search',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mockRequest),
                })
            );
            expect(result).toEqual(mockResponse);
        });

        it('should handle search with point_type filter', async () => {
            const mockRequest = {
                query: 'Paris',
                limit: 5,
                point_type: 'image' as const,
            };

            const mockResponse = {
                success: true,
                count: 1,
                results: [
                    {
                        path: '/images/paris.jpg',
                        content: 'Eiffel Tower in Paris',
                        point_type: 'image',
                        score: 0.88,
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.search(mockRequest);

            expect(result.results[0].point_type).toBe('image');
        });

        it('should throw error when search fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error',
            } as Response);

            await expect(
                client.search({ query: 'test', limit: 10 })
            ).rejects.toThrow('Search failed: Internal Server Error');
        });

        it('should handle empty results', async () => {
            const mockResponse = {
                success: true,
                count: 0,
                results: [],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.search({ query: 'nonexistent', limit: 10 });

            expect(result.count).toBe(0);
            expect(result.results).toHaveLength(0);
        });
    });

    describe('index()', () => {
        it('should index a document successfully', async () => {
            const mockRequest = {
                path: '/notes/test.md',
                content: '# Test\n\nTest content',
                point_type: 'text' as const,
            };

            const mockResponse = {
                success: true,
                message: 'Indexed 1 text chunks and 0 images',
                text_count: 1,
                image_count: 0,
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.index(mockRequest);

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:37337/api/index',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mockRequest),
                })
            );
            expect(result).toEqual(mockResponse);
        });

        it('should throw error when indexing fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Bad Request',
            } as Response);

            await expect(
                client.index({
                    path: '/test.md',
                    content: 'test',
                    point_type: 'text',
                })
            ).rejects.toThrow('Index failed: Bad Request');
        });
    });

    describe('isAvailable()', () => {
        it('should return true when service is available', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', version: '0.1.0' }),
            } as Response);

            const result = await client.isAvailable();

            expect(result).toBe(true);
        });

        it('should return false when service is unavailable', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Service Unavailable',
            } as Response);

            const result = await client.isAvailable();

            expect(result).toBe(false);
        });

        it('should return false on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await client.isAvailable();

            expect(result).toBe(false);
        });
    });

    describe('Custom base URL', () => {
        it('should use custom base URL', async () => {
            const customClient = new RustApiClient('http://custom:8080');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', version: '0.1.0' }),
            } as Response);

            await customClient.health();

            expect(mockFetch).toHaveBeenCalledWith('http://custom:8080/api/health');
        });
    });

    describe('SearchResult with block-level navigation', () => {
        it('should handle results with line_number', async () => {
            const mockResponse = {
                success: true,
                count: 1,
                results: [
                    {
                        path: '/notes/rust.md',
                        content: 'Memory safety features',
                        point_type: 'text',
                        score: 0.92,
                        line_number: 42,
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.search({ query: 'memory safety', limit: 10 });

            expect(result.results[0].line_number).toBe(42);
        });

        it('should handle results with block_id', async () => {
            const mockResponse = {
                success: true,
                count: 1,
                results: [
                    {
                        path: '/notes/rust.md',
                        content: 'Memory safety features',
                        point_type: 'text',
                        score: 0.92,
                        block_id: 'block-abc123',
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            } as Response);

            const result = await client.search({ query: 'memory safety', limit: 10 });

            expect(result.results[0].block_id).toBe('block-abc123');
        });
    });
});
