/**
 * Chunker - Markdown text chunking with header hierarchy preservation
 * Ported from Rust implementation
 */

export interface Header {
    level: number;
    text: string;
    position: number;
}

export interface ChunkResult {
    content: string;
    headers: Array<{ level: number; text: string }>;
    index: number;
    startPos: number;
    endPos: number;

    // v0.2.0: Enhanced metadata
    start_line: number;      // 1-indexed line number where chunk starts
    end_line: number;        // 1-indexed line number where chunk ends
    header_path: string;     // Formatted header hierarchy (e.g., "# H1 > ## H2")
}

export interface ChunkerConfig {
    minChunkSize?: number;
    maxChunkSize?: number;
    overlapSize?: number;
}

export class Chunker {
    private minChunkSize: number;
    private maxChunkSize: number;
    private overlapSize: number;

    constructor(config: ChunkerConfig = {}) {
        this.minChunkSize = config.minChunkSize || 100;
        this.maxChunkSize = config.maxChunkSize || 800;
        this.overlapSize = config.overlapSize || 50;
    }

    /**
     * Chunk Markdown text into semantic blocks
     */
    chunk(content: string): ChunkResult[] {
        if (!content || content.trim().length === 0) {
            return [];
        }

        const headers = this.extractHeaders(content);

        if (headers.length === 0) {
            // No headers, split by length
            return this.chunkWithoutHeaders(content);
        }

        return this.splitByHeaders(content, headers);
    }

    /**
     * Extract headers from Markdown content
     */
    private extractHeaders(content: string): Header[] {
        const headers: Header[] = [];
        const lines = content.split('\n');
        let position = 0;

        for (const line of lines) {
            const trimmed = line.trimStart();

            if (trimmed.startsWith('#')) {
                // Count header level
                const level = trimmed.match(/^#+/)?.[0].length || 0;

                // Extract header text
                const text = trimmed.slice(level).trim();

                if (text.length > 0) {
                    headers.push({ level, text, position });
                }
            }

            position += line.length + 1; // +1 for newline
        }

        return headers;
    }

    /**
     * Split content by headers
     */
    private splitByHeaders(content: string, headers: Header[]): ChunkResult[] {
        const chunks: ChunkResult[] = [];

        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];

            // Determine end position (next header or end of content)
            const endPos = i < headers.length - 1
                ? headers[i + 1].position
                : content.length;

            // Extract chunk content
            const chunkContent = content.slice(header.position, endPos);

            // Build header path
            const headerPath = this.buildHeaderPath(headers, i);
            const headerPathStr = this.formatHeaderPath(headerPath);

            // Calculate line numbers
            const startLine = this.calculateLineNumber(content, header.position);
            const endLine = this.calculateLineNumber(content, endPos);

            // If content is too long, split further
            if (chunkContent.length > this.maxChunkSize) {
                const parts = this.recursiveSplit(chunkContent, this.maxChunkSize);
                let pos = header.position;

                for (let j = 0; j < parts.length; j++) {
                    const part = parts[j];
                    const end = pos + part.length;

                    const partStartLine = this.calculateLineNumber(content, pos);
                    const partEndLine = this.calculateLineNumber(content, end);

                    chunks.push({
                        content: part,
                        headers: headerPath,
                        index: chunks.length,
                        startPos: pos,
                        endPos: end,
                        start_line: partStartLine,
                        end_line: partEndLine,
                        header_path: headerPathStr,
                    });

                    pos = end;
                }
            } else {
                chunks.push({
                    content: chunkContent,
                    headers: headerPath,
                    index: chunks.length,
                    startPos: header.position,
                    endPos: endPos,
                    start_line: startLine,
                    end_line: endLine,
                    header_path: headerPathStr,
                });
            }
        }

        return chunks;
    }

    /**
     * Build header hierarchy path
     */
    private buildHeaderPath(headers: Header[], currentIndex: number): Array<{ level: number; text: string }> {
        const path: Array<{ level: number; text: string }> = [];
        const stack: Array<{ level: number; text: string }> = [];

        for (let j = 0; j <= currentIndex; j++) {
            const h = headers[j];

            // Remove headers with level >= current level (siblings or deeper)
            while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
                stack.pop();
            }

            // Add current header
            stack.push({ level: h.level, text: h.text });

            // If this is the current header, save the path
            if (j === currentIndex) {
                path.push(...stack);
            }
        }

        return path;
    }

    /**
     * Calculate line number from byte position (v0.2.0)
     */
    private calculateLineNumber(content: string, position: number): number {
        const upToPosition = content.slice(0, position);
        const lines = upToPosition.split('\n');
        return lines.length;
    }

    /**
     * Format header path as string (v0.2.0)
     * Example: [{ level: 1, text: "H1" }, { level: 2, text: "H2" }] => "# H1 > ## H2"
     */
    private formatHeaderPath(headers: Array<{ level: number; text: string }>): string {
        if (!headers || headers.length === 0) {
            return '';
        }

        return headers
            .map(h => '#'.repeat(h.level) + ' ' + h.text)
            .join(' > ');
    }

    /**
     * Chunk content without headers
     */
    private chunkWithoutHeaders(content: string): ChunkResult[] {
        const chunks: ChunkResult[] = [];

        if (content.length <= this.maxChunkSize) {
            const startLine = 1;
            const endLine = content.split('\n').length;

            chunks.push({
                content,
                headers: [],
                index: 0,
                startPos: 0,
                endPos: content.length,
                start_line: startLine,
                end_line: endLine,
                header_path: '',
            });
        } else {
            // Split long content
            const parts = this.recursiveSplit(content, this.maxChunkSize);
            let pos = 0;

            for (const part of parts) {
                const end = pos + part.length;
                const startLine = this.calculateLineNumber(content, pos);
                const endLine = this.calculateLineNumber(content, end);

                chunks.push({
                    content: part,
                    headers: [],
                    index: chunks.length,
                    startPos: pos,
                    endPos: end,
                    start_line: startLine,
                    end_line: endLine,
                    header_path: '',
                });
                pos = end;
            }
        }

        return chunks;
    }

    /**
     * Recursive text splitting (fallback strategy)
     */
    private recursiveSplit(content: string, maxLen: number): string[] {
        const parts: string[] = [];

        if (content.length <= maxLen) {
            parts.push(content);
            return parts;
        }

        // Split by lines first
        const lines = content.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            const lineWithNewline = line + '\n';

            if (currentChunk.length + lineWithNewline.length > maxLen) {
                if (currentChunk.length > 0) {
                    parts.push(currentChunk.trimEnd());
                    currentChunk = '';
                }

                // If single line exceeds maxLen, force split
                if (line.length > maxLen) {
                    const lineParts = this.splitLongLine(line, maxLen);
                    parts.push(...lineParts);
                } else {
                    currentChunk = lineWithNewline;
                }
            } else {
                currentChunk += lineWithNewline;
            }
        }

        if (currentChunk.length > 0) {
            parts.push(currentChunk.trimEnd());
        }

        return parts;
    }

    /**
     * Split a single long line
     */
    private splitLongLine(line: string, maxLen: number): string[] {
        const parts: string[] = [];
        let remaining = line;

        while (remaining.length > maxLen) {
            parts.push(remaining.slice(0, maxLen));
            remaining = remaining.slice(maxLen);
        }

        if (remaining.length > 0) {
            parts.push(remaining);
        }

        return parts;
    }
}
