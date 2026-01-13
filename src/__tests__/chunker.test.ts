/**
 * Unit tests for Chunker
 * Tests Markdown text chunking with header hierarchy preservation
 */

import { Chunker, ChunkResult } from '../services/chunker';

describe('Chunker', () => {
    let chunker: Chunker;

    beforeEach(() => {
        chunker = new Chunker({
            minChunkSize: 100,
            maxChunkSize: 500,
            overlapSize: 50,
        });
    });

    describe('Basic Chunking', () => {
        it('should chunk simple text', () => {
            const text = 'This is a simple paragraph. '.repeat(20);
            const chunks = chunker.chunk(text);

            expect(chunks.length).toBeGreaterThan(0);
            chunks.forEach(chunk => {
                expect(chunk.content.length).toBeGreaterThan(0);
                expect(chunk.content.length).toBeLessThanOrEqual(500);
            });
        });

        it('should preserve header hierarchy', () => {
            const text = `# Main Title

This is the introduction.

## Section 1

Content for section 1.

### Subsection 1.1

More detailed content here.

## Section 2

Content for section 2.`;

            const chunks = chunker.chunk(text);

            // Check that chunks have header paths
            const chunksWithHeaders = chunks.filter(c => c.headers && c.headers.length > 0);
            expect(chunksWithHeaders.length).toBeGreaterThan(0);
        });

        it('should handle empty text', () => {
            const chunks = chunker.chunk('');
            expect(chunks).toHaveLength(0);
        });

        it('should handle text without headers', () => {
            const text = 'Just some plain text without any headers. '.repeat(10);
            const chunks = chunker.chunk(text);

            expect(chunks.length).toBeGreaterThan(0);
            chunks.forEach(chunk => {
                expect(chunk.headers).toEqual([]);
            });
        });
    });

    describe('Header Hierarchy', () => {
        it('should extract header hierarchy correctly', () => {
            const text = `# H1 Title

Content under H1.

## H2 Section

Content under H2.

### H3 Subsection

Content under H3.`;

            const chunks = chunker.chunk(text);

            // Find chunk under H3
            const h3Chunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'H3 Subsection')
            );

            expect(h3Chunk).toBeDefined();
            expect(h3Chunk?.headers).toHaveLength(3);
            expect(h3Chunk?.headers?.[0].text).toBe('H1 Title');
            expect(h3Chunk?.headers?.[1].text).toBe('H2 Section');
            expect(h3Chunk?.headers?.[2].text).toBe('H3 Subsection');
        });

        it('should handle header level resets', () => {
            const text = `# H1

## H2

### H3

## Another H2

Content here.`;

            const chunks = chunker.chunk(text);

            // Find chunk under "Another H2"
            const chunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'Another H2')
            );

            expect(chunk).toBeDefined();
            expect(chunk?.headers).toHaveLength(2);
            expect(chunk?.headers?.[0].text).toBe('H1');
            expect(chunk?.headers?.[1].text).toBe('Another H2');
        });
    });

    describe('Chunk Size Control', () => {
        it('should respect max chunk size', () => {
            const text = 'A'.repeat(1000);
            const chunks = chunker.chunk(text);

            chunks.forEach(chunk => {
                expect(chunk.content.length).toBeLessThanOrEqual(500);
            });
        });

        it('should split long paragraphs', () => {
            const longParagraph = 'This is a very long paragraph. '.repeat(50);
            const chunks = chunker.chunk(longParagraph);

            expect(chunks.length).toBeGreaterThan(1);
        });

        it('should add overlap between chunks', () => {
            const text = 'Sentence one. Sentence two. Sentence three. '.repeat(20);
            const chunks = chunker.chunk(text);

            if (chunks.length > 1) {
                // Check that consecutive chunks have some overlap
                for (let i = 0; i < chunks.length - 1; i++) {
                    const currentEnd = chunks[i].content.slice(-50);
                    const nextStart = chunks[i + 1].content.slice(0, 50);

                    // There should be some common words
                    const currentWords = currentEnd.split(/\s+/);
                    const nextWords = nextStart.split(/\s+/);
                    const overlap = currentWords.filter(w => nextWords.includes(w));

                    expect(overlap.length).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Code Blocks', () => {
        it('should preserve code blocks', () => {
            const text = `# Title

Some text.

\`\`\`javascript
function hello() {
  console.log("Hello");
}
\`\`\`

More text.`;

            const chunks = chunker.chunk(text);

            // Find chunk with code block
            const codeChunk = chunks.find(c => c.content.includes('```'));
            expect(codeChunk).toBeDefined();
            expect(codeChunk?.content).toContain('function hello()');
        });

        it('should not split code blocks', () => {
            const text = `\`\`\`python
${'line\\n'.repeat(100)}
\`\`\``;

            const chunks = chunker.chunk(text);

            // Code block should be in one chunk (or split intelligently)
            const codeChunks = chunks.filter(c => c.content.includes('```'));
            expect(codeChunks.length).toBeGreaterThan(0);
        });
    });

    describe('Metadata', () => {
        it('should include chunk index', () => {
            const text = 'Text. '.repeat(100);
            const chunks = chunker.chunk(text);

            chunks.forEach((chunk, index) => {
                expect(chunk.index).toBe(index);
            });
        });

        it('should include start position', () => {
            const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
            const chunks = chunker.chunk(text);

            expect(chunks[0].startPos).toBe(0);
            if (chunks.length > 1) {
                expect(chunks[1].startPos).toBeGreaterThan(0);
            }
        });
    });
});
