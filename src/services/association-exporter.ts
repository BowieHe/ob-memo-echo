/**
 * Association exporter utilities
 * v0.6.0: Export association discovery results
 */

import type { NoteAssociation } from './association-engine';

export interface AssociationExportStats {
    totalNotes: number;
    totalConcepts: number;
    totalAssociations: number;
    avgConceptsPerNote: number;
    avgNotesPerConcept: number;
}

export interface AssociationExportMeta {
    exportedAt: string;
    filteredBy?: string;
}

export interface AssociationExportPayload {
    meta: AssociationExportMeta;
    stats: AssociationExportStats;
    associations: Array<{
        sourceNoteId: string;
        targetNoteId: string;
        sharedConcepts: string[];
        confidence: number;
        discoveredAt: string;
    }>;
}

export function buildAssociationExport(
    associations: NoteAssociation[],
    stats: AssociationExportStats,
    meta: Omit<AssociationExportMeta, 'exportedAt'> = {},
): AssociationExportPayload {
    return {
        meta: {
            exportedAt: new Date().toISOString(),
            ...meta,
        },
        stats,
        associations: associations.map((association) => ({
            sourceNoteId: association.sourceNoteId,
            targetNoteId: association.targetNoteId,
            sharedConcepts: association.sharedConcepts,
            confidence: association.confidence,
            discoveredAt: association.discoveredAt.toISOString(),
        })),
    };
}
