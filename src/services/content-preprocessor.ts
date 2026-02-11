export interface PreprocessResult {
	cleaned: string;
}

export class ContentPreprocessor {
	preprocess(content: string): PreprocessResult {
		if (!content) {
			return { cleaned: "" };
		}

		const lines = content.split("\n");
		const output: string[] = [];
		let inCodeBlock = false;
		let codeLang = "";
		let inTable = false;

		let i = 0;
		if (lines[0]?.trim() === "---") {
			const endIndex = this.findFrontmatterEnd(lines, 1);
			if (endIndex !== -1) {
				for (let j = 0; j <= endIndex; j++) {
					output.push("[frontmatter]");
				}
				i = endIndex + 1;
			}
		}

		for (; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (this.isCodeFence(trimmed)) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					codeLang = trimmed.replace(/```+/, "").trim();
					output.push(`[code block start: ${codeLang || "text"}]`);
				} else {
					inCodeBlock = false;
					codeLang = "";
					output.push("[code block end]");
				}
				continue;
			}

			if (inCodeBlock) {
				output.push("[code line]");
				continue;
			}

			if (this.isImageLine(trimmed)) {
				output.push("[image]");
				continue;
			}

			if (inTable) {
				if (this.looksLikeTableRow(line)) {
					output.push("[table row]");
					continue;
				}
				inTable = false;
			}

			if (this.startsTable(lines, i)) {
				inTable = true;
				output.push("[table row]");
				continue;
			}

			output.push(line);
		}

		return { cleaned: output.join("\n") };
	}

	private findFrontmatterEnd(lines: string[], startIndex: number): number {
		for (let i = startIndex; i < lines.length; i++) {
			if (lines[i].trim() === "---") {
				return i;
			}
		}
		return -1;
	}

	private isCodeFence(trimmedLine: string): boolean {
		return trimmedLine.startsWith("```");
	}

	private isImageLine(trimmedLine: string): boolean {
		if (!trimmedLine) return false;
		if (trimmedLine.includes("![[") && trimmedLine.includes("]]"))
			return true;
		return /!\[[^\]]*\]\([^\)]+\)/.test(trimmedLine);
	}

	private startsTable(lines: string[], index: number): boolean {
		const line = lines[index];
		const nextLine = lines[index + 1];
		if (!line || !nextLine) return false;
		if (!this.looksLikeTableRow(line)) return false;
		return this.isTableSeparator(nextLine);
	}

	private looksLikeTableRow(line: string): boolean {
		return line.includes("|");
	}

	private isTableSeparator(line: string): boolean {
		return /^\s*\|?\s*[:\- ]+\|?\s*(\|\s*[:\- ]+\s*)*\|?\s*$/.test(line);
	}
}
