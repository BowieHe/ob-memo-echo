/**
 * MetadataExtractor - AI-powered and rule-based metadata extraction
 * Extracts summary, tags, and category from text content
 */

import {
	EMPTY_EXTRACTED_METADATA,
	type ExtractedMetadata,
	type MetadataExtractorConfig,
} from "@core/types/extraction";
import {
	CATEGORY_KEYWORDS,
	VALID_CATEGORIES,
	DEFAULT_CATEGORY,
	METADATA_CONSTRAINTS,
} from "@core/constants";
import { BaseModelConfig } from "@core/types/setting";

export type { ExtractedMetadata, MetadataExtractorConfig };

export class MetadataExtractor {
	private config: BaseModelConfig;

	constructor(config: BaseModelConfig) {
		this.config = config;
	}

	/**
	 * Update configuration dynamically
	 */
	public updateConfig(config: Partial<BaseModelConfig>) {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Extract metadata using AI with fallback to rules (chunk-level)
	 */
	async extract(content: string): Promise<ExtractedMetadata> {
		// Handle empty content
		if (!content || content.trim().length === 0) {
			return EMPTY_EXTRACTED_METADATA;
		}

		try {
			if (this.config.provider === "openai") {
				return await this.extractWithOpenAI(content);
			} else {
				return await this.extractWithOllama(content);
			}
		} catch (error) {
			console.warn(`${this.config.provider} extraction failed`, error);
			return EMPTY_EXTRACTED_METADATA;
		}
	}

	/**
	 * Extract me_concepts (recommended wikilinks) from full text
	 * This is separate from chunk-level metadata extraction
	 */
	async extractConceptsFromFullText(content: string): Promise<Array<{
		raw_text: string;
		reason: string;
	}>> {
		// Handle empty content
		if (!content || content.trim().length === 0) {
			return [];
		}

		console.log('[DEBUG] Extracting me_concepts from full text...');
		console.log(`[DEBUG] Content length: ${content.length} chars`);

		try {
			const me_concepts = this.config.provider === "openai"
				? await this.extractConceptsWithOpenAI(content)
				: await this.extractConceptsWithOllama(content);

			console.log(`[DEBUG] Extracted ${me_concepts.length} me_concepts`);
			me_concepts.forEach((c, i) => {
				console.log(`[DEBUG]   [${i + 1}] ${c.raw_text}: ${c.reason}`);
			});

			return me_concepts;
		} catch (error) {
			console.warn(`${this.config.provider} concept extraction failed`, error);
			return [];
		}
	}

	private async extractWithOllama(
		content: string,
	): Promise<ExtractedMetadata> {
		const prompt = this.buildPrompt(content);
		// Use configured URL or default
		const url = this.config.baseUrl || "http://localhost:11434";
		const model = this.config.model || "llama3:4b";

		const response = await fetch(`${url}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: model,
				prompt: prompt,
				stream: false,
				format: "json",
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
			throw new Error("Invalid JSON response from Ollama");
		}
	}

	private async extractWithOpenAI(
		content: string,
	): Promise<ExtractedMetadata> {
		const prompt = this.buildPrompt(content);
		const url = this.config.baseUrl || "https://api.openai.com/v1";
		const model = this.config.model || "gpt-5-turbo";
		const apiKey = this.config.apiKey || "";

		const response = await fetch(`${url}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{
						role: "system",
						content:
							"You are a helpful assistant that extracts metadata from text. Respond only in JSON.",
					},
					{ role: "user", content: prompt }, // prompt already contains JSON instruction
				],
				temperature: 0.3,
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		try {
			const contentStr = data.choices[0]?.message?.content || "{}";
			// Handle markdown code blocks if present (OpenAI sometimes wraps JSON in ```json ... ```)
			const cleanJson = contentStr.replace(/```json\n?|\n?```/g, "");
			const result = JSON.parse(cleanJson);
			return this.normalizeResult(result);
		} catch (error) {
			throw new Error("Invalid JSON response from OpenAI");
		}
	}

	private normalizeResult(result: any): ExtractedMetadata {
		return {
			summary: result.summary || "",
			me_tag: this.normalizeMeTag(result.tags || result.me_tag || []),
			category: this.normalizeCategory(result.category || "技术笔记"),
			me_concepts: [], // Initialize as empty, will be filled by extractConceptsFromFullText
		};
	}

	// ... (private buildPrompt, extractSummary, etc. - assume they are preserved if I use correct ranges OR I must include them if I replace whole class)
	// To be safe and since I'm refactoring the top half extensively, I'll include the helper methods I'm replacing/using.
	// However, replace_file_content replaces a chunk.
	// I need to be careful not to delete buildPrompt and below if I don't include them.
	// I will include buildPrompt since I use it.
	// I'll check where buildPrompt starts. It was around line 104.
	// My replacement ends at line 276 (file end). So I must include EVERYTHING.

	/**
	 * Build prompt for Ollama/OpenAI (chunk-level)
	 */
	private buildPrompt(content: string): string {
		const truncatedContent =
			content.length > METADATA_CONSTRAINTS.maxSummaryLength
				? content.substring(0, METADATA_CONSTRAINTS.maxSummaryLength) +
					"..."
				: content;

		return `请分析以下 Markdown 段落，提取关键信息。
段落内容：
"""
${truncatedContent}
"""

请以 JSON 格式返回：
{
  "summary": "一句话概括（20-50 字）",
  "me_tag": ["标签1", "标签2", "标签3", "标签4"],
  "category": "技术笔记"
}

要求：
- summary: 简明扼要。
- me_tag: 这段文本的核心内容/主题（2-5个）
- category: 从以下选项中选择：技术笔记、生活日记、读书笔记、想法灵感、工作记录

只返回 JSON，不要其他内容。`;
	}

	/**
	 * Build prompt for concept extraction (full-text)
	 */
	private buildConceptsPrompt(content: string): string {
		const truncatedContent =
			content.length > 2000
				? content.substring(0, 2000) + "..."
				: content;

		return `请分析整篇笔记，推荐其中可能需要建立的外部链接（双链）。
笔记全文：
"""
${truncatedContent}
"""

请以 JSON 格式返回：
{
  "me_concepts": [
    {
      "raw_text": "[[虚拟机]]",
      "reason": "容器技术与虚拟机相关"
    }
  ]
}

只返回 JSON，不要其他内容。`;
	}

	private normalizeMeTag(tags: string[]): string[] {
		if (!Array.isArray(tags)) return [];
		const uniqueTags = Array.from(
			new Set(tags.filter((t) => t && t.trim())),
		);
		return uniqueTags.length < 3 ? uniqueTags : uniqueTags.slice(0, 5);
	}

	private normalizeCategory(category: string): string {
		return VALID_CATEGORIES.includes(category as any)
			? category
			: DEFAULT_CATEGORY;
	}

	/**
	 * Extract me_concepts (recommended wikilinks) with Ollama
	 */
	private async extractConceptsWithOllama(
		content: string,
	): Promise<Array<{ raw_text: string; reason: string }>> {
		const prompt = this.buildConceptsPrompt(content);
		const url = this.config.baseUrl || "http://localhost:11434";
		const model = this.config.model || "llama3:4b";

		console.log(`[DEBUG] Calling Ollama API: ${url}/api/generate, model=${model}`);
		console.log(`[DEBUG] Prompt (first 200 chars): ${prompt.substring(0, 200)}...`);

		const response = await fetch(`${url}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: model,
				prompt: prompt,
				stream: false,
				format: "json",
			}),
		});

		console.log('[DEBUG] Ollama API response received');

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.statusText}`);
		}

		const data = await response.json();
		try {
			const result = JSON.parse(data.response);
			const concepts = result.me_concepts || [];
			console.log(`[DEBUG] Parsed ${concepts.length} concepts from response`);
			return concepts;
		} catch (error) {
			console.warn("Failed to parse concepts from Ollama:", error);
			return [];
		}
	}

