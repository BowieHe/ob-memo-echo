import { describe, it, expect, vi } from 'vitest';
import { ConceptExtractionPipeline } from '@services/concept-extraction-pipeline';
import type { ConceptExtractionSettings } from '@core/types/concept';

describe('ConceptExtractionPipeline', () => {
    it('matches extracted concepts against dictionary', async () => {
        const settings: ConceptExtractionSettings = {
            enableConceptExtraction: true,
            injectToFrontmatter: true,
            autoCreateConceptPage: false,
            conceptPagePrefix: '_me',
            conceptCountRules: [
                { minChars: 0, maxChars: 199, maxConcepts: 1 },
                { minChars: 200, maxChars: 999, maxConcepts: 2 },
            ],
            skipRules: {
                skipPaths: [],
                skipTags: [],
                minTextLength: 10,
                maxImageRatio: 0.7,
            },
            conceptDictionaryPath: '_me/_concept-dictionary.json',
        };

        const app = {
            vault: {
                getAbstractFileByPath: vi.fn(() => null),
                create: vi.fn(async () => undefined),
            },
        } as any;

        const extractor = {
            extractDetailed: vi.fn(async () => ({
                concepts: [
                    { name: '认知科学', confidence: 0.9, reason: '核心主题' },
                ],
                noteType: 'normal',
                skipReason: null,
            })),
        } as any;

        const frontmatterService = {
            updateAfterIndexing: vi.fn(async () => undefined),
        } as any;

        const pipeline = new ConceptExtractionPipeline(app, extractor, frontmatterService, settings);
        const result = await pipeline.extract({
            path: 'notes/test.md',
            title: 'Test',
            content: 'This is a test note with enough content',
        });

        expect(result.skipped).toBe(false);
        expect(result.concepts?.[0].matchInfo.matchType).toBe('new');
    });
});
