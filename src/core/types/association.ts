/**
 * Association Types
 * Types for concept-based note association discovery
 */

/**
 * Association between two notes based on shared concepts
 */
export interface NoteAssociation {
    sourceNoteId: string;      // Source note path or ID
    targetNoteId: string;      // Target note path or ID
    sourceNoteTitle?: string;  // Source note title (for display)
    targetNoteTitle?: string;  // Target note title (for display)
    sharedConcepts: string[];  // Shared abstract concepts
    confidence: number;        // Overall association confidence (0-1)
    vectorSimilarity?: number; // Optional vector similarity score
    discoveredAt: Date;        // When this association was discovered
}

/**
 * Configuration for association discovery
 */
export interface AssociationConfig {
    minSharedConcepts: number;     // Minimum number of shared concepts to form association
    minConfidence: number;         // Minimum confidence threshold for associations
    maxAssociations: number;       // Maximum number of associations to return
    excludeSelfAssociations: boolean; // Whether to exclude associations with same note
}

/**
 * Concept index entry mapping concept to notes
 */
export interface ConceptIndexEntry {
    concept: string;               // The concept
    noteIds: string[];             // Notes containing this concept
    avgConfidence: number;         // Average confidence across notes
    lastUpdated: Date;             // When this entry was last updated
}

/**
 * User preferences for association management
 */
export interface AssociationPreferenceState {
    ignoredAssociations: Set<string>; // Set of ignored association IDs
    deletedConcepts: Map<string, Set<string>>; // Map of associationId -> Set<concept>
}

/**
 * Association persistence functions
 */
export type AssociationLoaderFunction = () => Promise<AssociationPreferenceState>;
export type AssociationSaverFunction = (state: AssociationPreferenceState) => Promise<void>;

/**
 * Association exporter types
 */
export interface AssociationExportMetadata {
    exportedAt: string;
    noteCount: number;
    associationCount: number;
    version: string;
}

export interface AssociationExportEntry {
    sourceNoteId: string;
    targetNoteId: string;
    sharedConcepts: string[];
    confidence: number;
}

export interface AssociationExportPayload {
    metadata: AssociationExportMetadata;
    associations: AssociationExportEntry[];
}
