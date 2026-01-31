/**
 * AssociationEngine - Discover associations between notes based on shared concepts
 * v0.6.0: Simple association discovery based on shared abstract concepts
 */

import { TFile } from 'obsidian';
import type { NoteAssociation, AssociationConfig, ConceptIndexEntry } from '@core/types/association';
import { ConceptExtractor, type ExtractedConcepts } from './concept-extractor';
import { extractWikilinkConcepts } from '@utils/wikilink-utils';
import { ASSOCIATION_CONFIDENCE } from '@core/constants';

export type { NoteAssociation, AssociationConfig, ConceptIndexEntry };

/**
 * Default configuration for association discovery
 */
export const DEFAULT_ASSOCIATION_CONFIG: AssociationConfig = {
    minSharedConcepts: 1,          // At least 1 shared concept
    minConfidence: 0.5,            // Minimum 50% confidence
    maxAssociations: 20,           // Return top 20 associations
    excludeSelfAssociations: true, // Don't associate note with itself
};

/**
 * Simple association engine for discovering note associations
 * based on shared abstract concepts
 */
export class SimpleAssociationEngine {
    private config: AssociationConfig;
    private conceptExtractor: ConceptExtractor;
    private conceptIndex: Map<string, ConceptIndexEntry> = new Map();
    private noteConcepts: Map<string, string[]> = new Map(); // noteId -> concepts[]
    private noteConfidences: Map<string, number[]> = new Map(); // noteId -> confidences[]

    constructor(
        conceptExtractor: ConceptExtractor,
        config: Partial<AssociationConfig> = {}
    ) {
        this.conceptExtractor = conceptExtractor;
        this.config = { ...DEFAULT_ASSOCIATION_CONFIG, ...config };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<AssociationConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): AssociationConfig {
        return { ...this.config };
    }

    /**
     * Index a note's concepts for association discovery
     */
    async indexNote(
        noteId: string,
        content: string,
        title?: string
    ): Promise<{ indexed: boolean; concepts: string[] }> {
        try {
            // Extract concepts from note content
            const extraction = await this.conceptExtractor.extract(content, title);

            const extractedConcepts = extraction.concepts || [];
            const extractedConfidences = extraction.conceptConfidences || extractedConcepts.map(() => 0.7);
            const linkedConcepts = extractWikilinkConcepts(content);

            const conceptConfidenceMap = new Map<string, number>();

            for (let i = 0; i < extractedConcepts.length; i++) {
                conceptConfidenceMap.set(extractedConcepts[i], extractedConfidences[i] ?? 0.7);
            }

            for (const concept of linkedConcepts) {
                const existing = conceptConfidenceMap.get(concept) ?? 0;
                if (ASSOCIATION_CONFIDENCE.linked > existing) {
                    conceptConfidenceMap.set(concept, ASSOCIATION_CONFIDENCE.linked);
                }
            }

            const concepts = Array.from(conceptConfidenceMap.keys());
            const confidences = concepts.map((concept) => conceptConfidenceMap.get(concept) ?? 0.7);

            if (concepts.length === 0) {
                return { indexed: false, concepts: [] };
            }

            this.updateNoteIndex(noteId, concepts, confidences);
            return { indexed: true, concepts };
        } catch (error) {
            console.error(`Failed to index note ${noteId}:`, error);
            return { indexed: false, concepts: [] };
        }
    }

    indexNoteConcepts(noteId: string, concepts: string[], confidences?: number[]): { indexed: boolean; concepts: string[] } {
        if (!concepts || concepts.length === 0) {
            return { indexed: false, concepts: [] };
        }

        const safeConfidences = confidences && confidences.length === concepts.length
            ? confidences
            : concepts.map(() => 0.75);

        this.updateNoteIndex(noteId, concepts, safeConfidences, true);
        return { indexed: true, concepts };
    }

