/**
 * Unit tests for SimpleAssociationEngine v0.6.0
 * Tests association discovery based on shared concepts
 */

import { SimpleAssociationEngine, NoteAssociation, AssociationConfig } from '../services/association-engine';
import { ConceptExtractor } from '../services/concept-extractor';

// Mock ConceptExtractor
jest.mock('../services/concept-extractor');

describe('SimpleAssociationEngine v0.6.0', () => {
    let engine: SimpleAssociationEngine;
    let mockExtractor: jest.Mocked<ConceptExtractor>;

    beforeEach(() => {
        // Create mock extractor
        mockExtractor = {
            extract: jest.fn(),
            updateConfig: jest.fn(),
        } as any;

        // Create engine with mock extractor
        engine = new SimpleAssociationEngine(mockExtractor);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Configuration', () => {
        // TC-6.7.1: Should accept custom configuration
        it('should accept custom configuration', () => {
            const customConfig: Partial<AssociationConfig> = {
                minSharedConcepts: 2,
                minConfidence: 0.7,
                maxAssociations: 10,
                excludeSelfAssociations: false,
            };

            engine = new SimpleAssociationEngine(mockExtractor, customConfig);
            const config = engine.getConfig();

            expect(config.minSharedConcepts).toBe(2);
            expect(config.minConfidence).toBe(0.7);
            expect(config.maxAssociations).toBe(10);
            expect(config.excludeSelfAssociations).toBe(false);
        });

        // TC-6.7.2: Should have sensible defaults
        it('should have sensible defaults', () => {
            const config = engine.getConfig();

            expect(config.minSharedConcepts).toBe(1);
            expect(config.minConfidence).toBe(0.5);
            expect(config.maxAssociations).toBe(20);
            expect(config.excludeSelfAssociations).toBe(true);
        });

        // TC-6.7.3: Should update configuration dynamically
        it('should update configuration dynamically', () => {
            engine.updateConfig({ minSharedConcepts: 3 });
            const config = engine.getConfig();

            expect(config.minSharedConcepts).toBe(3);
            // Other values should remain unchanged
            expect(config.minConfidence).toBe(0.5);
            expect(config.maxAssociations).toBe(20);
        });
    });

    describe('Note Indexing', () => {
        // TC-6.8.1: Should index note with concepts
        it('should index note with concepts', async () => {
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '事件驱动'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            const result = await engine.indexNote(
                'note1.md',
                'Kafka design with idempotency',
                'Kafka Design'
            );

            expect(result.indexed).toBe(true);
            expect(result.concepts).toEqual(['幂等性', '事件驱动']);
            expect(mockExtractor.extract).toHaveBeenCalledWith(
                'Kafka design with idempotency',
                'Kafka Design'
            );
        });

        // TC-6.8.2: Should handle note with no concepts
        it('should handle note with no concepts', async () => {
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: [],
                confidence: 0,
                conceptConfidences: [],
            });

            const result = await engine.indexNote('note2.md', 'Empty content');

            expect(result.indexed).toBe(false);
            expect(result.concepts).toEqual([]);
        });

        // TC-6.8.3: Should remove note from index
        it('should remove note from index', async () => {
            // First index a note
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['概念1', '概念2'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await engine.indexNote('note3.md', 'Content with concepts');

            // Check note is indexed
            const conceptsBefore = engine.getNoteConcepts('note3.md');
            expect(conceptsBefore).toEqual(['概念1', '概念2']);

            // Remove note
            engine.removeNote('note3.md');

            // Check note is removed
            const conceptsAfter = engine.getNoteConcepts('note3.md');
            expect(conceptsAfter).toEqual([]);
        });

        // TC-6.8.4: Should update concept index when indexing multiple notes
        it('should update concept index when indexing multiple notes', async () => {
            // Index first note with concept "幂等性"
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '分布式系统'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await engine.indexNote('kafka.md', 'Kafka with idempotency', 'Kafka');

            // Index second note with same concept
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '数据一致性'],
                confidence: 0.9,
                conceptConfidences: [0.85, 0.8],
            });

            await engine.indexNote('order-system.md', 'Order system idempotency', 'Order System');

            // Check concept index
            const notesForConcept = engine.getNotesForConcept('幂等性');
            expect(notesForConcept).toContain('kafka.md');
            expect(notesForConcept).toContain('order-system.md');
            expect(notesForConcept).toHaveLength(2);
        });
    });

    describe('Association Discovery', () => {
        beforeEach(async () => {
            // Set up test data: 3 notes with overlapping concepts
            mockExtractor.extract
                // Note 1: Kafka (幂等性, 事件驱动)
                .mockResolvedValueOnce({
                    concepts: ['幂等性', '事件驱动'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                })
                // Note 2: Order System (幂等性, 数据一致性)
                .mockResolvedValueOnce({
                    concepts: ['幂等性', '数据一致性'],
                    confidence: 0.9,
                    conceptConfidences: [0.85, 0.8],
                })
                // Note 3: Microservices (服务发现, 负载均衡)
                .mockResolvedValueOnce({
                    concepts: ['服务发现', '负载均衡'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                });

            // Index all notes
            await engine.indexNote('kafka.md', 'Kafka content', 'Kafka Design');
            await engine.indexNote('order-system.md', 'Order system content', 'Order System');
            await engine.indexNote('microservices.md', 'Microservices content', 'Microservices');
        });

        // TC-6.9.1: Should discover associations based on shared concepts
        it('should discover associations based on shared concepts', async () => {
            const associations = await engine.discoverAssociations();

            // Should find association between Kafka and Order System (shared: 幂等性)
            expect(associations).toHaveLength(1);
            
            const association = associations[0];
            expect(association.sharedConcepts).toEqual(['幂等性']);
            expect(association.confidence).toBeGreaterThan(0.5);
            
            // Should include both notes (order doesn't matter)
            const noteIds = [association.sourceNoteId, association.targetNoteId];
            expect(noteIds).toContain('kafka.md');
            expect(noteIds).toContain('order-system.md');
        });

        // TC-6.9.2: Should respect minSharedConcepts configuration
        it('should respect minSharedConcepts configuration', async () => {
            // Update config to require 2 shared concepts
            engine.updateConfig({ minSharedConcepts: 2 });
            
            const associations = await engine.discoverAssociations();
            
            // No notes share 2 concepts, so should return empty
            expect(associations).toHaveLength(0);
        });

        // TC-6.9.3: Should respect minConfidence configuration
        it('should respect minConfidence configuration', async () => {
            // Update config to require confidence higher than possible
            engine.updateConfig({ minConfidence: 1.1 }); // Higher than max possible 1.0
            
            const associations = await engine.discoverAssociations();
            
            // Confidence is 1.0, which is less than 1.1, so should return empty
            expect(associations).toHaveLength(0);
        });

        // TC-6.9.4: Should discover associations for specific note
        it('should discover associations for specific note', async () => {
            const associations = await engine.discoverAssociationsForNote('kafka.md');
            
            expect(associations).toHaveLength(1);
            const association = associations[0];
            
            // Should involve kafka.md
            expect([association.sourceNoteId, association.targetNoteId]).toContain('kafka.md');
            // Should be associated with order-system.md (shared concept: 幂等性)
            const otherNote = association.sourceNoteId === 'kafka.md' 
                ? association.targetNoteId 
                : association.sourceNoteId;
            expect(otherNote).toBe('order-system.md');
        });

        // TC-6.9.5: Should not create self-associations by default
        it('should not create self-associations by default', async () => {
            // Index another note with same concepts as existing note
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['幂等性', '事件驱动'], // Same as kafka.md
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await engine.indexNote('kafka2.md', 'Another Kafka note', 'Kafka 2');
            
            const associations = await engine.discoverAssociations();
            
            // Should find associations between different notes, not self-associations
            for (const assoc of associations) {
                expect(assoc.sourceNoteId).not.toBe(assoc.targetNoteId);
            }
        });

        // TC-6.9.6: Should sort associations by quality
        it('should sort associations by quality', async () => {
            // Add more test data with varying quality
            mockExtractor.extract
                // Note with single shared concept (lower quality)
                .mockResolvedValueOnce({
                    concepts: ['幂等性'], // Only shares 1 concept with kafka.md
                    confidence: 0.9,
                    conceptConfidences: [0.8],
                })
                // Note with multiple shared concepts (higher quality)
                .mockResolvedValueOnce({
                    concepts: ['幂等性', '事件驱动'], // Shares 2 concepts with kafka.md
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.85],
                });

            await engine.indexNote('note-single.md', 'Single concept note');
            await engine.indexNote('note-multiple.md', 'Multiple concepts note');
            
            const associations = await engine.discoverAssociations();
            
            // Should have multiple associations
            expect(associations.length).toBeGreaterThan(1);
            
            // Check sorting: associations with more shared concepts should come first
            for (let i = 0; i < associations.length - 1; i++) {
                const current = associations[i];
                const next = associations[i + 1];
                
                // Either more shared concepts, or same number but higher confidence
                expect(
                    current.sharedConcepts.length > next.sharedConcepts.length ||
                    (current.sharedConcepts.length === next.sharedConcepts.length &&
                     current.confidence >= next.confidence)
                ).toBe(true);
            }
        });
    });

    describe('Statistics and Utilities', () => {
        beforeEach(async () => {
            // Set up some test data
            mockExtractor.extract
                .mockResolvedValueOnce({
                    concepts: ['概念1', '概念2'],
                    confidence: 0.9,
                    conceptConfidences: [0.9, 0.8],
                })
                .mockResolvedValueOnce({
                    concepts: ['概念2', '概念3'],
                    confidence: 0.9,
                    conceptConfidences: [0.85, 0.8],
                });

            await engine.indexNote('note1.md', 'Content 1');
            await engine.indexNote('note2.md', 'Content 2');
        });

        // TC-6.10.1: Should provide accurate statistics
        it('should provide accurate statistics', () => {
            const stats = engine.getStats();

            expect(stats.totalNotes).toBe(2);
            expect(stats.totalConcepts).toBe(3); // 概念1, 概念2, 概念3
            expect(stats.avgConceptsPerNote).toBe(2); // Each note has 2 concepts
            expect(stats.avgNotesPerConcept).toBeCloseTo(4/3); // concept1:1, concept2:2, concept3:1 = 4/3
            
            // Total possible associations: 2 choose 2 = 1
            expect(stats.totalAssociations).toBe(1);
        });

        // TC-6.10.2: Should clear index
        it('should clear index', () => {
            // Check index has data
            const statsBefore = engine.getStats();
            expect(statsBefore.totalNotes).toBe(2);

            // Clear index
            engine.clearIndex();

            // Check index is empty
            const statsAfter = engine.getStats();
            expect(statsAfter.totalNotes).toBe(0);
            expect(statsAfter.totalConcepts).toBe(0);
        });

        // TC-6.10.3: Should export concept index
        it('should export concept index', () => {
            const conceptIndex = engine.exportConceptIndex();

            expect(conceptIndex).toHaveLength(3); // 3 concepts
            expect(conceptIndex.map(entry => entry.concept)).toEqual(
                expect.arrayContaining(['概念1', '概念2', '概念3'])
            );

            // Check concept2 has 2 notes
            const concept2Entry = conceptIndex.find(entry => entry.concept === '概念2');
            expect(concept2Entry?.noteIds).toHaveLength(2);
            expect(concept2Entry?.avgConfidence).toBeGreaterThan(0.8);
        });
    });

    describe('Edge Cases', () => {
        // TC-6.11.1: Should handle empty index
        it('should handle empty index', async () => {
            const associations = await engine.discoverAssociations();
            expect(associations).toEqual([]);

            const stats = engine.getStats();
            expect(stats.totalNotes).toBe(0);
            expect(stats.totalConcepts).toBe(0);
        });

        // TC-6.11.2: Should handle single note index
        it('should handle single note index', async () => {
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['概念1', '概念2'],
                confidence: 0.9,
                conceptConfidences: [0.9, 0.8],
            });

            await engine.indexNote('single-note.md', 'Content');

            const associations = await engine.discoverAssociations();
            expect(associations).toEqual([]); // No associations with only one note

            const stats = engine.getStats();
            expect(stats.totalNotes).toBe(1);
            expect(stats.totalAssociations).toBe(0); // 1 choose 2 = 0
        });

        // TC-6.11.3: Should handle duplicate concepts in same note
        it('should handle duplicate concepts in same note', async () => {
            // Note: ConceptExtractor should normalize and deduplicate, but test edge case
            mockExtractor.extract.mockResolvedValueOnce({
                concepts: ['概念1', '概念1', '概念2'], // Duplicate concept1
                confidence: 0.9,
                conceptConfidences: [0.9, 0.9, 0.8], // Same confidence for duplicates
            });

            await engine.indexNote('duplicate-note.md', 'Content with duplicates');

            const concepts = engine.getNoteConcepts('duplicate-note.md');
            // Engine should handle duplicates gracefully
            expect(concepts).toBeDefined();
        });
    });
});