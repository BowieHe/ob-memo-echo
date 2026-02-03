import type { ConceptDictionary, ConceptMatch } from '@core/types/concept';

export class ConceptMatcher {
    private dictionary: ConceptDictionary;

    constructor(dictionary: ConceptDictionary) {
        this.dictionary = dictionary;
    }

    match(extractedTerm: string): ConceptMatch {
        const normalized = this.normalize(extractedTerm);

        if (this.dictionary.concepts[normalized]) {
            return {
                originalTerm: extractedTerm,
                matchedConcept: normalized,
                matchType: 'exact',
                confidence: 1,
            };
        }

        for (const [conceptName, entry] of Object.entries(this.dictionary.concepts)) {
            const normalizedAliases = entry.aliases.map((alias) => this.normalize(alias));
            if (normalizedAliases.includes(normalized)) {
                return {
                    originalTerm: extractedTerm,
                    matchedConcept: conceptName,
                    matchType: 'alias',
                    confidence: 0.95,
                };
            }
        }

        return {
            originalTerm: extractedTerm,
            matchedConcept: extractedTerm.trim(),
            matchType: 'new',
            confidence: 0.5,
        };
    }

    private normalize(term: string): string {
        return term.trim().toLowerCase();
    }
}
