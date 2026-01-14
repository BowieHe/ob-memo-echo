/**
 * ParagraphDetector - Detects paragraph completion in editor
 * Triggers recommendation when user completes a paragraph
 */

export interface ParagraphEvent {
    content: string;
    charCount: number;
    cursorPosition: number;
}

export interface ParagraphDetectorConfig {
    minChars: number; // Minimum characters to trigger
    debounceMs: number; // Debounce delay in milliseconds
    onParagraphComplete: (event: ParagraphEvent) => void;
}

export class ParagraphDetector {
    private config: ParagraphDetectorConfig;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastContent: string = '';

    constructor(config: ParagraphDetectorConfig) {
        this.config = config;
    }

    /**
     * Handle content change in editor
     */
    onContentChange(content: string, cursorPosition: number): void {
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Check if double newline was just typed
        if (!this.hasDoubleNewlineAtCursor(content, cursorPosition)) {
            this.lastContent = content;
            return;
        }

        // Extract current paragraph
        const paragraph = this.extractCurrentParagraph(content, cursorPosition);

        if (!paragraph) {
            this.lastContent = content;
            return;
        }

        // Check character count threshold
        if (paragraph.length < this.config.minChars) {
            this.lastContent = content;
            return;
        }

        // Debounce the trigger
        if (this.config.debounceMs > 0) {
            this.debounceTimer = setTimeout(() => {
                this.triggerParagraphComplete(paragraph, cursorPosition);
            }, this.config.debounceMs);
        } else {
            this.triggerParagraphComplete(paragraph, cursorPosition);
        }

        this.lastContent = content;
    }

    /**
     * Check if double newline exists at cursor position
     */
    private hasDoubleNewlineAtCursor(content: string, cursorPosition: number): boolean {
        // Check if the last two characters before cursor are newlines
        if (cursorPosition < 2) return false;

        const beforeCursor = content.substring(cursorPosition - 2, cursorPosition);
        return beforeCursor === '\n\n';
    }

    /**
     * Extract the paragraph before the double newline
     */
    private extractCurrentParagraph(content: string, cursorPosition: number): string | null {
        // Find the start of current paragraph (previous double newline or start of content)
        const beforeCursor = content.substring(0, cursorPosition - 2); // Exclude the double newline

        // Find last double newline before cursor
        const lastDoubleNewline = beforeCursor.lastIndexOf('\n\n');

        const paragraphStart = lastDoubleNewline === -1 ? 0 : lastDoubleNewline + 2;
        const paragraph = content.substring(paragraphStart, cursorPosition - 2);

        return paragraph.trim();
    }

    /**
     * Trigger paragraph complete callback
     */
    private triggerParagraphComplete(content: string, cursorPosition: number): void {
        this.config.onParagraphComplete({
            content,
            charCount: content.length,
            cursorPosition,
        });
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}
