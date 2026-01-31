/**
 * Integration tests for ConceptExtractor v0.6.0
 * Tests real-world scenarios and integration with other components
 */

import { ConceptExtractor, ConceptExtractionConfig } from '@services/concept-extractor';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('ConceptExtractor v0.6.0 - Integration Tests', () => {
    let extractor: ConceptExtractor;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Real-world Technical Notes', () => {
        beforeEach(() => {
            extractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.7,
                excludeGenericConcepts: ['技术开发', '总结', '概述'],
                ollamaUrl: 'http://localhost:11434',
                ollamaModel: 'qwen2.5:3b',
            });
        });

        // TC-6.6.1: Kafka technical note should extract abstract concepts
        it('should extract abstract concepts from Kafka technical note', async () => {
            const mockResponse = {
                concepts: ['幂等性', '事件驱动', '数据一致性', '分布式系统'],
                confidences: [0.9, 0.85, 0.8, 0.75],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const content = `# Kafka 消息队列设计

## 核心特性

### 幂等性保证
Kafka 通过消息的幂等性保证来确保消息不会被重复处理。在分布式系统中，幂等性是非常重要的设计模式。

### 事件驱动架构
Kafka 采用事件驱动架构，帮助系统解耦，提高可扩展性。

### 数据一致性
通过副本机制和 ISR 集合保证数据的一致性。`;

            const result = await extractor.extract(content, 'Kafka 消息队列设计');

            // Should extract abstract concepts, not specific tech names
            expect(result.concepts).toContain('幂等性');
            expect(result.concepts).toContain('事件驱动');
            expect(result.concepts).toContain('数据一致性');
            expect(result.concepts).toContain('分布式系统');
            
            // Should NOT extract specific technology names
            expect(result.concepts).not.toContain('Kafka');
            expect(result.concepts).not.toContain('消息队列');
            expect(result.concepts).not.toContain('ISR');
            
            // Should have confidence scores
            expect(result.conceptConfidences).toBeDefined();
            expect(result.conceptConfidences?.length).toBe(result.concepts.length);
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        // TC-6.6.2: Microservices architecture note
        it('should extract abstract concepts from microservices note', async () => {
            const mockResponse = {
                concepts: ['服务发现', '负载均衡', '容错性', 'API网关'],
                confidences: [0.9, 0.85, 0.8, 0.75],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const content = `# 微服务架构设计

## 核心组件

### 服务发现
使用 Consul 或 Eureka 进行服务发现，实现服务的自动注册和发现。

### 负载均衡
通过 Ribbon 或客户端负载均衡实现请求的分发。

### 容错性设计
使用 Hystrix 实现熔断和降级，提高系统容错能力。

### API 网关
Spring Cloud Gateway 作为 API 网关，统一入口和路由管理。`;

            const result = await extractor.extract(content, '微服务架构设计');

            // Should extract abstract concepts
            expect(result.concepts).toContain('服务发现');
            expect(result.concepts).toContain('负载均衡');
            expect(result.concepts).toContain('容错性');
            expect(result.concepts).toContain('API网关');
            
            // Should NOT extract specific technology names
            expect(result.concepts).not.toContain('Consul');
            expect(result.concepts).not.toContain('Eureka');
            expect(result.concepts).not.toContain('Ribbon');
            expect(result.concepts).not.toContain('Hystrix');
            expect(result.concepts).not.toContain('Spring Cloud Gateway');
        });
    });

    describe('Configuration Switching', () => {
        // TC-6.6.3: Switch between abstract and specific concept extraction
        it('should switch between abstract and specific concept extraction', async () => {
            // First, extract with abstract focus
            const abstractExtractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.7,
                ollamaUrl: 'http://localhost:11434',
            });

            const abstractMockResponse = {
                concepts: ['幂等性', '事件驱动'],
                confidences: [0.9, 0.8],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(abstractMockResponse) }),
            });

            const abstractResult = await abstractExtractor.extract('Kafka design');

            // Then, extract without abstract focus
            const specificExtractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: false,
                minConfidence: 0.7,
                ollamaUrl: 'http://localhost:11434',
            });

            const specificMockResponse = {
                concepts: ['Kafka', '消息队列', '分布式系统'],
                confidences: [0.9, 0.8, 0.7],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(specificMockResponse) }),
            });

            const specificResult = await specificExtractor.extract('Kafka design');

            // Results should be different based on configuration
            expect(abstractResult.concepts).not.toEqual(specificResult.concepts);
            
            // Abstract extractor should not include specific tech names
            expect(abstractResult.concepts).not.toContain('Kafka');
            
            // Specific extractor may include tech names
            // (This depends on the mock response we set up)
        });
    });

    describe('Performance and Limits', () => {
        beforeEach(() => {
            extractor = new ConceptExtractor({
                provider: 'ollama',
                focusOnAbstractConcepts: true,
                minConfidence: 0.7,
                maxConcepts: 3, // Limit to 3 concepts
                ollamaUrl: 'http://localhost:11434',
            });
        });

        // TC-6.6.4: Should respect maxConcepts limit
        it('should respect maxConcepts configuration', async () => {
            const mockResponse = {
                concepts: ['概念1', '概念2', '概念3', '概念4', '概念5'],
                confidences: [0.9, 0.85, 0.8, 0.75, 0.7],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('Test content with many concepts');

            // Should be limited to maxConcepts (3)
            expect(result.concepts.length).toBeLessThanOrEqual(3);
            expect(result.concepts).toHaveLength(3);
            
            // Should include highest confidence concepts
            expect(result.concepts).toContain('概念1');
            expect(result.concepts).toContain('概念2');
            expect(result.concepts).toContain('概念3');
            expect(result.concepts).not.toContain('概念4');
            expect(result.concepts).not.toContain('概念5');
        });

        // TC-6.6.5: Should handle empty content
        it('should handle empty content gracefully', async () => {
            const mockResponse = {
                concepts: [],
                confidences: [],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ response: JSON.stringify(mockResponse) }),
            });

            const result = await extractor.extract('');

            expect(result.concepts).toEqual([]);
            expect(result.confidence).toBe(0);
            expect(result.conceptConfidences).toEqual([]);
        });
    });
});