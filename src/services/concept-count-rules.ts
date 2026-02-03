import type { ConceptCountRule } from '@core/types/concept';

export function getMaxConceptsForLength(textLength: number, rules: ConceptCountRule[]): number {
    for (const rule of rules) {
        if (textLength >= rule.minChars && textLength < rule.maxChars) {
            return rule.maxConcepts;
        }
    }

    return 4;
}
