import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ConceptExtractor } from '@services/concept-extractor';

global.fetch = vi.fn();

describe('ConceptExtractor v0.8.0 - Detailed Extraction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses detailed concept extraction response', async () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            focusOnAbstractConcepts: true,
            minConfidence: 0.7,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        const mockResponse = {
            concepts: [
                { name: '检索增强生成', confidence: 0.95, reason: '核心主题' },
                { name: '知识库系统', confidence: 0.85, reason: '信息架构层面' },
            ],
            noteType: 'normal',
            skipReason: null,
        };

        (global.fetch as Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: JSON.stringify(mockResponse) }),
        });

        const result = await extractor.extractDetailed('test content', 'test title');

        expect(result.noteType).toBe('normal');
        expect(result.skipReason).toBeNull();
        expect(result.concepts).toHaveLength(2);
        expect(result.concepts[0].name).toBe('检索增强生成');
        expect(result.concepts[0].reason).toBe('核心主题');
    });

    it('handles fenced JSON with trailing commas', async () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            focusOnAbstractConcepts: true,
            minConfidence: 0.7,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        const raw = "```json\n{\n  \"concepts\": [\n    {\n      \"name\": \"分布式系统\",\n      \"confidence\": 0.9,\n      \"reason\": \"核心主题\",\n    }\n  ],\n  \"noteType\": \"normal\",\n  \"skipReason\": null,\n}\n```";

        (global.fetch as Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: raw }),
        });

        const result = await extractor.extract('test content', 'test title');

        expect(result.concepts).toContain('分布式系统');
    });

    it('logs warning when JSON is invalid', async () => {
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const extractor = new ConceptExtractor({
            provider: 'ollama',
            focusOnAbstractConcepts: true,
            minConfidence: 0.7,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        }, logger);

        (global.fetch as Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: '{"concepts": ["bad" "json"]}' }),
        });

        await extractor.extract('test content', 'test title');

        expect(logger.warn).toHaveBeenCalled();
    });

    it('handles object concepts in basic response', async () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            focusOnAbstractConcepts: true,
            minConfidence: 0.7,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        const raw = JSON.stringify({
            concepts: [{ name: '复杂系统', confidence: 0.9 }],
        });

        (global.fetch as Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: raw }),
        });

        const result = await extractor.extract('test content', 'test title');

        expect(result.concepts).toContain('复杂系统');
    });

    it('limits reason length and sets num_predict for Ollama', async () => {
        const extractor = new ConceptExtractor({
            provider: 'ollama',
            focusOnAbstractConcepts: true,
            minConfidence: 0.7,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen2.5:3b',
        });

        (global.fetch as Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: '{"concepts": []}' }),
        });

        await extractor.extractDetailed('test content', 'test title');

        const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
        expect(body.num_predict).toBeDefined();
        expect(body.prompt).toContain('Reason must be <=');
    });
});
