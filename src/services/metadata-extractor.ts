/**
 * MetadataExtractor - AI-powered and rule-based metadata extraction
 * Extracts summary, tags, and category from text content
 */

export interface ExtractedMetadata {
    summary: string;
    tags: string[];
    category: string;
}

export class MetadataExtractor {
    private ollamaUrl: string;
    private ollamaModel: string;

    constructor(
        ollamaUrl: string = 'http://localhost:11434',
        ollamaModel: string = 'llama3.2:3b'
    ) {
        this.ollamaUrl = ollamaUrl;
        this.ollamaModel = ollamaModel;
    }

    /**
     * Extract metadata using AI (Ollama) with fallback to rules
     */
    async extract(content: string): Promise<ExtractedMetadata> {
        // Handle empty content
        if (!content || content.trim().length === 0) {
            return {
                summary: '',
                tags: [],
                category: '技术笔记',
            };
        }

        try {
            // Try AI extraction first
            return await this.extractWithOllama(content);
        } catch (error) {
            console.warn('Ollama extraction failed, falling back to rules:', error);
            // Fallback to rule-based extraction
            return this.extractWithRules(content);
        }
    }

    /**
     * Extract metadata using Ollama API
     */
    private async extractWithOllama(content: string): Promise<ExtractedMetadata> {
        const prompt = this.buildPrompt(content);

        const response = await fetch(`${this.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.ollamaModel,
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

            // Validate and normalize the response
            return {
                summary: result.summary || '',
                tags: this.normalizeTags(result.tags || []),
                category: this.normalizeCategory(result.category || '技术笔记'),
            };
        } catch (error) {
            throw new Error('Invalid JSON response from Ollama');
        }
    }

    /**
     * Extract metadata using rule-based approach (fallback)
     */
    extractWithRules(content: string): ExtractedMetadata {
        const summary = this.extractSummary(content);
        const tags = this.extractKeywords(content);
        const category = this.inferCategory(content);

        return {
            summary,
            tags,
            category,
        };
    }

    /**
     * Build prompt for Ollama
     */
    private buildPrompt(content: string): string {
        // Truncate very long content
        const maxLength = 2000;
        const truncatedContent = content.length > maxLength
            ? content.substring(0, maxLength) + '...'
            : content;

        return `请分析以下 Markdown 段落，提取关键信息。

段落内容：
"""
${truncatedContent}
"""

请以 JSON 格式返回：
{
  "summary": "一句话概括（20-50 字）",
  "tags": ["标签1", "标签2", "标签3", "标签4"],
  "category": "技术笔记"
}

要求：
- summary 要简洁准确，突出核心观点
- tags 选择最重要的 3-5 个关键词
- category 从以下选项中选择最合适的一个：技术笔记、生活日记、读书笔记、想法灵感、工作记录

只返回 JSON，不要其他内容。`;
    }

    /**
     * Extract summary from content (rule-based)
     */
    private extractSummary(content: string): string {
        // Try to extract first header
        const headerMatch = content.match(/^#+\s+(.+)$/m);
        if (headerMatch) {
            return headerMatch[1].trim();
        }

        // Otherwise, use first sentence
        const firstSentence = content
            .replace(/^#+\s+/gm, '') // Remove headers
            .trim()
            .split(/[。！？.!?]/)[0];

        return firstSentence.substring(0, 100);
    }

    /**
     * Extract keywords using simple frequency analysis
     */
    private extractKeywords(content: string): string[] {
        // Remove markdown syntax
        const cleanContent = content
            .replace(/^#+\s+/gm, '')
            .replace(/[*_`]/g, '')
            .toLowerCase();

        // Split into words
        const words = cleanContent.split(/\s+/);

        // Count word frequency
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

        // Sort by frequency and take top 5
        const sortedWords = Array.from(wordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);

        return sortedWords;
    }

    /**
     * Infer category from content keywords
     */
    private inferCategory(content: string): string {
        const lowerContent = content.toLowerCase();

        // Technical keywords
        const techKeywords = [
            'code', 'function', 'class', 'api', 'bug', 'algorithm', 'data',
            'programming', 'software', 'development', 'typescript', 'javascript',
            'python', 'rust', 'java', 'database', 'server', 'client',
            '代码', '函数', '类', '算法', '数据', '编程', '软件', '开发',
        ];

        // Diary keywords
        const diaryKeywords = [
            '今天', '昨天', '明天', '心情', '感觉', '想到', '觉得',
            'today', 'yesterday', 'feel', 'feeling', 'mood',
        ];

        // Book keywords
        const bookKeywords = [
            '读了', '书中', '作者', '认为', '观点', '章节',
            'book', 'author', 'chapter', 'read', 'reading',
        ];

        // Idea keywords
        const ideaKeywords = [
            '想法', '灵感', '或许', '可以', '尝试', '创意',
            'idea', 'inspiration', 'maybe', 'perhaps', 'creative',
        ];

        // Count matches
        const techCount = techKeywords.filter(kw => lowerContent.includes(kw)).length;
        const diaryCount = diaryKeywords.filter(kw => lowerContent.includes(kw)).length;
        const bookCount = bookKeywords.filter(kw => lowerContent.includes(kw)).length;
        const ideaCount = ideaKeywords.filter(kw => lowerContent.includes(kw)).length;

        // Determine category
        const max = Math.max(techCount, diaryCount, bookCount, ideaCount);

        if (max === 0) return '技术笔记'; // Default
        if (techCount === max) return '技术笔记';
        if (diaryCount === max) return '生活日记';
        if (bookCount === max) return '读书笔记';
        if (ideaCount === max) return '想法灵感';

        return '工作记录';
    }

    /**
     * Normalize tags to 3-5 items
     */
    private normalizeTags(tags: string[]): string[] {
        if (!Array.isArray(tags)) return [];

        // Remove duplicates and empty strings
        const uniqueTags = Array.from(new Set(tags.filter(t => t && t.trim())));

        // Limit to 3-5 tags
        if (uniqueTags.length < 3) {
            return uniqueTags;
        }
        return uniqueTags.slice(0, 5);
    }

    /**
     * Normalize category to valid values
     */
    private normalizeCategory(category: string): string {
        const validCategories = [
            '技术笔记',
            '生活日记',
            '读书笔记',
            '想法灵感',
            '工作记录',
        ];

        if (validCategories.includes(category)) {
            return category;
        }

        // Default
        return '技术笔记';
    }
}
