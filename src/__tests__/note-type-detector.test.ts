import { describe, it, expect } from 'vitest';
import { NoteTypeDetector } from '@services/note-type-detector';
import type { SkipRules } from '@core/types/concept';

describe('NoteTypeDetector', () => {
    const skipRules: SkipRules = {
        skipPaths: ['_me/', 'templates/', 'daily/'],
        skipTags: ['vocabulary', 'daily', 'template'],
        minTextLength: 100,
        maxImageRatio: 0.7,
    };

    it('skips notes matching skip paths', () => {
        const detector = new NoteTypeDetector(skipRules);
        const result = detector.detect({ path: '_me/test.md', content: 'test content' });

        expect(result.shouldSkip).toBe(true);
        expect(result.reason).toContain('skip path');
    });

    it('skips notes with skip tags', () => {
        const detector = new NoteTypeDetector(skipRules);
        const result = detector.detect({ path: 'notes/test.md', content: 'test content', tags: ['daily'] });

        expect(result.shouldSkip).toBe(true);
        expect(result.reason).toContain('skip tag');
    });

    it('detects image-heavy notes', () => {
        const detector = new NoteTypeDetector(skipRules);
        const content = '![[img1.png]]\n![[img2.png]]\n![[img3.png]]\n![[img4.png]]\n![[img5.png]]\n![[img6.png]]\nshort text';
        const result = detector.detect({ path: 'notes/images.md', content });

        expect(result.type).toBe('image-collection');
        expect(result.shouldSkip).toBe(true);
    });

    it('detects vocabulary list notes', () => {
        const detector = new NoteTypeDetector(skipRules);
        const content = Array.from({ length: 30 }, (_, i) => `word${i}`).join('\n');
        const result = detector.detect({ path: 'notes/vocab.md', content });

        expect(result.type).toBe('vocabulary');
        expect(result.shouldSkip).toBe(true);
    });

    it('skips notes that are too short', () => {
        const detector = new NoteTypeDetector(skipRules);
        const content = 'short note';
        const result = detector.detect({ path: 'notes/short.md', content });

        expect(result.shouldSkip).toBe(true);
        expect(result.reason).toContain('Too short');
    });
});
