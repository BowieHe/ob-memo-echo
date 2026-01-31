/**
 * ConceptExtractor - Extract key concepts from note content using LLM
 * v0.5.0: Extracts concepts that can be used for Graph View connections
 */

import type { ConceptExtractionConfig, ExtractedConcepts } from '@core/types/extraction';

export type { ConceptExtractionConfig, ExtractedConcepts };

export class ConceptExtractor {
    private config: ConceptExtractionConfig;

    constructor(config: ConceptExtractionConfig) {
        this.config = {
            maxConcepts: 5,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen3:4b',
            openaiModel: 'gpt-4o-mini',
            // v0.6.0 默认值
            focusOnAbstractConcepts: true,      // 默认专注于抽象概念
            minConfidence: 0.7,                 // 默认最小置信度阈值
            excludeGenericConcepts: [],         // 默认不排除任何通用概念
            ...config,
        };
    }

    /**
     * Extract concepts from content
     */
    async extract(content: string, title?: string): Promise<ExtractedConcepts> {
        try {
            switch (this.config.provider) {
                case 'ollama':
                    return await this.extractWithOllama(content, title);
                case 'openai':
                    return await this.extractWithOpenAI(content, title);
                case 'rules':
                default:
                    return this.extractWithRules(content, title);
            }
        } catch (error) {
            console.warn(`Concept extraction failed, falling back to rules:`, error);
            return this.extractWithRules(content, title);
        }
    }

