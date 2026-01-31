/**
 * Frontmatter Types
 * Types for me_concepts and me_indexed_at frontmatter fields
 */

/**
 * Memo Echo frontmatter fields injected into note YAML
 */
export interface MemoEchoFrontmatter {
    me_concepts?: string[];    // Extracted concepts from Memo Echo
    me_indexed_at?: string;    // ISO timestamp of last indexing
}

/**
 * Real-time paragraph detection types
 */
export interface ParagraphCompletionEvent {
    paragraph: string;
    position: number;
    timestamp: number;
}

/**
 * Configuration for ParagraphDetector
 */
export interface ParagraphDetectorConfig {
    debounceMs?: number;
    minParagraphLength?: number;
}
