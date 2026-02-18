/**
 * Frontmatter Types
 * Types for me_tag, me_concepts, me_indexed_at frontmatter fields
 */

/**
 * Memo Echo frontmatter fields injected into note YAML
 */
export interface MemoEchoFrontmatter {
    me_concepts?: string[];    // Concept aggregation page links (legacy format)
    me_indexed_at?: string;    // ISO timestamp of last indexing
    me_tag?: string[];         // 🆕: Core content tags (chunk-level)
    me_concepts_links?: Array<{  // 🆕: Full-text recommended wikilinks
        raw_text: string;
        reason: string;
    }>;
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
