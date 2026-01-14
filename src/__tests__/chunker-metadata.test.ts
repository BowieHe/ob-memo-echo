/**
 * Unit tests for Chunker Metadata Enhancement (v0.2.0)
 * Tests line number calculation and header path formatting
 */

import { Chunker, ChunkResult } from '../services/chunker';

describe('Chunker Metadata Enhancement (v0.2.0)', () => {
    let chunker: Chunker;

    beforeEach(() => {
        chunker = new Chunker({
            minChunkSize: 100,
            maxChunkSize: 500,
            overlapSize: 50,
        });
    });

    describe('Line Number Calculation', () => {
        // TC-1.1: Line number calculation for single chunk
        it('should calculate line numbers for single chunk', () => {
            const text = `# Title
This is line 2
This is line 3
This is line 4`;

            const chunks = chunker.chunk(text);

            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].start_line).toBe(1);
            expect(chunks[0].end_line).toBe(4);
        });

        // TC-1.2: Line number calculation for multiple chunks
        it('should calculate line numbers for multiple chunks', () => {
            const text = `# Header 1
Content for header 1.
${'Line of text.\n'.repeat(20)}

## Header 2
Content for header 2.
${'More text.\n'.repeat(20)}`;

            const chunks = chunker.chunk(text);

            expect(chunks.length).toBeGreaterThan(1);

            // First chunk should start at line 1
            expect(chunks[0].start_line).toBe(1);

            // Each subsequent chunk should start after the previous one
            for (let i = 1; i < chunks.length; i++) {
                expect(chunks[i].start_line).toBeGreaterThan(chunks[i - 1].start_line);
                expect(chunks[i].end_line).toBeGreaterThanOrEqual(chunks[i].start_line);
            }
        });

        // TC-1.5: Edge case: chunk at file start (line 1)
        it('should handle chunk at file start', () => {
            const text = `First line
Second line
Third line`;

            const chunks = chunker.chunk(text);

            expect(chunks[0].start_line).toBe(1);
        });

        // TC-1.6: Edge case: chunk at file end
        it('should handle chunk at file end', () => {
            const text = `# Header 1
Content 1

## Header 2
Content 2

### Header 3
Final content at end of file`;

            const chunks = chunker.chunk(text);

            const lastChunk = chunks[chunks.length - 1];
            const totalLines = text.split('\n').length;

            expect(lastChunk.end_line).toBe(totalLines);
        });

        // Additional test: Verify line numbers match content position
        it('should have line numbers that match actual content position', () => {
            const text = `Line 1
Line 2
Line 3
# Header at line 4
Line 5
Line 6`;

            const chunks = chunker.chunk(text);

            // Find chunk containing "Header at line 4"
            const headerChunk = chunks.find(c => c.content.includes('Header at line 4'));

            expect(headerChunk).toBeDefined();
            expect(headerChunk!.start_line).toBeLessThanOrEqual(4);
            expect(headerChunk!.end_line).toBeGreaterThanOrEqual(4);
        });
    });

    describe('Header Path Formatting', () => {
        // TC-1.3: Header path formatting for nested headers
        it('should format header path for nested headers', () => {
            const text = `# Main Title

Introduction text.

## Section 1

Section 1 content.

### Subsection 1.1

Detailed content here.`;

            const chunks = chunker.chunk(text);

            // Find chunk under "Subsection 1.1"
            const subsectionChunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'Subsection 1.1')
            );

            expect(subsectionChunk).toBeDefined();
            expect(subsectionChunk!.header_path).toBe('# Main Title > ## Section 1 > ### Subsection 1.1');
        });

        // TC-1.4: Header path formatting for flat headers
        it('should format header path for flat headers', () => {
            const text = `# Single Header

Content under single header.`;

            const chunks = chunker.chunk(text);

            const chunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'Single Header')
            );

            expect(chunk).toBeDefined();
            expect(chunk!.header_path).toBe('# Single Header');
        });

        // Additional test: Multiple H2 headers under same H1
        it('should format header path correctly for sibling headers', () => {
            const text = `# Main

## Section A
Content A

## Section B
Content B

## Section C
Content C`;

            const chunks = chunker.chunk(text);

            const sectionB = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'Section B')
            );

            expect(sectionB).toBeDefined();
            expect(sectionB!.header_path).toBe('# Main > ## Section B');
        });

        // Additional test: Empty header path for content without headers
        it('should have empty header path for content without headers', () => {
            const text = 'Just plain text without any headers.';

            const chunks = chunker.chunk(text);

            expect(chunks[0].header_path).toBe('');
        });

        // Additional test: Complex nested structure
        it('should handle complex nested header structure', () => {
            const text = `# H1

## H2-A

### H3-A1

#### H4-A1a

Content at deepest level.

### H3-A2

Back to H3 level.

## H2-B

Different H2 branch.`;

            const chunks = chunker.chunk(text);

            // Find H4 chunk
            const h4Chunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'H4-A1a')
            );

            expect(h4Chunk).toBeDefined();
            expect(h4Chunk!.header_path).toBe('# H1 > ## H2-A > ### H3-A1 > #### H4-A1a');

            // Find H3-A2 chunk (should reset from H4)
            const h3a2Chunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'H3-A2')
            );

            expect(h3a2Chunk).toBeDefined();
            expect(h3a2Chunk!.header_path).toBe('# H1 > ## H2-A > ### H3-A2');

            // Find H2-B chunk (should reset from H3)
            const h2bChunk = chunks.find(c =>
                c.headers && c.headers.some(h => h.text === 'H2-B')
            );

            expect(h2bChunk).toBeDefined();
            expect(h2bChunk!.header_path).toBe('# H1 > ## H2-B');
        });
    });

    describe('Integration: Line Numbers + Header Paths', () => {
        it('should provide both line numbers and header path', () => {
            const text = `# Title
Line 2
Line 3

## Section
Line 6
Line 7
Line 8`;

            const chunks = chunker.chunk(text);

            chunks.forEach(chunk => {
                // Every chunk should have line numbers
                expect(chunk.start_line).toBeGreaterThan(0);
                expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);

                // Header path should be defined (may be empty string)
                expect(chunk.header_path).toBeDefined();
                expect(typeof chunk.header_path).toBe('string');
            });
        });

        it('should maintain consistency between metadata fields', () => {
            const text = `# H1
Content 1

## H2
Content 2`;

            const chunks = chunker.chunk(text);

            chunks.forEach(chunk => {
                // If chunk has headers, it should have a non-empty header_path
                if (chunk.headers && chunk.headers.length > 0) {
                    expect(chunk.header_path.length).toBeGreaterThan(0);
                    expect(chunk.header_path).toContain('#');
                } else {
                    expect(chunk.header_path).toBe('');
                }

                // Line numbers should be valid
                expect(chunk.start_line).toBeGreaterThan(0);
                expect(chunk.end_line).toBeGreaterThanOrEqual(chunk.start_line);

                // Existing fields should still be present
                expect(chunk.content).toBeDefined();
                expect(chunk.index).toBeGreaterThanOrEqual(0);
                expect(chunk.startPos).toBeGreaterThanOrEqual(0);
                expect(chunk.endPos).toBeGreaterThan(chunk.startPos);
            });
        });
    });

    describe('Backwards Compatibility', () => {
        it('should maintain all existing ChunkResult fields', () => {
            const text = `# Test
Content here`;

            const chunks = chunker.chunk(text);

            chunks.forEach(chunk => {
                // Existing fields
                expect(chunk.content).toBeDefined();
                expect(chunk.headers).toBeDefined();
                expect(chunk.index).toBeDefined();
                expect(chunk.startPos).toBeDefined();
                expect(chunk.endPos).toBeDefined();

                // New fields
                expect(chunk.start_line).toBeDefined();
                expect(chunk.end_line).toBeDefined();
                expect(chunk.header_path).toBeDefined();
            });
        });
    });
});
