import { describe, it, expect } from 'vitest';
import { ConceptMatcher } from '@services/concept-matcher';
import type { ConceptDictionary } from '@core/types/concept';

describe('ConceptMatcher', () => {
    it('matches exact concept name', () => {
        const dictionary: ConceptDictionary = {
            version: '1.0',
            lastUpdated: '2026-02-01T00:00:00Z',
            concepts: {
                '认知科学': {
                    aliases: ['cognitive science'],
                    createdAt: '2026-01-01T00:00:00Z',
                    noteCount: 1,
                },
            },
        };

        const matcher = new ConceptMatcher(dictionary);
        const result = matcher.match('认知科学');

        expect(result.matchType).toBe('exact');
        expect(result.matchedConcept).toBe('认知科学');
        expect(result.confidence).toBe(1);
    });

    it('matches alias to canonical concept', () => {
        const dictionary: ConceptDictionary = {
            version: '1.0',
            lastUpdated: '2026-02-01T00:00:00Z',
            concepts: {
                '分布式系统': {
                    aliases: ['distributed systems', '分布式'],
                    createdAt: '2026-01-01T00:00:00Z',
                    noteCount: 1,
                },
            },
        };

        const matcher = new ConceptMatcher(dictionary);
        const result = matcher.match('Distributed Systems');

        expect(result.matchType).toBe('alias');
        expect(result.matchedConcept).toBe('分布式系统');
        expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('returns new concept when no match found', () => {
        const dictionary: ConceptDictionary = {
            version: '1.0',
            lastUpdated: '2026-02-01T00:00:00Z',
            concepts: {},
        };

        const matcher = new ConceptMatcher(dictionary);
        const result = matcher.match('复杂系统');

        expect(result.matchType).toBe('new');
        expect(result.matchedConcept).toBe('复杂系统');
        expect(result.confidence).toBeLessThan(0.7);
    });
});
