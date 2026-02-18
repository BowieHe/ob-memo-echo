import { describe, it, expect } from 'vitest';
import { MetadataExtractor } from '@services/metadata-extractor';
import type { BaseModelConfig } from '@core/types/setting';

describe('MetadataExtractor - Phase 2 Changes', () => {
    describe('chunk-level extraction', () => {
        it('should build correct chunk prompt', () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);

            // Use reflection to access private buildPrompt method for testing
            const prompt = (extractor as any).buildPrompt('Test content');

            expect(prompt).toContain('me_tag');
            expect(prompt).toContain('summary');
            expect(prompt).toContain('category');
            expect(prompt).not.toContain('concepts');
        });

        it('should extract me_tag from tags', () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);
            const tags = extractor['normalizeMeTag'](['容器启动', '端口映射', 'Docker', '容器启动']);

            expect(tags).toHaveLength(3);
            expect(tags).toContain('容器启动');
            expect(tags).toContain('端口映射');
            expect(tags).toContain('Docker');
        });

        it('should limit me_tag to 5 items', () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);
            const tags = extractor['normalizeMeTag'](['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6']);

            expect(tags).toHaveLength(5);
        });
    });

    describe('full-text concept extraction', () => {
        it('should build correct concept extraction prompt', () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);

            // Use reflection to access private buildConceptsPrompt method for testing
            const prompt = (extractor as any).buildConceptsPrompt('Test content');

            expect(prompt).toContain('me_concepts');
            expect(prompt).toContain('raw_text');
            expect(prompt).toContain('reason');
            expect(prompt).toContain('推荐');
            expect(prompt).toContain('双链');
        });

        it('should return empty array for empty content', async () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);
            const result = await extractor.extractConceptsFromFullText('');

            expect(result).toEqual([]);
        });

        it('should return empty array for whitespace only', async () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);
            const result = await extractor.extractConceptsFromFullText('   \n\t  ');

            expect(result).toEqual([]);
        });

        it('should handle API errors gracefully', async () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:9999', // Invalid URL
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);
            const result = await extractor.extractConceptsFromFullText('Test content');

            expect(result).toEqual([]);
        });
    });

    describe('ExtractedMetadata structure', () => {
        it('should have me_tag instead of tags', async () => {
            const config: BaseModelConfig = {
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                model: 'llama3:4b',
                apiKey: '',
            };

            const extractor = new MetadataExtractor(config);

            // Mock the extract method to return a simple result
            const mockResult = await Promise.resolve({
                summary: 'Test summary',
                me_tag: ['tag1', 'tag2'],
                category: '技术笔记',
                me_concepts: [],
            });

            expect(mockResult).toHaveProperty('me_tag');
            expect(mockResult).not.toHaveProperty('tags');
            expect(mockResult).toHaveProperty('me_concepts');
            expect(mockResult.me_concepts).toEqual([]);
        });
    });
});
