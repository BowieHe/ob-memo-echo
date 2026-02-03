/**
 * Unit tests for ConceptExtractor language adaptation (v0.8.1)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConceptExtractor } from '@services/concept-extractor';

// Mock fetch globally
global.fetch = vi.fn();

describe('ConceptExtractor Language Adaptation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ response: '{"concepts":[]}' }),
        } as Response);
    });

    it('should use auto language mode by default', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        expect(extractor['config'].language).toBe('auto');
    });

    it('should accept language config in constructor', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'zh',
        });

        expect(extractor['config'].language).toBe('zh');
    });

    it('should generate Chinese-only prompt when language=zh', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'zh',
            focusOnAbstractConcepts: true,
        });

        const systemPrompt = extractor['buildSystemPrompt']();
        expect(systemPrompt).toContain('Extract ALL concepts in Chinese only');
        expect(systemPrompt).not.toContain('Language Consistency');
    });

    it('should generate English-only prompt when language=en', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'en',
            focusOnAbstractConcepts: true,
        });

        const systemPrompt = extractor['buildSystemPrompt']();
        expect(systemPrompt).toContain('Extract ALL concepts in English only');
        expect(systemPrompt).not.toContain('Language Consistency');
    });

    it('should generate auto-detect prompt when language=auto', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'auto',
            focusOnAbstractConcepts: true,
        });

        const systemPrompt = extractor['buildSystemPrompt']();
        expect(systemPrompt).toContain('Language Consistency');
        expect(systemPrompt).toContain('Use the same language as the note content');
        expect(systemPrompt).not.toContain('Extract ALL concepts in');
    });

    it('should update language config via updateConfig', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'auto',
        });

        extractor.updateConfig({ language: 'ja' });
        expect(extractor['config'].language).toBe('ja');
    });

    it('should maintain backward compatibility when language not set', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            focusOnAbstractConcepts: true,
            // 不设置 language
        });

        const systemPrompt = extractor['buildSystemPrompt']();
        expect(systemPrompt).toContain('Language Consistency');
    });

    it('should include language instruction in buildPrompt', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
            language: 'zh',
            focusOnAbstractConcepts: true,
        });

        const prompt = extractor['buildPrompt']('测试内容', '测试标题');
        expect(prompt).toContain('Return concepts in Chinese only');
    });

    it('should get correct language name for each language code', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        expect(extractor['getLanguageName']('auto')).toBe("the note's primary language");
        expect(extractor['getLanguageName']('en')).toBe('English');
        expect(extractor['getLanguageName']('zh')).toBe('Chinese');
        expect(extractor['getLanguageName']('ja')).toBe('Japanese');
        expect(extractor['getLanguageName']('ko')).toBe('Korean');
        expect(extractor['getLanguageName']('es')).toBe('Spanish');
        expect(extractor['getLanguageName']('fr')).toBe('French');
        expect(extractor['getLanguageName']('de')).toBe('German');
    });

    it('should handle unknown language codes gracefully', () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        expect(extractor['getLanguageName']('unknown')).toBe('unknown');
    });
});