    /**
     * Remove a note from the index
     */
    removeNote(noteId: string): void {
        const concepts = this.noteConcepts.get(noteId) || [];

        // Remove from note mappings
        this.noteConcepts.delete(noteId);
        this.noteConfidences.delete(noteId);

        // Remove from concept index
        for (const concept of concepts) {
            const entry = this.conceptIndex.get(concept);
            if (entry) {
                const index = entry.noteIds.indexOf(noteId);
                if (index !== -1) {
                    entry.noteIds.splice(index, 1);

                    if (entry.noteIds.length === 0) {
                        this.conceptIndex.delete(concept);
                    } else {
                        // Recalculate average confidence
                        const confidences = entry.noteIds.map(id => {
                            const noteConcepts = this.noteConcepts.get(id) || [];
                            const noteConfidences = this.noteConfidences.get(id) || [];
                            const conceptIndex = noteConcepts.indexOf(concept);
                            return conceptIndex !== -1 ? noteConfidences[conceptIndex] : 0;
                        }).filter(c => c > 0);

                        entry.avgConfidence = confidences.length > 0
                            ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
                            : 0;

                        entry.lastUpdated = new Date();
                        this.conceptIndex.set(concept, entry);
                    }
                }
            }
        }
    }

    private updateNoteIndex(
        noteId: string,
        concepts: string[],
        confidences: number[],
        replaceExisting = false,
    ): void {
        if (replaceExisting) {
            this.removeNote(noteId);
        }

        this.noteConcepts.set(noteId, concepts);
        this.noteConfidences.set(noteId, confidences);

        for (let i = 0; i < concepts.length; i++) {
            const concept = concepts[i];
            const confidence = confidences[i];

            const entry = this.conceptIndex.get(concept) || {
                concept,
                noteIds: [],
                avgConfidence: 0,
                lastUpdated: new Date(),
            };

            if (!entry.noteIds.includes(noteId)) {
                entry.noteIds.push(noteId);

                const totalNotes = entry.noteIds.length;
                entry.avgConfidence = ((entry.avgConfidence * (totalNotes - 1)) + confidence) / totalNotes;

                entry.lastUpdated = new Date();
                this.conceptIndex.set(concept, entry);
            }
        }
    }

    /**
     * Discover associations between notes based on shared concepts
     */
    async discoverAssociations(): Promise<NoteAssociation[]> {
        const associations: NoteAssociation[] = [];
        const processedPairs = new Set<string>();

        // Get all note IDs
        const noteIds = Array.from(this.noteConcepts.keys());

        if (noteIds.length < 2) {
            return []; // Need at least 2 notes for associations
        }

        // For each concept, find notes that share it
        for (const [concept, entry] of this.conceptIndex.entries()) {
            const noteIdsWithConcept = entry.noteIds;

            if (noteIdsWithConcept.length < 2) {
                continue; // Need at least 2 notes sharing this concept
            }

            // Generate all unique pairs of notes sharing this concept
            for (let i = 0; i < noteIdsWithConcept.length; i++) {
                for (let j = i + 1; j < noteIdsWithConcept.length; j++) {
                    const sourceId = noteIdsWithConcept[i];
                    const targetId = noteIdsWithConcept[j];

                    // Skip self-associations if configured
                    if (this.config.excludeSelfAssociations && sourceId === targetId) {
                        continue;
                    }

                    // Create unique pair key
                    const pairKey = sourceId < targetId
                        ? `${sourceId}|${targetId}`
                        : `${targetId}|${sourceId}`;

                    if (processedPairs.has(pairKey)) {
                        continue; // Already processed this pair
                    }

                    processedPairs.add(pairKey);

                    // Find all shared concepts between this pair
                    const sharedConcepts = this.findSharedConcepts(sourceId, targetId);

                    if (sharedConcepts.length >= this.config.minSharedConcepts) {
                        const association = this.createAssociation(
                            sourceId,
                            targetId,
                            sharedConcepts
                        );

                        if (association.confidence >= this.config.minConfidence) {
                            associations.push(association);
                        }
                    }
                }
            }
        }

        // Sort associations by quality and limit results
        return this.sortAssociations(associations).slice(0, this.config.maxAssociations);
    }

    /**
     * Find associations for a specific note
     */
    async discoverAssociationsForNote(noteId: string): Promise<NoteAssociation[]> {
        const allAssociations = await this.discoverAssociations();
        return allAssociations.filter(assoc =>
            assoc.sourceNoteId === noteId || assoc.targetNoteId === noteId
        );
    }

    /**
     * Find shared concepts between two notes
     */
    private findSharedConcepts(noteId1: string, noteId2: string): string[] {
        const concepts1 = this.noteConcepts.get(noteId1) || [];
        const concepts2 = this.noteConcepts.get(noteId2) || [];

        return concepts1.filter(concept => concepts2.includes(concept));
    }

