/**
 * AssociationPreferences - Persist user decisions for associations
 * v0.6.0: Tracks ignored associations and deleted concepts
 */

import type { NoteAssociation } from '@core/types/association';

export interface AssociationPreferencesState {
    ignoredAssociations: string[];
    deletedConcepts: Record<string, string[]>;
}

export type AssociationPreferencesLoader = () => AssociationPreferencesState;
export type AssociationPreferencesSaver = (state: AssociationPreferencesState) => Promise<void>;

export class AssociationPreferences {
    private load: AssociationPreferencesLoader;
    private save: AssociationPreferencesSaver;

    constructor(load: AssociationPreferencesLoader, save: AssociationPreferencesSaver) {
        this.load = load;
        this.save = save;
    }

    getIgnoredAssociations(): Set<string> {
        return new Set(this.load().ignoredAssociations || []);
    }

    isIgnored(associationId: string): boolean {
        return this.getIgnoredAssociations().has(associationId);
    }

    async ignoreAssociation(associationId: string): Promise<void> {
        const state = this.load();
        const next = new Set(state.ignoredAssociations || []);
        next.add(associationId);
        await this.save({
            ...state,
            ignoredAssociations: Array.from(next),
        });
    }

    async unignoreAssociation(associationId: string): Promise<void> {
        const state = this.load();
        const next = new Set(state.ignoredAssociations || []);
        next.delete(associationId);
        await this.save({
            ...state,
            ignoredAssociations: Array.from(next),
        });
    }

    getDeletedConcepts(associationId: string): string[] {
        const state = this.load();
        return state.deletedConcepts?.[associationId] || [];
    }

    async deleteConcept(associationId: string, concept: string): Promise<void> {
        const state = this.load();
        const existing = new Set(state.deletedConcepts?.[associationId] || []);
        existing.add(concept);

        await this.save({
            ...state,
            deletedConcepts: {
                ...state.deletedConcepts,
                [associationId]: Array.from(existing),
            },
        });
    }

    async restoreConcept(associationId: string, concept: string): Promise<void> {
        const state = this.load();
        const existing = new Set(state.deletedConcepts?.[associationId] || []);
        existing.delete(concept);

        await this.save({
            ...state,
            deletedConcepts: {
                ...state.deletedConcepts,
                [associationId]: Array.from(existing),
            },
        });
    }

    async clearIgnoredAssociations(): Promise<void> {
        const state = this.load();
        await this.save({
            ...state,
            ignoredAssociations: [],
        });
    }

    async clearDeletedConcepts(): Promise<void> {
        const state = this.load();
        await this.save({
            ...state,
            deletedConcepts: {},
        });
    }

    filterAssociations(associations: NoteAssociation[]): NoteAssociation[] {
        const ignored = this.getIgnoredAssociations();

        return associations
            .filter((association) => {
                const id = AssociationPreferences.buildAssociationId(
                    association.sourceNoteId,
                    association.targetNoteId,
                );
                return !ignored.has(id);
            })
            .map((association) => {
                const id = AssociationPreferences.buildAssociationId(
                    association.sourceNoteId,
                    association.targetNoteId,
                );
                const deleted = new Set(this.getDeletedConcepts(id));
                const filteredConcepts = association.sharedConcepts.filter(
                    (concept) => !deleted.has(concept),
                );

                return {
                    ...association,
                    sharedConcepts: filteredConcepts,
                };
            })
            .filter((association) => association.sharedConcepts.length > 0);
    }

    static buildAssociationId(sourceNoteId: string, targetNoteId: string): string {
        return sourceNoteId < targetNoteId
            ? `${sourceNoteId}|${targetNoteId}`
            : `${targetNoteId}|${sourceNoteId}`;
    }
}
