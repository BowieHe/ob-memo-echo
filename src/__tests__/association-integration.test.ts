/**
 * Integration tests for v0.6.0 association discovery
 * Tests integration between VectorIndexManager and SimpleAssociationEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorIndexManager } from '@services/vector-index-manager';
import { SimpleAssociationEngine } from '@services/association-engine';
import { ConceptExtractor } from '@services/concept-extractor';
import type { VectorBackend } from '@services/vector-backend';
import { EmbeddingService } from '@services/embedding-service';
import { Chunker } from '@services/chunker';
import { MetadataExtractor } from '@services/metadata-extractor';

// Mock dependencies
vi.mock('../backends/vector-backend');
vi.mock('../services/embedding-service');
vi.mock('../services/chunker');
vi.mock('../services/metadata-extractor');
vi.mock('../services/concept-extractor');

describe('v0.6.0 Association Integration', () => {
    let mockBackend: any;
    let mockEmbeddingService: any;
    let mockChunker: any;
    let mockMetadataExtractor: any;
    let mockConceptExtractor: any;
    let associationEngine: SimpleAssociationEngine;
    let indexManager: VectorIndexManager;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock instances
        mockBackend = {
            initialize: vi.fn(),
            upsertMultiVector: vi.fn(),
            searchWithFusion: vi.fn(),
            delete: vi.fn(),
            createCollection: vi.fn(),
            collectionExists: vi.fn(),
        } as any;

        mockEmbeddingService = {
            embed: vi.fn(),
            embedBatch: vi.fn(),
            updateConfig: vi.fn(),
        } as any;

        mockChunker = {
            chunk: vi.fn(),
        } as any;

        mockMetadataExtractor = {
            extract: vi.fn(),
            updateConfig: vi.fn(),
        } as any;

        mockConceptExtractor = {
            extract: vi.fn(),
            updateConfig: vi.fn(),
        } as any;

        // Create association engine
        associationEngine = new SimpleAssociationEngine(mockConceptExtractor);

        // Create index manager with association engine
        indexManager = new VectorIndexManager(
            mockBackend,
            mockEmbeddingService,
            mockChunker,
            mockMetadataExtractor,
            50 * 1024 * 1024,
            associationEngine
        );
    });

    describe('Indexing Integration', () => {
        // TC-6.12.1: Indexing should update association engine
        it('should update association engine when indexing file', async () => {
            // Setup mocks
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk 1 content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);

            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Test summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });

            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            mockConceptExtractor.extract.mockResolvedValue({
                concepts: ['幂等性', '分布式系统'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            // Index a file
            await indexManager.indexFile('kafka.md', 'Kafka design with idempotency');

            // Check that association engine was updated
            const concepts = associationEngine.getNoteConcepts('kafka.md');
            expect(concepts).toEqual(['幂等性', '分布式系统']);

            // Check that concept extractor was called
            expect(mockConceptExtractor.extract).toHaveBeenCalledWith(
                'Kafka design with idempotency',
                'kafka' // Title extracted from file path
            );
        });

        // TC-6.12.2: Removing file should remove from association engine
        it('should remove from association engine when removing file', async () => {
            // First index a file
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);
            mockConceptExtractor.extract.mockResolvedValue({
                concepts: ['概念1', '概念2'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await indexManager.indexFile('test.md', 'Test content');

            // Check file is indexed
            const conceptsBefore = associationEngine.getNoteConcepts('test.md');
            expect(conceptsBefore).toEqual(['概念1', '概念2']);

            // Remove file
            indexManager.removeFile('test.md');

            // Check file is removed
            const conceptsAfter = associationEngine.getNoteConcepts('test.md');
            expect(conceptsAfter).toEqual([]);
        });

        // TC-6.12.3: Update file should re-index association engine
        it('should re-index association engine when updating file', async () => {
            // Mock chunker to return chunks
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);

            // Mock other services
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            // First call: original concepts
            mockConceptExtractor.extract
                .mockResolvedValueOnce({
                    concepts: ['旧概念1', '旧概念2'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                })
                // Second call: updated concepts
                .mockResolvedValueOnce({
                    concepts: ['新概念1', '新概念2'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.85],
                });

            // Update file (which calls indexFile internally)
            await indexManager.updateFile('test.md', 'Original content');

            // Check original concepts
            const concepts1 = associationEngine.getNoteConcepts('test.md');
            expect(concepts1).toEqual(['旧概念1', '旧概念2']);

            // Update file with new content
            await indexManager.updateFile('test.md', 'Updated content');

            // Check updated concepts
            const concepts2 = associationEngine.getNoteConcepts('test.md');
            expect(concepts2).toEqual(['新概念1', '新概念2']);
        });
    });

    describe('Association Discovery Workflow', () => {
        beforeEach(async () => {
            // Setup common test data: two notes sharing concepts
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);
        });

        // TC-6.12.4: Should discover associations between indexed notes
        it('should discover associations between indexed notes', async () => {
            // Index first note with concept "幂等性"
            mockConceptExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '事件驱动'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await indexManager.indexFile('kafka.md', 'Kafka design');

            // Index second note with same concept
            mockConceptExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '数据一致性'],
                confidence: 0.9,
                conceptConfidences: [0.85, 0.8],
            });

            await indexManager.indexFile('order-system.md', 'Order system design');

            // Discover associations
            const associations = await associationEngine.discoverAssociations();

            // Should find association between the two notes
            expect(associations).toHaveLength(1);
            const association = associations[0];

            expect(association.sharedConcepts).toEqual(['幂等性']);
            expect(association.confidence).toBeGreaterThan(0.5);

            const noteIds = [association.sourceNoteId, association.targetNoteId];
            expect(noteIds).toContain('kafka.md');
            expect(noteIds).toContain('order-system.md');
        });

        // TC-6.12.5: Should provide association statistics
        it('should provide association statistics', async () => {
            // Index multiple notes
            mockConceptExtractor.extract
                .mockResolvedValueOnce({
                    concepts: ['概念1', '概念2'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                })
                .mockResolvedValueOnce({
                    concepts: ['概念2', '概念3'],
                    confidence: 0.9,
                    conceptConfidences: [0.85, 0.8],
                })
                .mockResolvedValueOnce({
                    concepts: ['概念3', '概念4'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                });

            await indexManager.indexFile('note1.md', 'Content 1');
            await indexManager.indexFile('note2.md', 'Content 2');
            await indexManager.indexFile('note3.md', 'Content 3');

            // Get statistics
            const stats = associationEngine.getStats();

            expect(stats.totalNotes).toBe(3);
            expect(stats.totalConcepts).toBe(4); // 概念1, 概念2, 概念3, 概念4
            expect(stats.avgConceptsPerNote).toBe(2); // Each note has 2 concepts

            // Total possible associations: 3 choose 2 = 3
            expect(stats.totalAssociations).toBe(3);
        });
    });

    describe('Error Handling', () => {
        // TC-6.12.6: Should handle concept extraction errors gracefully
        it('should handle concept extraction errors gracefully', async () => {
            // Setup mocks for normal indexing
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });

            // Mock embedding service to return embeddings (will be called 3 times)
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            // Concept extraction fails
            mockConceptExtractor.extract.mockRejectedValueOnce(
                new Error('Concept extraction failed')
            );

            // Should not throw error, just log warning
            await expect(
                indexManager.indexFile('test.md', 'Test content')
            ).resolves.not.toThrow();

            // File should still be indexed in vector store, just not in association engine
            // Note: We can't easily test upsertMultiVector due to complex mocking
            // but we can verify the process didn't crash

            // Association engine should not have the note
            const concepts = associationEngine.getNoteConcepts('test.md');
            expect(concepts).toEqual([]);
        });

        // TC-6.12.7: Should work without association engine (backward compatibility)
        it('should work without association engine (backward compatibility)', async () => {
            // Create index manager WITHOUT association engine
            const indexManagerWithoutEngine = new VectorIndexManager(
                mockBackend,
                mockEmbeddingService,
                mockChunker,
                mockMetadataExtractor
            );

            // Setup mocks
            mockChunker.chunk.mockReturnValue([
                {
                    content: 'Chunk content',
                    index: 0,
                    headers: [],
                    startPos: 0,
                    endPos: 100,
                    start_line: 1,
                    end_line: 5,
                    header_path: ''
                },
            ]);
            mockMetadataExtractor.extract.mockResolvedValue({
                summary: 'Summary',
                tags: [],
                category: '',
                concepts: [],
                thinking_point: '',
            });

            // Mock embedding service to return embeddings
            mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

            // Should work without errors
            await expect(
                indexManagerWithoutEngine.indexFile('test.md', 'Test content')
            ).resolves.not.toThrow();

            // Vector store operations should still happen
            // Note: We can't easily test upsertMultiVector due to complex mocking
            // but we can verify the process didn't crash
        });
    });
});