/**
 * Unit tests for MetadataExtractor (v0.2.0)
 * Tests AI-powered and rule-based metadata extraction
 */

import { MetadataExtractor, ExtractedMetadata } from '../services/metadata-extractor';

// Mock fetch for Ollama API
global.fetch = jest.fn();

describe('MetadataExtractor (v0.2.0)', () => {
    let extractor: MetadataExtractor;

    beforeEach(() => {
        extractor = new MetadataExtractor('http://localhost:11434', 'llama3.2:3b');
        jest.clearAllMocks();
    });

    describe('AI-Powered Extraction (Ollama)', () => {
        // TC-2.1: Extract metadata using Ollama (mocked)
        it('should extract metadata using Ollama API', async () => {
            const mockResponse = {
                summary: 'Introduction to Rust ownership system and memory safety',
                tags: ['rust', 'ownership', 'memory-safety', 'programming'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const content = `## Rust Ownership System
            
Rust's ownership system is its most distinctive feature. Every value has a single owner,
and when the owner goes out of scope, the value is automatically dropped. This design
ensures memory safety without garbage collection.`;

            const result = await extractor.extract(content);

            expect(result.summary).toBe('Introduction to Rust ownership system and memory safety');
            expect(result.tags).toContain('rust');
            expect(result.tags).toContain('ownership');
            expect(result.category).toBe('技术笔记');
        });

        // TC-2.4: Validate summary length (20-40 chars for Chinese, more for English)
        it('should generate summary within reasonable length', async () => {
            const mockResponse = {
                summary: 'This is a test summary about Rust programming',
                tags: ['rust', 'test'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            expect(result.summary.length).toBeGreaterThan(10);
            expect(result.summary.length).toBeLessThan(200); // Reasonable upper bound
        });

        // TC-2.5: Validate tags count (3-5 tags)
        it('should generate 3-5 tags', async () => {
            const mockResponse = {
                summary: 'Test summary',
                tags: ['tag1', 'tag2', 'tag3', 'tag4'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            expect(result.tags.length).toBeGreaterThanOrEqual(3);
            expect(result.tags.length).toBeLessThanOrEqual(5);
        });

        // TC-2.6: Validate category is one of predefined values
        it('should return valid category', async () => {
            const validCategories = ['技术笔记', '生活日记', '读书笔记', '想法灵感', '工作记录'];

            const mockResponse = {
                summary: 'Test summary',
                tags: ['test'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            expect(validCategories).toContain(result.category);
        });

        // TC-2.7: Performance - extraction < 2 seconds
        it('should complete extraction within 2 seconds', async () => {
            const mockResponse = {
                summary: 'Fast extraction test',
                tags: ['fast', 'test'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const startTime = Date.now();
            await extractor.extract('Test content');
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(2000);
        });
    });

    describe('Rule-Based Fallback', () => {
        // TC-2.2: Extract metadata using rules (fallback)
        it('should extract metadata using rules when Ollama unavailable', () => {
            const content = `# Rust Programming

Rust is a systems programming language that focuses on safety, speed, and concurrency.
It achieves memory safety without garbage collection. Rust ownership system prevents
data races at compile time.`;

            const result = extractor.extractWithRules(content);

            expect(result.summary).toBeTruthy();
            expect(result.summary.length).toBeGreaterThan(0);
            expect(result.tags).toBeTruthy();
            expect(result.tags.length).toBeGreaterThan(0);
            expect(result.category).toBeTruthy();
        });

        it('should extract title as summary if available', () => {
            const content = `# Rust Ownership System

Content here...`;

            const result = extractor.extractWithRules(content);

            expect(result.summary).toContain('Rust Ownership System');
        });

        it('should infer category from keywords', () => {
            const techContent = 'This code implements a function to parse JSON data.';
            const techResult = extractor.extractWithRules(techContent);
            expect(techResult.category).toBe('技术笔记');

            const diaryContent = '今天心情很好，天气也不错。';
            const diaryResult = extractor.extractWithRules(diaryContent);
            expect(diaryResult.category).toBe('生活日记');

            const bookContent = '读了这本书，作者认为创新很重要。';
            const bookResult = extractor.extractWithRules(bookContent);
            expect(bookResult.category).toBe('读书笔记');
        });

        it('should extract keywords as tags', () => {
            const content = `Rust programming language memory safety ownership system`;

            const result = extractor.extractWithRules(content);

            expect(result.tags.length).toBeGreaterThan(0);
            // Should contain some of the important words
            const allTags = result.tags.join(' ').toLowerCase();
            expect(
                allTags.includes('rust') ||
                allTags.includes('programming') ||
                allTags.includes('memory') ||
                allTags.includes('ownership')
            ).toBe(true);
        });
    });

    describe('Error Handling', () => {
        // TC-2.3: Handle Ollama API errors gracefully
        it('should fallback to rules when Ollama API fails', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

            const content = '# Test Content\n\nThis is a test.';
            const result = await extractor.extract(content);

            // Should still return valid metadata using rules
            expect(result.summary).toBeTruthy();
            expect(result.tags).toBeTruthy();
            expect(result.category).toBeTruthy();
        });

        it('should handle invalid JSON response from Ollama', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: 'invalid json{' }),
            });

            const result = await extractor.extract('Test content');

            // Should fallback to rules
            expect(result.summary).toBeTruthy();
            expect(result.tags).toBeTruthy();
        });

        it('should handle empty content gracefully', async () => {
            const result = await extractor.extract('');

            expect(result.summary).toBe('');
            expect(result.tags).toEqual([]);
            expect(result.category).toBe('技术笔记'); // Default
        });

        it('should handle very long content', async () => {
            const longContent = 'word '.repeat(10000); // 50000 chars

            const mockResponse = {
                summary: 'Summary of long content',
                tags: ['long', 'content'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract(longContent);

            expect(result.summary).toBeTruthy();
            expect(result.tags.length).toBeGreaterThan(0);
        });
    });

    describe('Configuration', () => {
        it('should use custom Ollama URL', async () => {
            const customExtractor = new MetadataExtractor('http://custom:11434', 'llama3.2:3b');

            const mockResponse = {
                summary: 'Test',
                tags: ['test'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            await customExtractor.extract('Test');

            expect(global.fetch).toHaveBeenCalledWith(
                'http://custom:11434/api/generate',
                expect.any(Object)
            );
        });

        it('should use custom model name', async () => {
            const customExtractor = new MetadataExtractor('http://localhost:11434', 'custom-model');

            const mockResponse = {
                summary: 'Test',
                tags: ['test'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            await customExtractor.extract('Test');

            const callArgs = (global.fetch as jest.Mock).mock.calls[0];
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.model).toBe('custom-model');
        });
    });

    describe('Integration', () => {
        it('should work with real-world content', async () => {
            const realContent = `## TypeScript 类型系统

TypeScript 的类型系统非常强大，支持泛型、联合类型、交叉类型等高级特性。
通过类型推断，TypeScript 可以在编译时捕获很多潜在的错误。
这使得大型项目的维护变得更加容易。`;

            const mockResponse = {
                summary: '介绍 TypeScript 类型系统的强大特性和优势',
                tags: ['typescript', '类型系统', '泛型', '编译时检查'],
                category: '技术笔记',
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract(realContent);

            expect(result.summary).toBeTruthy();
            expect(result.tags.length).toBeGreaterThanOrEqual(3);
            expect(result.category).toBe('技术笔记');
        });
    });
});
