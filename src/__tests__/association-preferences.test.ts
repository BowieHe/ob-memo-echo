/**
 * Unit tests for AssociationPreferences v0.6.0
 * Tests persistent ignored associations and deleted concept handling
 */

import { AssociationPreferences, AssociationPreferencesState } from '../services/association-preferences';
import type { NoteAssociation } from '../services/association-engine';

describe('AssociationPreferences (v0.6.0)', () => {
    let state: AssociationPreferencesState;
    let prefs: AssociationPreferences;

    beforeEach(() => {
        state = {
            ignoredAssociations: [],
            deletedConcepts: {},
        };

        prefs = new AssociationPreferences(
            () => state,
            async (next: AssociationPreferencesState) => { state = next; }
        );
    });

    describe('Ignored Associations', () => {
        it('should persist ignored association IDs', async () => {
            await prefs.ignoreAssociation('a.md|b.md');

            expect(prefs.isIgnored('a.md|b.md')).toBe(true);
            expect(state.ignoredAssociations).toContain('a.md|b.md');
        });

        it('should remove ignored association IDs', async () => {
            await prefs.ignoreAssociation('a.md|b.md');
            await prefs.unignoreAssociation('a.md|b.md');

            expect(prefs.isIgnored('a.md|b.md')).toBe(false);
            expect(state.ignoredAssociations).not.toContain('a.md|b.md');
        });
    });

    describe('Deleted Concepts', () => {
        it('should track deleted concepts per association', async () => {
            await prefs.deleteConcept('a.md|b.md', '幂等性');
            await prefs.deleteConcept('a.md|b.md', '事件驱动');

            const deleted = prefs.getDeletedConcepts('a.md|b.md');
            expect(deleted).toContain('幂等性');
            expect(deleted).toContain('事件驱动');
        });

        it('should not duplicate deleted concepts', async () => {
            await prefs.deleteConcept('a.md|b.md', '幂等性');
            await prefs.deleteConcept('a.md|b.md', '幂等性');

            const deleted = prefs.getDeletedConcepts('a.md|b.md');
            expect(deleted).toEqual(['幂等性']);
        });
    });

    describe('Resets', () => {
        it('should clear all ignored associations', async () => {
            await prefs.ignoreAssociation('a.md|b.md');
            await prefs.ignoreAssociation('c.md|d.md');

            await prefs.clearIgnoredAssociations();

            expect(state.ignoredAssociations).toEqual([]);
        });

        it('should clear all deleted concepts', async () => {
            await prefs.deleteConcept('a.md|b.md', '幂等性');
            await prefs.deleteConcept('c.md|d.md', '事件驱动');

            await prefs.clearDeletedConcepts();

            expect(state.deletedConcepts).toEqual({});
        });
    });

    describe('Association Filtering', () => {
        it('should filter out ignored associations', async () => {
            const associations: NoteAssociation[] = [
                {
                    sourceNoteId: 'a.md',
                    targetNoteId: 'b.md',
                    sharedConcepts: ['幂等性'],
                    confidence: 0.9,
                    discoveredAt: new Date('2026-01-01'),
                },
                {
                    sourceNoteId: 'c.md',
                    targetNoteId: 'd.md',
                    sharedConcepts: ['事件驱动'],
                    confidence: 0.8,
                    discoveredAt: new Date('2026-01-01'),
                },
            ];

            await prefs.ignoreAssociation('a.md|b.md');

            const filtered = prefs.filterAssociations(associations);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].sourceNoteId).toBe('c.md');
        });

        it('should remove deleted concepts from associations', async () => {
            const association: NoteAssociation = {
                sourceNoteId: 'a.md',
                targetNoteId: 'b.md',
                sharedConcepts: ['幂等性', '事件驱动'],
                confidence: 0.9,
                discoveredAt: new Date('2026-01-01'),
            };

            await prefs.deleteConcept('a.md|b.md', '事件驱动');

            const filtered = prefs.filterAssociations([association]);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].sharedConcepts).toEqual(['幂等性']);
        });

        it('should drop associations with no remaining concepts', async () => {
            const association: NoteAssociation = {
                sourceNoteId: 'a.md',
                targetNoteId: 'b.md',
                sharedConcepts: ['幂等性'],
                confidence: 0.9,
                discoveredAt: new Date('2026-01-01'),
            };

            await prefs.deleteConcept('a.md|b.md', '幂等性');

            const filtered = prefs.filterAssociations([association]);
            expect(filtered).toHaveLength(0);
        });
    });
});
