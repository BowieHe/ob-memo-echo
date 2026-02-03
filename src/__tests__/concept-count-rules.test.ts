import { describe, it, expect } from 'vitest';
import { getMaxConceptsForLength } from '@services/concept-count-rules';
import type { ConceptCountRule } from '@core/types/concept';

describe('getMaxConceptsForLength', () => {
    const rules: ConceptCountRule[] = [
        { minChars: 0, maxChars: 199, maxConcepts: 1 },
        { minChars: 200, maxChars: 499, maxConcepts: 2 },
        { minChars: 500, maxChars: 999, maxConcepts: 3 },
        { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
    ];

    it('returns correct max concepts by text length', () => {
        expect(getMaxConceptsForLength(150, rules)).toBe(1);
        expect(getMaxConceptsForLength(300, rules)).toBe(2);
        expect(getMaxConceptsForLength(800, rules)).toBe(3);
        expect(getMaxConceptsForLength(1500, rules)).toBe(4);
    });

    it('falls back to 4 when no rule matches', () => {
        expect(getMaxConceptsForLength(-1, rules)).toBe(4);
    });
});
