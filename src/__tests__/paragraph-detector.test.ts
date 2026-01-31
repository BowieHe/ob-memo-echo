/**
 * Unit tests for ParagraphDetector (v0.2.0)
 * Tests paragraph completion detection logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParagraphDetector, ParagraphEvent } from '@services/paragraph-detector';

describe('ParagraphDetector (v0.2.0)', () => {
    let detector: ParagraphDetector;
    let onParagraphComplete: any;

    beforeEach(() => {
        onParagraphComplete = vi.fn();
        detector = new ParagraphDetector({
            minChars: 100,
            debounceMs: 0, // Disable debounce for most tests
            onParagraphComplete,
        });
    });

    afterEach(() => {
        detector.destroy();
    });

    describe('Double Newline Detection', () => {
        it('should detect paragraph completion on double newline', () => {
            const content = 'A'.repeat(150) + '\n\n';

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledTimes(1);
            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('A'),
                    charCount: 150,
                })
            );
        });

        it('should not trigger on single newline', () => {
            const content = 'A'.repeat(150) + '\n';

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).not.toHaveBeenCalled();
        });

        it('should extract paragraph before double newline', () => {
            const paragraph = 'This is a test paragraph. '.repeat(10);
            const content = `Previous content\n\n${paragraph}\n\n`;

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('test paragraph'),
                })
            );
        });
    });

    describe('Character Count Threshold', () => {
        it('should not trigger if below minimum chars', () => {
            const content = 'Short text\n\n'; // < 100 chars

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).not.toHaveBeenCalled();
        });

        it('should trigger if above minimum chars', () => {
            const content = 'A'.repeat(150) + '\n\n';

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledTimes(1);
        });

        it('should respect custom threshold', () => {
            const customDetector = new ParagraphDetector({
                minChars: 50,
                debounceMs: 0,
                onParagraphComplete,
            });

            const content = 'A'.repeat(60) + '\n\n';

            customDetector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledTimes(1);

            customDetector.destroy();
        });
    });

    describe('Debounce Logic', () => {
        it('should debounce rapid changes', () => {
            vi.useFakeTimers();

            const debouncedDetector = new ParagraphDetector({
                minChars: 100,
                debounceMs: 1000,
                onParagraphComplete,
            });

            const content1 = 'A'.repeat(150) + '\n\n';
            const content2 = 'B'.repeat(150) + '\n\n';

            debouncedDetector.onContentChange(content1, content1.length);

            // Trigger again within debounce period
            setTimeout(() => {
                debouncedDetector.onContentChange(content2, content2.length);
            }, 500);

            // Fast-forward past debounce period
            vi.advanceTimersByTime(1500);

            // Should only trigger once (for content2)
            expect(onParagraphComplete).toHaveBeenCalledTimes(1);
            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('B'),
                })
            );

            debouncedDetector.destroy();
            vi.useRealTimers();
        });

        it('should trigger after debounce period', () => {
            vi.useFakeTimers();

            const debouncedDetector = new ParagraphDetector({
                minChars: 100,
                debounceMs: 1000,
                onParagraphComplete,
            });

            const content = 'A'.repeat(150) + '\n\n';

            debouncedDetector.onContentChange(content, content.length);

            expect(onParagraphComplete).not.toHaveBeenCalled();

            // Fast-forward past debounce period
            vi.advanceTimersByTime(1000);

            expect(onParagraphComplete).toHaveBeenCalledTimes(1);

            debouncedDetector.destroy();
            vi.useRealTimers();
        });
    });

    describe('Paragraph Extraction', () => {
        it('should extract current paragraph from multi-paragraph text', () => {
            const customDetector = new ParagraphDetector({
                minChars: 50,
                debounceMs: 0,
                onParagraphComplete,
            });
            const content = `First paragraph here.\n\nSecond paragraph with enough text to trigger detection. `.repeat(3) + '\n\n';

            customDetector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Second paragraph'),
                })
            );
            customDetector.destroy();
        });

        it('should handle text with headers', () => {
            const customDetector = new ParagraphDetector({
                minChars: 10,
                debounceMs: 0,
                onParagraphComplete,
            });
            const content = `# Header\n\nParagraph content here. `.repeat(10) + '\n\n';

            customDetector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Paragraph content'),
                })
            );
            customDetector.destroy();
        });

        it('should trim whitespace from extracted paragraph', () => {
            const customDetector = new ParagraphDetector({
                minChars: 20,
                debounceMs: 0,
                onParagraphComplete,
            });
            const content = `   \n\n  Paragraph with whitespace.  `.repeat(5) + '  \n\n';

            customDetector.onContentChange(content, content.length);

            const call = onParagraphComplete.mock.calls[0][0];
            expect(call.content).not.toMatch(/^\s+/);
            expect(call.content).not.toMatch(/\s+$/);
            customDetector.destroy();
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty content', () => {
            detector.onContentChange('', 0);

            expect(onParagraphComplete).not.toHaveBeenCalled();
        });

        it('should handle content with only newlines', () => {
            detector.onContentChange('\n\n\n\n', 4);

            expect(onParagraphComplete).not.toHaveBeenCalled();
        });

        it('should handle very long paragraphs', () => {
            const content = 'A'.repeat(10000) + '\n\n';

            detector.onContentChange(content, content.length);

            expect(onParagraphComplete).toHaveBeenCalledTimes(1);
            expect(onParagraphComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    charCount: 10000,
                })
            );
        });

        it('should handle rapid cursor movements', () => {
            const content = 'A'.repeat(150) + '\n\n';

            // Simulate cursor moving around
            detector.onContentChange(content, 50);
            detector.onContentChange(content, 100);
            detector.onContentChange(content, content.length);

            // Should still detect paragraph
            expect(onParagraphComplete).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should allow disabling debounce', () => {
            const noDebounceDetector = new ParagraphDetector({
                minChars: 100,
                debounceMs: 0,
                onParagraphComplete,
            });

            const content = 'A'.repeat(150) + '\n\n';

            noDebounceDetector.onContentChange(content, content.length);

            // Should trigger immediately
            expect(onParagraphComplete).toHaveBeenCalledTimes(1);

            noDebounceDetector.destroy();
        });

        it('should support custom minimum chars', () => {
            const customDetector = new ParagraphDetector({
                minChars: 200,
                debounceMs: 0,
                onParagraphComplete,
            });

            const content1 = 'A'.repeat(150) + '\n\n';
            const content2 = 'A'.repeat(250) + '\n\n';

            customDetector.onContentChange(content1, content1.length);
            expect(onParagraphComplete).not.toHaveBeenCalled();

            customDetector.onContentChange(content2, content2.length);
            expect(onParagraphComplete).toHaveBeenCalledTimes(1);

            customDetector.destroy();
        });
    });

    describe('Lifecycle', () => {
        it('should cleanup on destroy', () => {
            vi.useFakeTimers();

            const debouncedDetector = new ParagraphDetector({
                minChars: 100,
                debounceMs: 1000,
                onParagraphComplete,
            });

            const content = 'A'.repeat(150) + '\n\n';

            debouncedDetector.onContentChange(content, content.length);
            debouncedDetector.destroy();

            // Fast-forward time
            vi.advanceTimersByTime(2000);

            // Should not trigger after destroy
            expect(onParagraphComplete).not.toHaveBeenCalled();

            vi.useRealTimers();
        });
    });
});
