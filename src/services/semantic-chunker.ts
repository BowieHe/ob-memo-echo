import { BaseModelConfig } from "@core/types/setting";
import type { SemanticChunk } from "@core/types/indexing";
import { Chunker } from "./chunker";

export class SemanticChunker {
	private config: BaseModelConfig;
	private fallbackChunker: Chunker;

	constructor(config: BaseModelConfig, fallbackChunker: Chunker) {
		this.config = config;
		this.fallbackChunker = fallbackChunker;
	}

	public updateConfig(config: Partial<BaseModelConfig>) {
		this.config = { ...this.config, ...config };
	}

	async chunk(content: string, title: string): Promise<SemanticChunk[]> {
		if (!content || content.trim().length === 0) {
			return [];
		}

		const lineCount = content.split("\n").length;
		const numberedContent = this.addLineNumbers(content);

		try {
			const result =
				this.config.provider === "openai"
					? await this.extractWithOpenAI(numberedContent, title)
					: await this.extractWithOllama(numberedContent, title);

			const normalized = this.normalizeChunks(result, lineCount);
			if (normalized.length > 0) {
				return normalized;
			}
		} catch (error) {
			console.warn(
				"[MemoEcho] Semantic chunking failed, falling back to rule-based chunker",
				error,
			);
		}

		return this.fallbackToRuleChunker(content);
	}

	private async extractWithOllama(
		numberedContent: string,
		title: string,
	): Promise<any> {
		const prompt = this.buildPrompt(numberedContent, title);
		const url = this.config.baseUrl || "http://localhost:11434";
		const model = this.config.model || "llama3:4b";

		const response = await fetch(`${url}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt,
				stream: false,
				format: "json",
			}),
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.statusText}`);
		}

		const data = await response.json();
		return JSON.parse(data.response || "{}");
	}

	private async extractWithOpenAI(
		numberedContent: string,
		title: string,
	): Promise<any> {
		const prompt = this.buildPrompt(numberedContent, title);
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
				model,
				messages: [
					{
						role: "system",
						content:
							"You are a helpful assistant that splits text into semantic chunks. Respond only in JSON.",
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.2,
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		const contentStr = data.choices[0]?.message?.content || "{}";
		const cleanJson = contentStr.replace(/```json\n?|\n?```/g, "");
		return JSON.parse(cleanJson);
	}

	private buildPrompt(numberedContent: string, title: string): string {
		return `你是一个擅长语义分块的助手。请将下述笔记按语义主题切分成若干段落。

要求：
- 只做分块，不做总结，不生成标签
- 每个分块返回 title, startLine, endLine（行号为 1-based）
- startLine/endLine 必须对应下面内容中的行号
- 分块之间不能重叠，也不能留空白行
- 输出 JSON，不要其他内容

返回格式：
{
  "chunks": [
    {"title": "段落主题", "startLine": 1, "endLine": 20}
  ]
}

笔记标题：${title}

带行号内容：
${numberedContent}`;
	}

	private normalizeChunks(result: any, totalLines: number): SemanticChunk[] {
		const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
		const normalized: SemanticChunk[] = [];

		for (const chunk of chunks) {
			const startLine = Number(chunk.startLine ?? chunk.start_line);
			const endLine = Number(chunk.endLine ?? chunk.end_line);
			if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
				continue;
			}
			const clampedStart = Math.max(1, Math.min(totalLines, startLine));
			const clampedEnd = Math.max(
				clampedStart,
				Math.min(totalLines, endLine),
			);
			normalized.push({
				title: String(chunk.title || "").trim() || "未命名段落",
				start_line: clampedStart,
				end_line: clampedEnd,
				header_path: String(chunk.title || "").trim(),
			});
		}

		normalized.sort((a, b) => a.start_line - b.start_line);
		return this.mergeOverlaps(normalized);
	}

	private mergeOverlaps(chunks: SemanticChunk[]): SemanticChunk[] {
		if (chunks.length === 0) return [];
		const merged: SemanticChunk[] = [];
		let current = { ...chunks[0] };

		for (let i = 1; i < chunks.length; i++) {
			const next = chunks[i];
			if (next.start_line <= current.end_line) {
				current.end_line = Math.max(current.end_line, next.end_line);
				if (!current.title && next.title) {
					current.title = next.title;
				}
			} else {
				merged.push(current);
				current = { ...next };
			}
		}

		merged.push(current);
		return merged;
	}

	private fallbackToRuleChunker(content: string): SemanticChunk[] {
		const chunks = this.fallbackChunker.chunk(content);
		return chunks.map((chunk) => ({
			title: chunk.header_path || "未命名段落",
			start_line: chunk.start_line,
			end_line: chunk.end_line,
			header_path: chunk.header_path,
		}));
	}

	private addLineNumbers(content: string): string {
		const lines = content.split("\n");
		const width = String(lines.length).length;
		return lines
			.map(
				(line, index) =>
					`${String(index + 1).padStart(width, "0")}: ${line}`,
			)
			.join("\n");
	}
}
