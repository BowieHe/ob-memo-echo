/**
 * Unit tests for ConceptExtractor v0.6.0
 * Tests abstract concept extraction and quality filtering
 */

import { ConceptExtractor, ConceptExtractionConfig, ExtractedConcepts } from '../services/concept-extractor';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('ConceptExtractor v0.6.0 - Abstract Concept Extraction', () => {
    let extractor: ConceptExtractor;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Configuration Updates', () => {
        // TC-6.1.1: New config fields should be supported
        it('should accept v0.6.0 configuration fields', () => {
            const config: ConceptExtractionConfig = {
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.7,
                excludeGenericConcepts: ['技术开发', '总结', '概述'],
                maxConcepts: 5,
            };

            extractor = new ConceptExtractor(config);
            
            // Verify extractor can be created with new config
            expect(extractor).toBeDefined();
        });

        // TC-6.1.2: Default values should be reasonable
        it('should have sensible defaults for new fields', async () => {
            const config: ConceptExtractionConfig = {
                provider: 'ollama',
            };

            extractor = new ConceptExtractor(config);
            
            // Mock fetch to avoid actual API call
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ 
                    response: JSON.stringify({ 
                        concepts: ['test', 'concept'],
                        confidences: [0.9, 0.8]
                    }) 
                }),
            });

            // Test that extraction works with minimal config
            const content = 'Test content';
            const result = await extractor.extract(content);
            
            expect(result).toBeDefined();
            expect(result.concepts).toBeDefined();
            expect(Array.isArray(result.concepts)).toBe(true);
        });
    });

    describe('Abstract Concept Extraction (Ollama)', () => {
        beforeEach(() => {
            extractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.7,
                ollamaUrl: 'http://localhost:11434',
                ollamaModel: 'qwen2.5:3b',
            });
        });

        // TC-6.2.1: Should extract abstract concepts not specific technologies
        it('should extract abstract concepts like "idempotency" instead of "Kafka"', async () => {
            const mockResponse = {
                concepts: ['幂等性', '事件驱动', '数据一致性'],
                confidences: [0.9, 0.85, 0.8],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const content = `## Kafka消息队列设计
            
Kafka通过消息的幂等性保证来确保消息不会被重复处理。
在分布式系统中，幂等性是非常重要的设计模式。
事件驱动的架构可以帮助系统解耦。`;

            const result = await extractor.extract(content);

            // Should extract abstract concepts
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).toContain('事件驱动');
            expect(result.concepts).toContain('数据一致性');
            
            // Should NOT extract specific technology names
            expect(result.concepts).not.toContain('Kafka');
            expect(result.concepts).not.toContain('消息队列');
        });

        // TC-6.2.2: Should handle mixed Chinese/English concepts
        it('should handle mixed language concepts', async () => {
            const mockResponse = {
                concepts: ['idempotency', 'event-driven', '数据一致性'],
                confidences: [0.9, 0.85, 0.8],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const content = `分布式系统中的幂等性设计非常重要。
Event-driven architecture helps with system decoupling.`;

            const result = await extractor.extract(content);

            expect(result.concepts).toHaveLength(3);
            expect(result.concepts).toContain('idempotency');
            expect(result.concepts).toContain('event-driven');
            expect(result.concepts).toContain('数据一致性');
        });

        // TC-6.2.3: Should filter by confidence threshold
        it('should filter out low-confidence concepts', async () => {
            const mockResponse = {
                concepts: ['幂等性', '事件溯源', '微服务', '技术开发'],
                confidences: [0.9, 0.8, 0.6, 0.5], // 0.6 and 0.5 below 0.7 threshold
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            // Should only include concepts with confidence >= 0.7
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).toContain('事件溯源');
            expect(result.concepts).not.toContain('微服务');
            expect(result.concepts).not.toContain('技术开发');
            expect(result.concepts).toHaveLength(2);
        });
    });

    describe('Generic Concept Filtering', () => {
        beforeEach(() => {
            extractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.5, // Lower threshold for this test
                excludeGenericConcepts: ['技术开发', '总结', '概述', '简介', '设计'],
                ollamaUrl: 'http://localhost:11434',
            });
        });

        // TC-6.3.1: Should exclude configured generic concepts
        it('should exclude configured generic concepts', async () => {
            const mockResponse = {
                concepts: ['幂等性', '事件驱动', '技术开发', '总结'],
                confidences: [0.9, 0.8, 0.7, 0.7],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            // Should exclude generic concepts
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).toContain('事件驱动');
            expect(result.concepts).not.toContain('技术开发');
            expect(result.concepts).not.toContain('总结');
            expect(result.concepts).toHaveLength(2);
        });

        // TC-6.3.2: Should handle case-insensitive matching
        it('should handle case-insensitive generic concept matching', async () => {
            const mockResponse = {
                concepts: ['幂等性', '技术开发', '技术开发模式'],
                confidences: [0.9, 0.8, 0.8],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content');

            // Should exclude all variations containing "技术开发"
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).not.toContain('技术开发');
            expect(result.concepts).not.toContain('技术开发模式');
        });
    });

    describe('Rule-based Fallback', () => {
        beforeEach(() => {
            extractor = new ConceptExtractor({
                provider: 'rules',
                focusOnAbstractConcepts: true,
                minConfidence: 0.5, // Lower threshold for rule-based extraction
            });
        });

        // TC-6.4.1: Rule-based extraction should still work
        it('should extract concepts from headers and bold text', async () => {
            const content = `## 幂等性设计模式
            
在分布式系统中，**幂等性**是非常重要的。
            
### 事件驱动架构

**事件溯源**是一种常见的设计模式。`;

            const result = await extractor.extract(content);
            
            // Should extract from headers and bold text
            // Note: Rule-based extraction normalizes concepts
            expect(result.concepts).toContain('幂等性设计模式');
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).toContain('事件驱动架构');
            expect(result.concepts).toContain('事件溯源');
        });

        // TC-6.4.2: Should have lower confidence for rule-based extraction
        it('should have lower confidence score for rule-based extraction', async () => {
            const content = `## 测试标题`;
            const result = await extractor.extract(content);
            
            expect(result.confidence).toBeLessThan(0.7); // Rule-based should have lower confidence
        });
    });

    describe('Backward Compatibility', () => {
        // TC-6.5.1: Should work with v0.5.0 configuration
        it('should be backward compatible with v0.5.0 config', () => {
            const v0_5_0_Config: ConceptExtractionConfig = {
                provider: 'ollama',
                ollamaUrl: 'http://localhost:11434',
                ollamaModel: 'qwen2.5:3b',
                // No v0.6.0 fields
            };

            extractor = new ConceptExtractor(v0_5_0_Config);
            
            expect(extractor).toBeDefined();
            // Should not throw errors with old config
        });

        // TC-6.5.2: Should maintain existing behavior when new fields not set
        it('should maintain existing extraction behavior', async () => {
            const mockResponse = {
                concepts: ['Kafka', '消息队列', '分布式系统'],
                confidences: [0.9, 0.8, 0.7],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            // Old config without focusOnAbstractConcepts
            extractor = new ConceptExtractor({
                provider: 'ollama',
                ollamaUrl: 'http://localhost:11434',
            });

            const content = `Kafka message queue design`;
            const result = await extractor.extract(content);

            // Without focusOnAbstractConcepts, may extract specific tech names
            expect(result.concepts).toBeDefined();
            expect(Array.isArray(result.concepts)).toBe(true);
        });
    });
});