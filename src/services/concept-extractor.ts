/**
 * ConceptExtractor - Extract key concepts from note content using LLM
 * v0.5.0: Extracts concepts that can be used for Graph View connections
 */

import type { ConceptExtractionConfig, DetailedConceptExtraction, ExtractedConcepts, ExtractedConceptDetail } from '@core/types/extraction';
import type { Logger } from '@utils/logger';

export type { ConceptExtractionConfig, DetailedConceptExtraction, ExtractedConcepts, ExtractedConceptDetail };

export class ConceptExtractor {
    private config: ConceptExtractionConfig;
    private logger?: Logger;

    constructor(config: ConceptExtractionConfig, logger?: Logger) {
        this.config = {
            maxConcepts: 5,
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'qwen3:4b',
            ollamaNumPredict: 4096,  // Increased from 2048 to prevent JSON truncation
            openaiModel: 'gpt-4o-mini',
            // v0.6.0 默认值
            focusOnAbstractConcepts: true,      // 默认专注于抽象概念
            minConfidence: 0.7,                 // 默认最小置信度阈值
            excludeGenericConcepts: [],         // 默认不排除任何通用概念
            // v0.8.1 默认值
            language: 'auto',
            ...config,
        };
        this.logger = logger;
    }

    /**
     * Extract concepts from content
     */
    async extract(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<ExtractedConcepts> {
        try {
            this.logger?.debug('Concept extraction started', {
                provider: this.config.provider,
                title,
                contentLength: content.length,
            });
            switch (this.config.provider) {
                case 'ollama':
                    return await this.extractWithOllama(content, title, options);
                case 'openai':
                    return await this.extractWithOpenAI(content, title, options);
                case 'rules':
                default:
                    return this.extractWithRules(content, title);
            }
        } catch (error) {
            console.warn(`Concept extraction failed, falling back to rules:`, error);
            return this.extractWithRules(content, title);
        }
    }

    setLogger(logger?: Logger): void {
        this.logger = logger;
    }

    async extractDetailed(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<DetailedConceptExtraction> {
        try {
            switch (this.config.provider) {
                case 'ollama':
                    return await this.extractWithOllamaDetailed(content, title, options);
                case 'openai':
                    return await this.extractWithOpenAIDetailed(content, title, options);
                case 'rules':
                default:
                    return this.extractWithRulesDetailed(content, title, options);
            }
        } catch (error) {
            console.warn(`Detailed concept extraction failed, falling back to rules:`, error);
            return this.extractWithRulesDetailed(content, title, options);
        }
    }

    /**
     * Extract concepts using Ollama
     */
    private async extractWithOllama(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<ExtractedConcepts> {
        const prompt = this.buildPrompt(content, title, options);
        const raw = await this.requestOllama(prompt);
        this.logger?.debug('Ollama concept RAW response received', {
            responseLength: raw.length,
            responseSample: raw.slice(0, 400),
            fullResponse: raw,  // Log full response for debugging
        });
        const result = this.parseResponse(raw);

        // Ensure confidence is set
        if (result.confidence === 0 && result.concepts.length > 0) {
            result.confidence = 0.9; // Default high confidence for AI extraction
        }

        return result;
    }

    /**
     * Extract concepts using OpenAI
     */
    private async extractWithOpenAI(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<ExtractedConcepts> {
        const prompt = this.buildPrompt(content, title, options);
        const systemPrompt = this.buildSystemPrompt();
        const raw = await this.requestOpenAI(prompt, systemPrompt);
        this.logger?.debug('OpenAI concept response received', {
            responseLength: raw.length,
            responseSample: raw.slice(0, 400),
        });
        const result = this.parseResponse(raw);

        // Ensure confidence is set
        if (result.confidence === 0 && result.concepts.length > 0) {
            result.confidence = 0.9; // Default high confidence for AI extraction
        }

        return result;
    }

    private async extractWithOllamaDetailed(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<DetailedConceptExtraction> {
        this.logger?.debug('Starting Ollama detailed extraction', { title });
        const prompt = this.buildPrompt(content, title, options);
        this.logger?.debug('Prompt built, sending to Ollama', { promptLength: prompt.length });
        const raw = await this.requestOllama(prompt);
        this.logger?.debug('Ollama detailed concept response received', {
            responseLength: raw.length,
            responseSample: raw.slice(0, 400),
        });
        const parsed = this.parseDetailedResponse(raw);
        this.logger?.debug('Parsed detailed response', { conceptCount: parsed.concepts.length });
        return parsed;
    }

    private async extractWithOpenAIDetailed(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): Promise<DetailedConceptExtraction> {
        const prompt = this.buildPrompt(content, title, options);
        const systemPrompt = this.buildSystemPrompt();
        const raw = await this.requestOpenAI(prompt, systemPrompt);
        this.logger?.debug('OpenAI detailed concept response received', {
            responseLength: raw.length,
            responseSample: raw.slice(0, 400),
        });
        return this.parseDetailedResponse(raw);
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

    private async extractWithRulesDetailed(
        content: string,
        title?: string,
        options?: { maxConcepts?: number }
    ): Promise<DetailedConceptExtraction> {
        const fallback = await this.extractWithRules(content, title);
        const maxConcepts = options?.maxConcepts ?? this.config.maxConcepts ?? 5;

        const concepts = fallback.concepts.slice(0, maxConcepts).map((concept, index) => ({
            name: concept,
            confidence: fallback.conceptConfidences?.[index] ?? fallback.confidence ?? 0.6,
            reason: 'Rule-based extraction',
        }));

        return {
            concepts,
            noteType: 'normal',
            skipReason: null,
        };
    }

    /**
     * Build the LLM prompt for concept extraction
     * v0.6.0: Improved prompt for abstract concept extraction
     */
    private buildPrompt(
        content: string,
        title?: string,
        options?: { existingConcepts?: string[]; maxConcepts?: number }
    ): string {
        // Truncate content if too long
        const maxChars = 2000;
        const truncatedContent = content.length > maxChars
            ? content.substring(0, maxChars) + '...'
            : content;
        const maxConcepts = options?.maxConcepts ?? this.config.maxConcepts ?? 5;
        const existingConcepts = options?.existingConcepts?.length
            ? options.existingConcepts.join(', ')
            : 'None';

        // v0.6.0: Different prompt based on focusOnAbstractConcepts
        if (this.config.focusOnAbstractConcepts) {
            const language = this.config.language || 'auto';
            const languageInstruction = language === 'auto'
                ? '4. Return concepts in the note\'s primary language'
                : `4. Return concepts in ${this.getLanguageName(language)} only`;

            return `${this.buildSystemPrompt()}

Extract ${maxConcepts} high-level concepts from this note.

<note_title>
${title || ''}
</note_title>

<note_content>
${truncatedContent}
</note_content>

<existing_concepts>
${existingConcepts}
</existing_concepts>

## Instructions

1. Read the note carefully to understand its main themes
2. Identify ${maxConcepts} concepts at the HIGHEST appropriate abstraction level
3. Check if any extracted concepts match or are aliases of existing concepts
${languageInstruction}

## Response Format

Return a single-line minified JSON object without extra whitespace:
{"concepts":[{"name":"concept name","confidence":0.95,"reason":"why this concept fits"}],"noteType":"article|vocabulary|daily|image-collection|template|normal","skipReason":null}

## Important

- Reason must be <= 120 characters, one sentence, no line breaks
- Output JSON only, no extra text
- Do NOT pretty-print or add extra spaces/newlines`;
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

    private buildSystemPrompt(): string {
        return `You are an expert knowledge analyst specializing in identifying high-level academic and professional concepts.

Your task is to extract STABLE, HIGH-ABSTRACTION concepts that connect notes in a knowledge graph.

## Extraction Principles

1. High Abstraction Level: Extract concepts at the level of:
   - Academic disciplines (cognitive science, distributed systems)
   - Methodologies (first principles, agile development)
   - Theoretical frameworks (complex systems theory)
   - Professional domains (user experience design, data engineering)

2. Stability Over Specificity: Prefer stable, reusable concepts over note-specific terms

3. Connectivity Potential: Choose concepts likely to appear in multiple notes

${this.getLanguageInstruction()}

## DO NOT Extract

- Proper nouns unless they represent concepts
- Temporal references
- Personal references
- Generic terms
- Note-specific details that won't connect to other notes`;
    }

    /**
     * Get language instruction for the system prompt based on config
     * v0.8.1: Language adaptation
     */
    private getLanguageInstruction(): string {
        const language = this.config.language || 'auto';

        if (language === 'auto') {
            return `4. Language Consistency:
   - Use the same language as the note content
   - For mixed-language notes, prefer the dominant language
   - Maintain consistent terminology across extractions`;
        }

        const languageNames: Record<string, string> = {
            'en': 'English',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
        };

        const languageName = languageNames[language] || language;
        return `4. Language Requirement:
   - Extract ALL concepts in ${languageName} only
   - Do not mix languages in the extracted concepts
   - If the note is in a different language, translate concepts to ${languageName}`;
    }

    /**
     * Get human-readable language name
     * v0.8.1: Language adaptation
     */
    private getLanguageName(languageCode: string): string {
        const languageNames: Record<string, string> = {
            'auto': "the note's primary language",
            'en': 'English',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
        };
        return languageNames[languageCode] || languageCode;
    }

    private async requestOllama(prompt: string): Promise<string> {
        this.logger?.debug('Sending Ollama request', {
            url: this.config.ollamaUrl,
            model: this.config.ollamaModel,
            promptLength: prompt.length,
        });

        try {
            // Add timeout using AbortController
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

            const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.ollamaModel,
                    prompt,
                    stream: false,
                    // format: 'json',  // REMOVED: This parameter can cause truncation issues with some models
                    num_predict: this.config.ollamaNumPredict,
                    // Add options to ensure complete output
                    options: {
                        temperature: 0.1,  // Lower temperature for more deterministic output
                        num_ctx: 8192,     // Context window size
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Ollama request failed: ${response.statusText}`);
            }

            const data = await response.json();
            this.logger?.debug('Ollama response received', {
                responseLength: data.response?.length || 0,
            });
            return data.response;
        } catch (error) {
            this.logger?.error('Ollama request error', {
                error: String(error),
                message: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    private async requestOpenAI(prompt: string, systemPrompt: string): Promise<string> {
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
                        content: systemPrompt,
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
        return data.choices[0].message.content;
    }

    /**
     * Parse LLM response to extract concepts
     * v0.6.0: Support for confidence scores and concept filtering
     */
    private parseResponse(response: string): ExtractedConcepts {
        try {
            const parsed = this.safeParseJson(response);

            if (Array.isArray(parsed.concepts)) {
                let concepts: string[] = [];
                let confidences: number[] = [];

                if (parsed.concepts.length > 0 && typeof parsed.concepts[0] === 'object') {
                    concepts = parsed.concepts
                        .map((item: any) => this.normalizeConcept(String(item?.name ?? '')))
                        .filter(Boolean);
                    confidences = parsed.concepts.map((item: any) => Number(item?.confidence) || 0.9);
                } else {
                    concepts = parsed.concepts.map((c: string) => this.normalizeConcept(String(c)));
                    confidences = Array.isArray(parsed.confidences)
                        ? parsed.confidences
                        : concepts.map(() => 0.9);
                }

                // Apply quality filtering
                const filtered = this.filterConceptsByQuality(concepts, confidences);

                return {
                    concepts: filtered.concepts,
                    confidence: filtered.overallConfidence,
                    conceptConfidences: filtered.confidences,
                };
            }
        } catch (error) {
            this.logger?.warn('Failed to parse concept extraction response', {
                error: String(error),
                responseSample: response.slice(0, 400),
            });
            console.warn('Failed to parse concept extraction response:', error);
        }

        return { concepts: [], confidence: 0 };
    }

    private parseDetailedResponse(response: string): DetailedConceptExtraction {
        try {
            const parsed = this.safeParseJson(response);
            const parsedConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];

            const concepts: ExtractedConceptDetail[] = parsedConcepts.map((item: any) => ({
                name: this.normalizeConcept(item?.name || item || ''),
                confidence: Number(item?.confidence ?? 0.9),
                reason: item?.reason || '',
            })).filter((concept: ExtractedConceptDetail) => concept.name.length > 0);

            return {
                concepts,
                noteType: parsed.noteType || 'normal',
                skipReason: parsed.skipReason ?? null,
            };
        } catch (error) {
            this.logger?.warn('Failed to parse detailed concept extraction response', {
                error: String(error),
                responseSample: response.slice(0, 400),
            });
            console.warn('Failed to parse detailed concept extraction response:', error);
        }

        return { concepts: [], noteType: 'normal', skipReason: null };
    }

    private safeParseJson(response: string): any {
        const trimmed = response.trim();

        try {
            return JSON.parse(trimmed);
        } catch (error) {
            const withoutFences = trimmed.replace(/```json\n?|\n?```/g, '').trim();
            const jsonMatch = withoutFences.match(/\{[\s\S]*\}/);
            let candidate = jsonMatch ? jsonMatch[0] : withoutFences;

            // Try to fix truncated JSON by closing unclosed brackets
            // Count opening vs closing braces and arrays
            const openBraces = (candidate.match(/\{/g) || []).length;
            const closeBraces = (candidate.match(/\}/g) || []).length;
            const openArrays = (candidate.match(/\[/g) || []).length;
            const closeArrays = (candidate.match(/\]/g) || []).length;

            // Add missing closing brackets
            if (openBraces > closeBraces) {
                candidate += '}'.repeat(openBraces - closeBraces);
            }
            if (openArrays > closeArrays) {
                candidate += ']'.repeat(openArrays - closeArrays);
            }

            // Fix truncated string values by closing incomplete strings
            // This handles cases like "reason": "incomplete text
            const sanitized = candidate
                // Close incomplete string values before brackets/commas
                .replace(/"([^"]*)$/gm, '"$1"')  // Add closing quote if string is incomplete
                // Remove trailing commas
                .replace(/,\s*([}\]])/g, '$1');

            this.logger?.debug('Attempting sanitized JSON parse', {
                candidateLength: sanitized.length,
                candidateSample: sanitized.slice(0, 400),
            });

            try {
                return JSON.parse(sanitized);
            } catch (retryError) {
                // As a last resort, try to extract partial concepts by regex
                this.logger?.warn('Failed to parse even after sanitization, trying partial extraction', {
                    error: String(retryError),
                });
                return this.extractPartialJson(candidate);
            }
        }
    }

    /**
     * Fallback: Extract partial concepts using regex when JSON parsing completely fails
     * This handles cases where the LLM response is severely truncated
     */
    private extractPartialJson(response: string): any {
        const concepts: any[] = [];

        // Try to extract concept objects using regex
        const conceptRegex = /\{\s*"name":\s*"([^"]+)",\s*"confidence":\s*([\d.]+),\s*"reason":\s*"([^"]*)/g;
        let match;

        while ((match = conceptRegex.exec(response)) !== null) {
            concepts.push({
                name: match[1],
                confidence: parseFloat(match[2]),
                reason: match[3] || 'Extracted from partial response'
            });
        }

        if (concepts.length > 0) {
            this.logger?.info('Extracted partial concepts using regex', {
                count: concepts.length,
            });
            return { concepts };
        }

        // If even regex fails, return empty object
        return { concepts: [] };
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