	/**
	 * Extract me_concepts (recommended wikilinks) with OpenAI
	 */
	private async extractConceptsWithOpenAI(
		content: string,
	): Promise<Array<{ raw_text: string; reason: string }>> {
		const prompt = this.buildConceptsPrompt(content);
		const url = this.config.baseUrl || "https://api.openai.com/v1";
		const model = this.config.model || "gpt-5-turbo";
		const apiKey = this.config.apiKey || "";

		console.log(`[DEBUG] Calling OpenAI API: ${url}/chat/completions, model=${model}`);
		console.log(`[DEBUG] Prompt (first 200 chars): ${prompt.substring(0, 200)}...`);

		const response = await fetch(`${url}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{
						role: "system",
						content:
							"You are a helpful assistant that extracts metadata from text. Respond only in JSON.",
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.3,
			}),
		});

		console.log('[DEBUG] OpenAI API response received');

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		try {
			const contentStr = data.choices[0]?.message?.content || "{}";
			const cleanJson = contentStr.replace(/```json\n?|\n?```/g, "");
			const result = JSON.parse(cleanJson);
			const concepts = result.me_concepts || [];
			console.log(`[DEBUG] Parsed ${concepts.length} concepts from response`);
			return concepts;
		} catch (error) {
			console.warn("Failed to parse concepts from OpenAI:", error);
			return [];
		}
	}
}
