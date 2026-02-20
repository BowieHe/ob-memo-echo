/**
 * Concept Utils - Common utility functions for concept processing
 */

import type { ExtractedConceptWithMatch } from "@core/types/concept";

/**
 * Deduplicate concepts by normalized name within a single file
 * @param concepts - Array of concepts to deduplicate
 * @returns Deduplicated concepts (higher confidence wins, reasons merged)
 */
export function deduplicateConcepts(
    concepts: ExtractedConceptWithMatch[],
): ExtractedConceptWithMatch[] {
    const conceptMap = new Map<string, ExtractedConceptWithMatch>();

    for (const concept of concepts) {
        const normalizedName = concept.name.trim().toLowerCase();
        const existing = conceptMap.get(normalizedName);

        if (!existing) {
            conceptMap.set(normalizedName, concept);
        } else if (concept.confidence > existing.confidence) {
            // Higher confidence, replace and merge reasons
            const reasons = new Set<string>();
            if (existing.reason?.trim()) reasons.add(existing.reason.trim());
            if (concept.reason?.trim()) reasons.add(concept.reason.trim());
            conceptMap.set(normalizedName, {
                ...concept,
                reason: Array.from(reasons).join("; "),
            });
        } else {
            // Equal or lower confidence, just merge reasons
            const reasons = new Set<string>();
            if (existing.reason?.trim()) reasons.add(existing.reason.trim());
            if (concept.reason?.trim()) reasons.add(concept.reason.trim());
            existing.reason = Array.from(reasons).join("; ");
        }
    }

    return Array.from(conceptMap.values());
}
