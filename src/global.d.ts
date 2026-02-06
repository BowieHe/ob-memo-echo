/**
 * Global type declarations for Memo Echo plugin
 * Custom window events for plugin-wide communication
 */

import type { SearchResult } from '@core/types/indexing';
import type { ExtractedConceptWithMatch, ConfirmedConcept } from '@core/types/concept';

declare global {
    interface WindowEventMap {
        // Concept extraction events
        'memo-echo:concepts-extracted': CustomEvent<{
            note: { path: string; title: string; content: string };
            concepts: ExtractedConceptWithMatch[];
        }>;

        'memo-echo:batch-progress': CustomEvent<{
            totalFiles: number;
            processedFiles: number;
            totalConcepts: number;
        }>;

        'memo-echo:batch-increment': CustomEvent<{
            batch: Array<{
                note: { path: string; title: string; content: string };
                concepts: ExtractedConceptWithMatch[];
            }>;
            totalFiles: number;
            processedFiles: number;
            totalConcepts: number;
        }>;

        'memo-echo:batch-stop': CustomEvent<{
            processedFiles: number;
            totalConcepts: number;
        }>;

        // Concept application events
        'memo-echo:concepts-apply': CustomEvent<ConfirmedConcept[]>;

        'memo-echo:batch-concepts-apply': CustomEvent<{
            groups: Array<{
                notePath: string;
                noteTitle: string;
                concepts: ExtractedConceptWithMatch[];
            }>;
        }>;

        'memo-echo:single-concept-apply': CustomEvent<{
            group: {
                notePath: string;
                noteTitle: string;
                concepts: ExtractedConceptWithMatch[];
            };
        }>;

        'memo-echo:concepts-skip': CustomEvent<void>;

        // Control events
        'memo-echo:batch-stop-request': CustomEvent<void>;
        'memo-echo:open-file': CustomEvent<SearchResult>;
        'memo-echo:index-current-file': CustomEvent<void>;

        // Search/ambient events
        'memo-echo:ambient-update': CustomEvent<SearchResult[]>;
    }
}

// Required to make this a module
export {};
