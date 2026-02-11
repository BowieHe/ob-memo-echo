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
	 * Extract metadata using AI with fallback to rules
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
			tags: this.normalizeTags(result.tags || []),
			category: this.normalizeCategory(result.category || "技术笔记"),
			concepts: this.normalizeConcepts(result.concepts || []),
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
	 * Build prompt for Ollama/OpenAI
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

请分析这段内容，识别其中包含的**核心问题**（如"防止重复处理"）和**技术机制/设计模式**（如"幂等性"）。
请忽略具体的技术名称（如 Kafka, Redis），而是提取通用的计算机科学或工程概念。

请以 JSON 格式返回：
{
  "summary": "一句话概括（20-50 字）",
    "tags": ["标签1", "标签2", "标签3", "标签4"],
  "category": "技术笔记",
    "concepts": [{"name": "概念1", "confidence": 0.9}, {"name": "概念2", "confidence": 0.8}]
}

要求：
- summary: 简明扼要。
- tags: 具体的关键词（如 Rust, Kafka）。
- concepts: 抽象的概念或模式（如 Idempotency, Event Sourcing, CAP Theorem），并给出 0-1 的置信度。
- category: 从以下选项中选择：技术笔记、生活日记、读书笔记、想法灵感、工作记录

只返回 JSON，不要其他内容。`;
	}

	private normalizeTags(tags: string[]): string[] {
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

	private normalizeConcepts(
		concepts: any[],
	): Array<{ name: string; confidence: number }> {
		if (!Array.isArray(concepts)) return [];

		const normalized = concepts
			.map((item) => {
				if (typeof item === "string") {
					return { name: item.trim(), confidence: 0.7 };
				}
				if (item && typeof item.name === "string") {
					const confidence = Number(item.confidence);
					return {
						name: item.name.trim(),
						confidence: Number.isFinite(confidence)
							? confidence
							: 0.7,
					};
				}
				return null;
			})
			.filter(
				(item): item is { name: string; confidence: number } =>
					!!item && !!item.name,
			);

		const unique = new Map<string, { name: string; confidence: number }>();
		for (const item of normalized) {
			const key = item.name.toLowerCase();
			const existing = unique.get(key);
			if (!existing || existing.confidence < item.confidence) {
				unique.set(key, item);
			}
		}

		return Array.from(unique.values()).slice(
			0,
			METADATA_CONSTRAINTS.maxKeywords,
		);
	}
}
