import type { NoteTypeDetection } from '@core/types/concept';
import type { ConceptSkipConfig } from '@core/types/setting';

export class NoteTypeDetector {
    private rules: ConceptSkipConfig;

    constructor(rules: ConceptSkipConfig) {
        this.rules = rules;
    }

    detect(note: { path: string; content: string; tags?: string[] }): NoteTypeDetection {
        if (this.matchesSkipPath(note.path)) {
            return { type: 'template', confidence: 1, shouldSkip: true, reason: 'Matches skip path' };
        }

        if (note.tags?.some((tag) => this.rules.skipTags.includes(tag))) {
            return { type: 'vocabulary', confidence: 0.95, shouldSkip: true, reason: 'Has skip tag' };
        }

        const textContent = this.extractTextContent(note.content);
        const lines = textContent.split('\n').filter((line) => line.trim());
        const avgLineLength = lines.length > 0 ? textContent.length / lines.length : 0;
        if (lines.length > 20 && avgLineLength < 30) {
            return { type: 'vocabulary', confidence: 0.8, shouldSkip: true, reason: 'Appears to be a list' };
        }

        if (textContent.length < this.rules.minTextLength) {
            return { type: 'normal', confidence: 1, shouldSkip: true, reason: 'Too short' };
        }

        return { type: 'normal', confidence: 1, shouldSkip: false };
    }

    private matchesSkipPath(path: string): boolean {
        return this.rules.skipPaths.some((prefix) => path.startsWith(prefix));
    }

    private extractTextContent(content: string): string {
        return content
            .replace(/!\[\[.*?\]\]/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/^---[\s\S]*?---/m, '')
            .trim();
    }
}
