/**
 * Unit tests for association export utilities
 */

import { buildAssociationExport } from '@services/association-exporter';
import type { NoteAssociation } from '@services/association-engine';

describe('Association Exporter (v0.6.0)', () => {
    it('should build export payload with stats and associations', () => {
        const associations: NoteAssociation[] = [
            {
                sourceNoteId: 'a.md',
                targetNoteId: 'b.md',
                sharedConcepts: ['幂等性'],
                confidence: 0.9,
                discoveredAt: new Date('2026-01-01T00:00:00.000Z'),
            },
        ];

        const stats = {
            totalNotes: 2,
            totalConcepts: 1,
            totalAssociations: 1,
            avgConceptsPerNote: 1,
            avgNotesPerConcept: 2,
        };

        const payload = buildAssociationExport(associations, stats, {
            filteredBy: 'minConfidence:0.7',
        });

        expect(payload.stats.totalNotes).toBe(2);
        expect(payload.associations).toHaveLength(1);
        expect(payload.associations[0].sharedConcepts).toEqual(['幂等性']);
        expect(payload.meta.filteredBy).toBe('minConfidence:0.7');
    });
});
