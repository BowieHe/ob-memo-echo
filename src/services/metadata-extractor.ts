/**
 * MetadataExtractor - AI-powered and rule-based metadata extraction
 * Extracts summary, tags, and category from text content
 */

export interface ExtractedMetadata {
    summary: string;
    tags: string[];
    category: string;
    concepts: string[]; // Abstract concepts (e.g., 'Idempotency', 'Trade-offs')
    thinking_point: string; // Aphorism/Insight (e.g., 'Reliability requires state tracking')
}

/**
 * Configuration for MetadataExtractor
 */
export interface MetadataExtractorConfig {
    enableAi: boolean;
    provider: 'ollama' | 'openai';
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiUrl?: string;
    openaiModel?: string;
    openaiApiKey?: string;
}

export class MetadataExtractor {
    private config: MetadataExtractorConfig;

    constructor(config?: Partial<MetadataExtractorConfig>) {
        this.config = {
            enableAi: true,
            provider: 'ollama',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3.2:3b',
            openaiUrl: 'https://api.openai.com/v1',
            openaiModel: 'gpt-3.5-turbo',
            openaiApiKey: '',
            ...config,
        };
    }

    /**
     * Update configuration dynamically
     */
    public updateConfig(config: Partial<MetadataExtractorConfig>) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Extract metadata using AI with fallback to rules
     */
    async extract(content: string): Promise<ExtractedMetadata> {
        // Handle empty content
        if (!content || content.trim().length === 0) {
            return {
                summary: '',
                tags: [],
                category: '技术笔记',
                concepts: [],
                thinking_point: '',
            };
        }

        // If AI is disabled, skip directly to rules
        if (!this.config.enableAi) {
            return this.extractWithRules(content);
        }

        try {
            if (this.config.provider === 'openai') {
                return await this.extractWithOpenAI(content);
            } else {
                return await this.extractWithOllama(content);
            }
        } catch (error) {
            console.warn(`${this.config.provider} extraction failed, falling back to rules:`, error);
            // Fallback to rule-based extraction
            return this.extractWithRules(content);
        }
    }

    private async extractWithOllama(content: string): Promise<ExtractedMetadata> {
        const prompt = this.buildPrompt(content);
        // Use configured URL or default
        const url = this.config.ollamaUrl || 'http://localhost:11434';
        const model = this.config.ollamaModel || 'llama3.2:3b';

        const response = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
                format: 'json',
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        try {
            const result = JSON.parse(data.response);
            return this.normalizeResult(result);
        } catch (error) {
            throw new Error('Invalid JSON response from Ollama');
        }
    }