    /**
     * Create an association object for a pair of notes
     */
    private createAssociation(
        sourceId: string,
        targetId: string,
        sharedConcepts: string[]
    ): NoteAssociation {
        // Calculate confidence based on shared concepts and their confidences
        const confidence = this.calculateAssociationConfidence(sourceId, targetId, sharedConcepts);

        return {
            sourceNoteId: sourceId,
            targetNoteId: targetId,
            sharedConcepts,
            confidence,
            discoveredAt: new Date(),
        };
    }

    /**
     * Calculate association confidence
     */
    private calculateAssociationConfidence(
        sourceId: string,
        targetId: string,
        sharedConcepts: string[]
    ): number {
        if (sharedConcepts.length === 0) {
            return 0;
        }

        const sourceConcepts = this.noteConcepts.get(sourceId) || [];
        const targetConcepts = this.noteConcepts.get(targetId) || [];
        const sourceConfidences = this.noteConfidences.get(sourceId) || [];
        const targetConfidences = this.noteConfidences.get(targetId) || [];

        let totalConfidence = 0;
        let validConcepts = 0;

        for (const concept of sharedConcepts) {
            const sourceIndex = sourceConcepts.indexOf(concept);
            const targetIndex = targetConcepts.indexOf(concept);

            if (sourceIndex !== -1 && targetIndex !== -1) {
                const sourceConf = sourceConfidences[sourceIndex] || 0.7;
                const targetConf = targetConfidences[targetIndex] || 0.7;

                // Use average of both confidences
                totalConfidence += (sourceConf + targetConf) / 2;
                validConcepts++;
            }
        }

        if (validConcepts === 0) {
            return 0;
        }

        // Base confidence on average concept confidence
        let confidence = totalConfidence / validConcepts;

        // Boost confidence based on number of shared concepts
        const conceptBoost = Math.min(sharedConcepts.length / 5, 0.2); // Max 20% boost
        confidence = Math.min(confidence + conceptBoost, 1.0);

        return confidence;
    }

    /**
     * Sort associations by quality
     */
    private sortAssociations(associations: NoteAssociation[]): NoteAssociation[] {
        return associations.sort((a, b) => {
            // 1. Number of shared concepts (descending)
            const conceptCountDiff = b.sharedConcepts.length - a.sharedConcepts.length;
            if (conceptCountDiff !== 0) return conceptCountDiff;

            // 2. Association confidence (descending)
            const confidenceDiff = b.confidence - a.confidence;
            if (confidenceDiff !== 0) return confidenceDiff;

            // 3. Recency (descending) - newer associations first
            return b.discoveredAt.getTime() - a.discoveredAt.getTime();
        });
    }

    /**
     * Get statistics about the association index
     */
    getStats(): {
        totalNotes: number;
        totalConcepts: number;
        totalAssociations: number;
        avgConceptsPerNote: number;
        avgNotesPerConcept: number;
    } {
        const totalNotes = this.noteConcepts.size;
        const totalConcepts = this.conceptIndex.size;

        // Calculate average concepts per note
        let totalConceptCount = 0;
        for (const concepts of this.noteConcepts.values()) {
            totalConceptCount += concepts.length;
        }
        const avgConceptsPerNote = totalNotes > 0 ? totalConceptCount / totalNotes : 0;

        // Calculate average notes per concept
        let totalNoteCount = 0;
        for (const entry of this.conceptIndex.values()) {
            totalNoteCount += entry.noteIds.length;
        }
        const avgNotesPerConcept = totalConcepts > 0 ? totalNoteCount / totalConcepts : 0;

        // Estimate total possible associations (n choose 2)
        const totalAssociations = totalNotes > 1
            ? (totalNotes * (totalNotes - 1)) / 2
            : 0;

        return {
            totalNotes,
            totalConcepts,
            totalAssociations,
            avgConceptsPerNote,
            avgNotesPerConcept,
        };
    }

    /**
     * Clear all indexed data
     */
    clearIndex(): void {
        this.conceptIndex.clear();
        this.noteConcepts.clear();
        this.noteConfidences.clear();
    }

    /**
     * Export concept index for debugging
     */
    exportConceptIndex(): ConceptIndexEntry[] {
        return Array.from(this.conceptIndex.values());
    }

    /**
     * Get concepts for a specific note
     */
    getNoteConcepts(noteId: string): string[] {
        return this.noteConcepts.get(noteId) || [];
    }

    /**
     * Get notes containing a specific concept
     */
    getNotesForConcept(concept: string): string[] {
        return this.conceptIndex.get(concept)?.noteIds || [];
    }
}