    /**
     * Extract concepts using Ollama
     */
    private async extractWithOllama(content: string, title?: string): Promise<ExtractedConcepts> {
        const prompt = this.buildPrompt(content, title);

        const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.ollamaModel,
                prompt,
                stream: false,
                format: 'json',
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama request failed: ${response.statusText}`);
        }

        const data = await response.json();
        const result = this.parseResponse(data.response);

        // Ensure confidence is set
        if (result.confidence === 0 && result.concepts.length > 0) {
            result.confidence = 0.9; // Default high confidence for AI extraction
        }

        return result;
    }

    /**
     * Extract concepts using OpenAI
     */
    private async extractWithOpenAI(content: string, title?: string): Promise<ExtractedConcepts> {
        const prompt = this.buildPrompt(content, title);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.openaiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.openaiModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a concept extraction assistant. Extract key concepts from notes and return them as JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI request failed: ${response.statusText}`);
        }

        const data = await response.json();
        const result = this.parseResponse(data.choices[0].message.content);

        // Ensure confidence is set
        if (result.confidence === 0 && result.concepts.length > 0) {
            result.confidence = 0.9; // Default high confidence for AI extraction
        }

        return result;
    }

    /**
     * Extract concepts using rule-based extraction (fallback)
     */
    private async extractWithRules(content: string, title?: string): Promise<ExtractedConcepts> {
        const concepts = new Set<string>();

        // Extract from headers
        const headerMatches = content.match(/^#{1,3}\s+(.+)$/gm);
        if (headerMatches) {
            for (const match of headerMatches) {
                const text = match.replace(/^#+\s+/, '').trim();
                if (text.length > 2 && text.length < 30) {
                    concepts.add(this.normalizeConcept(text));
                }
            }
        }

        // Extract from bold text (often key terms)
        const boldMatches = content.match(/\*\*([^*]+)\*\*/g);
        if (boldMatches) {
            for (const match of boldMatches) {
                const text = match.replace(/\*\*/g, '').trim();
                if (text.length > 2 && text.length < 30) {
                    concepts.add(this.normalizeConcept(text));
                }
            }
        }

        // Extract from existing wikilinks
        const wikilinks = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
        if (wikilinks) {
            for (const match of wikilinks) {
                const text = match.replace(/\[\[|\]\]/g, '').split('|')[0].trim();
                // Skip internal paths
                if (!text.includes('/') && text.length > 2 && text.length < 30) {
                    concepts.add(this.normalizeConcept(text));
                }
            }
        }

        // Extract from tags
        const tags = content.match(/#[a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5-_]*/g);
        if (tags) {
            for (const tag of tags) {
                const text = tag.slice(1); // Remove #
                if (text.length > 1 && text.length < 30) {
                    concepts.add(this.normalizeConcept(text));
                }
            }
        }

        // Add title as concept if available
        if (title && title.length > 2 && title.length < 50) {
            // Skip date-based titles
            if (!/^\d{4}-\d{2}-\d{2}/.test(title)) {
                concepts.add(this.normalizeConcept(title));
            }
        }

        // Limit to max concepts
        const conceptArray = Array.from(concepts).slice(0, this.config.maxConcepts || 5);
        const confidences = conceptArray.map(() => 0.6); // Lower confidence for rule-based

        // Apply quality filtering to rule-based extraction too
        const filtered = this.filterConceptsByQuality(conceptArray, confidences);

        return {
            concepts: filtered.concepts,
            confidence: filtered.overallConfidence,
            conceptConfidences: filtered.confidences,
        };
    }

    /**
     * Build the LLM prompt for concept extraction
     * v0.6.0: Improved prompt for abstract concept extraction
     */
    private buildPrompt(content: string, title?: string): string {
        // Truncate content if too long
        const maxChars = 2000;
        const truncatedContent = content.length > maxChars
            ? content.substring(0, maxChars) + '...'
            : content;

        // v0.6.0: Different prompt based on focusOnAbstractConcepts
        if (this.config.focusOnAbstractConcepts) {
            return `提取这段技术内容中的**抽象概念和设计模式**，忽略具体技术名称。

规则：
- 提取3-5个核心抽象概念（如"幂等性"、"事件溯源"、"最终一致性"）
- 避免具体技术名词（如Kafka、Redis、MySQL）
- 优先提取计算机科学、软件工程通用概念
- 概念应为名词或名词短语，1-3个单词
- 为每个概念提供置信度评分（0-1）
- 支持中英文概念混合

${title ? `标题: ${title}\n\n` : ''}内容:
${truncatedContent}

返回JSON格式：{"concepts": ["概念1", "概念2"], "confidences": [0.9, 0.8]}`;
        } else {
            // Original prompt for backward compatibility
            return `Extract key concepts from this note. Return as JSON: {"concepts": ["concept1", "concept2", ...]}

Rules:
- Extract 3-5 main concepts that represent core topics
- Concepts should be nouns or noun phrases
- Keep concepts concise (1-3 words each)
- Prefer specific terms over generic ones
- Support both English and Chinese concepts

${title ? `Title: ${title}\n\n` : ''}Content:
${truncatedContent}

JSON response:`;
        }
    }

    /**
     * Parse LLM response to extract concepts
     * v0.6.0: Support for confidence scores and concept filtering
     */
    private parseResponse(response: string): ExtractedConcepts {
        try {
            const parsed = JSON.parse(response);

            if (Array.isArray(parsed.concepts)) {
                const concepts = parsed.concepts.map((c: string) => this.normalizeConcept(c));
                const confidences = Array.isArray(parsed.confidences)
                    ? parsed.confidences
                    : concepts.map(() => 0.9); // Default confidence if not provided

                // Apply quality filtering
                const filtered = this.filterConceptsByQuality(concepts, confidences);

                return {
                    concepts: filtered.concepts,
                    confidence: filtered.overallConfidence,
                    conceptConfidences: filtered.confidences,
                };
            }
        } catch (error) {
            console.error('Failed to parse concept extraction response:', error);
        }

        return { concepts: [], confidence: 0 };
    }

    /**
     * Filter concepts by quality (confidence threshold and generic concept exclusion)
     */
    private filterConceptsByQuality(concepts: string[], confidences: number[]): {
        concepts: string[];
        confidences: number[];
        overallConfidence: number;
    } {
        if (concepts.length === 0) {
            return { concepts: [], confidences: [], overallConfidence: 0 };
        }

        const minConfidence = this.config.minConfidence || 0.7;
        const excludeGenericConcepts = this.config.excludeGenericConcepts || [];

        const filteredConcepts: string[] = [];
        const filteredConfidences: number[] = [];

        for (let i = 0; i < concepts.length; i++) {
            const concept = concepts[i];
            const confidence = confidences[i];

            // 1. Check confidence threshold
            if (confidence < minConfidence) {
                continue;
            }

            // 2. Check for generic concepts to exclude
            const isGeneric = excludeGenericConcepts.some(generic =>
                concept.toLowerCase().includes(generic.toLowerCase())
            );
            if (isGeneric) {
                continue;
            }

            // 3. Check concept length and validity
            if (concept.length < 2 || concept.length > 30) {
                continue;
            }

            filteredConcepts.push(concept);
            filteredConfidences.push(confidence);
        }

        // Limit to max concepts
        const maxConcepts = this.config.maxConcepts || 5;
        const finalConcepts = filteredConcepts.slice(0, maxConcepts);
        const finalConfidences = filteredConfidences.slice(0, maxConcepts);

        // Calculate overall confidence (average of filtered concepts)
        const overallConfidence = finalConfidences.length > 0
            ? finalConfidences.reduce((sum, conf) => sum + conf, 0) / finalConfidences.length
            : 0.6; // Default confidence for rule-based or empty

        return {
            concepts: finalConcepts,
            confidences: finalConfidences,
            overallConfidence,
        };
    }

    /**
     * Normalize a concept string
     */
    private normalizeConcept(text: string): string {
        return text
            .trim()
            .replace(/^[#\-*]+/, '') // Remove leading markdown chars
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ConceptExtractionConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