    private async extractWithOpenAI(content: string): Promise<ExtractedMetadata> {
        const prompt = this.buildPrompt(content);
        const url = this.config.openaiUrl || 'https://api.openai.com/v1';
        const model = this.config.openaiModel || 'gpt-3.5-turbo';
        const apiKey = this.config.openaiApiKey || '';

        const response = await fetch(`${url}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that extracts metadata from text. Respond only in JSON.' },
                    { role: 'user', content: prompt } // prompt already contains JSON instruction
                ],
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        try {
            const contentStr = data.choices[0]?.message?.content || '{}';
            // Handle markdown code blocks if present (OpenAI sometimes wraps JSON in ```json ... ```)
            const cleanJson = contentStr.replace(/```json\n?|\n?```/g, '');
            const result = JSON.parse(cleanJson);
            return this.normalizeResult(result);
        } catch (error) {
            throw new Error('Invalid JSON response from OpenAI');
        }
    }

    private normalizeResult(result: any): ExtractedMetadata {
        return {
            summary: result.summary || '',
            tags: this.normalizeTags(result.tags || []),
            category: this.normalizeCategory(result.category || '技术笔记'),
            concepts: this.normalizeTags(result.concepts || []), // Reuse tag normalization for concepts
            thinking_point: result.thinking_point || '',
        };
    }

    // Keep helper methods (rule-based)
    extractWithRules(content: string): ExtractedMetadata {
        const summary = this.extractSummary(content);
        const tags = this.extractKeywords(content);
        const category = this.inferCategory(content);

        return { summary, tags, category, concepts: [], thinking_point: '' };
    }

    // ... (private buildPrompt, extractSummary, etc. - assume they are preserved if I use correct ranges OR I must include them if I replace whole class)
    // To be safe and since I'm refactoring the top half extensively, I'll include the helper methods I'm replacing/using.
    // However, replace_file_content replaces a chunk.
    // I need to be careful not to delete buildPrompt and below if I don't include them.
    // I will include buildPrompt since I use it.
    // I'll check where buildPrompt starts. It was around line 104.
    // My replacement ends at line 276 (file end). So I must include EVERYTHING.

    /**
     * Build prompt for Ollama/OpenAI
     */
    private buildPrompt(content: string): string {
        const maxLength = 2000;
        const truncatedContent = content.length > maxLength
            ? content.substring(0, maxLength) + '...'
            : content;

        return `请分析以下 Markdown 段落，提取关键信息。
段落内容：
"""
${truncatedContent}
"""

请分析这段内容，识别其中包含的**核心问题**（如"防止重复处理"）和**技术机制/设计模式**（如"幂等性"）。
请忽略具体的技术名称（如 Kafka, Redis），而是提取通用的计算机科学或工程概念。

请以 JSON 格式返回：
{
  "summary": "一句话概括（20-50 字）",
  "tags": ["标签1", "标签2", "标签3", "标签4"],
  "category": "技术笔记",
  "concepts": ["概念1", "概念2"],
  "thinking_point": "一句简短的箴言或核心洞见（5-15字），概括其背后的思想，类似'几字箴言'。"
}

要求：
- summary: 简明扼要。
- tags: 具体的关键词（如 Rust, Kafka）。
- concepts: 抽象的概念或模式（如 Idempotency, Event Sourcing, CAP Theorem）。即使原文没提到，也要根据原理推断。
- thinking_point: 有深度的总结，用于启发思考。例如："所有权机制是内存安全的基石" 或 "状态一致性需要牺牲可用性"。
- category: 从以下选项中选择：技术笔记、生活日记、读书笔记、想法灵感、工作记录

只返回 JSON，不要其他内容。`;
    }

    private extractSummary(content: string): string {
        const headerMatch = content.match(/^#+\s+(.+)$/m);
        if (headerMatch) return headerMatch[1].trim();
        const firstSentence = content.replace(/^#+\s+/gm, '').trim().split(/[。！？.!?]/)[0];
        return firstSentence.substring(0, 100);
    }

    private extractKeywords(content: string): string[] {
        const cleanContent = content.replace(/^#+\s+/gm, '').replace(/[*_`]/g, '').toLowerCase();
        const words = cleanContent.split(/\s+/);
        const wordCount = new Map<string, number>();
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'should', 'could', 'may', 'might', 'must', 'can',
            '的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一',
            '我', '你', '他', '她', '它', '们', '这', '那', '之', '与', '及',
        ]);
        for (const word of words) {
            if (word.length > 2 && !stopWords.has(word)) {
                wordCount.set(word, (wordCount.get(word) || 0) + 1);
            }
        }
        return Array.from(wordCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);
    }

    private inferCategory(content: string): string {
        const lowerContent = content.toLowerCase();
        const techKeywords = ['code', 'function', 'class', 'api', 'bug', 'algorithm', 'data', 'programming', 'software', 'development', 'typescript', 'javascript', 'python', 'rust', 'java', 'database', 'server', 'client', '代码', '函数', '类', '算法', '数据', '编程', '软件', '开发'];
        const diaryKeywords = ['今天', '昨天', '明天', '心情', '感觉', '想到', '觉得', 'today', 'yesterday', 'feel', 'feeling', 'mood'];
        const bookKeywords = ['读了', '书中', '作者', '认为', '观点', '章节', 'book', 'author', 'chapter', 'read', 'reading'];
        const ideaKeywords = ['想法', '灵感', '或许', '可以', '尝试', '创意', 'idea', 'inspiration', 'maybe', 'perhaps', 'creative'];

        const counts = {
            tech: techKeywords.filter(kw => lowerContent.includes(kw)).length,
            diary: diaryKeywords.filter(kw => lowerContent.includes(kw)).length,
            book: bookKeywords.filter(kw => lowerContent.includes(kw)).length,
            idea: ideaKeywords.filter(kw => lowerContent.includes(kw)).length,
        };
        const max = Math.max(counts.tech, counts.diary, counts.book, counts.idea);
        if (max === 0 || counts.tech === max) return '技术笔记';
        if (counts.diary === max) return '生活日记';
        if (counts.book === max) return '读书笔记';
        if (counts.idea === max) return '想法灵感';
        return '工作记录';
    }

    private normalizeTags(tags: string[]): string[] {
        if (!Array.isArray(tags)) return [];
        const uniqueTags = Array.from(new Set(tags.filter(t => t && t.trim())));
        return uniqueTags.length < 3 ? uniqueTags : uniqueTags.slice(0, 5);
    }

    private normalizeCategory(category: string): string {
        const validCategories = ['技术笔记', '生活日记', '读书笔记', '想法灵感', '工作记录'];
        return validCategories.includes(category) ? category : '技术笔记';
    }
}
