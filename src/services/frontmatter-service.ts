/**
 * FrontmatterService - Safe read/write operations for note frontmatter
 * v0.5.0: Manages me_concepts and me_indexed_at fields
 */

import { App, TFile } from 'obsidian';
import type { MemoEchoFrontmatter } from '@core/types/frontmatter';

export type { MemoEchoFrontmatter };

export class FrontmatterService {
    private app: App;
    private conceptPagePrefix: string;

    constructor(app: App, conceptPagePrefix: string = '_me') {
        this.app = app;
        this.conceptPagePrefix = conceptPagePrefix;
    }

    updateConceptPagePrefix(prefix: string): void {
        this.conceptPagePrefix = prefix;
    }

    /**
     * Read memo echo specific frontmatter fields
     */
    async readMemoEchoFields(file: TFile): Promise<MemoEchoFrontmatter> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        if (!frontmatter) {
            return {};
        }

        return {
            me_concepts: frontmatter.me_concepts,
            me_indexed_at: frontmatter.me_indexed_at,
        };
    }

    /**
     * Check if file needs reindexing based on modification time
     */
    async needsReindex(file: TFile): Promise<boolean> {
        const fields = await this.readMemoEchoFields(file);

        if (!fields.me_indexed_at) {
            return true;
        }

        const indexedAt = new Date(fields.me_indexed_at).getTime();
        return file.stat.mtime > indexedAt;
    }

    /**
     * Update me_concepts field in frontmatter (incremental merge)
     * @param concepts - Array of concept names (without wikilink syntax) to ADD
     */
    async setConcepts(file: TFile, concepts: string[]): Promise<void> {
        if (concepts.length === 0) {
            return; // Don't clear, just return
        }

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            // Get existing concepts and extract concept names
            const existingConcepts = frontmatter.me_concepts || [];
            const existingNames = new Set(
                existingConcepts.map((c: string) => {
                    // Extract concept name from [[prefix/name]] format
                    const match = c.match(/\[\[.+\/(.+)\]\]$/);
                    return match ? match[1] : c;
                })
            );

            // Add new concepts to the set
            concepts.forEach(c => existingNames.add(c));

            // Convert back to wikilink format
            frontmatter.me_concepts = Array.from(existingNames).map(
                c => `[[${this.conceptPagePrefix}/${c}]]`
            );
        });
    }

    /**
     * Update me_indexed_at timestamp
     */
    async setIndexedAt(file: TFile, timestamp?: Date): Promise<void> {
        const isoString = (timestamp || new Date()).toISOString();

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_indexed_at = isoString;
        });
    }

    /**
     * Update both concepts and indexed_at atomically (incremental merge for concepts)
     */
    async updateAfterIndexing(file: TFile, concepts: string[]): Promise<void> {
        const isoString = new Date().toISOString();

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            // Get existing concepts and extract concept names
            const existingConcepts = frontmatter.me_concepts || [];
            const existingNames = new Set(
                existingConcepts.map((c: string) => {
                    // Extract concept name from [[prefix/name]] format
                    const match = c.match(/\[\[.+\/(.+)\]\]$/);
                    return match ? match[1] : c;
                })
            );

            // Add new concepts to the set
            concepts.forEach(c => existingNames.add(c));

            // Convert back to wikilink format
            frontmatter.me_concepts = Array.from(existingNames).map(
                c => `[[${this.conceptPagePrefix}/${c}]]`
            );

            // Update indexed_at timestamp
            frontmatter.me_indexed_at = isoString;
        });
    }

    /**
     * Remove all me_* fields from frontmatter
     */
    async clearMemoEchoFields(file: TFile): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            delete frontmatter.me_concepts;
            delete frontmatter.me_indexed_at;
        });
    }

    /**
     * Clear all me_* fields from all markdown files
     */
    async clearAllMemoEchoFields(): Promise<{ cleared: number; failed: number }> {
        const files = this.app.vault.getMarkdownFiles();
        let cleared = 0;
        let failed = 0;

        for (const file of files) {
            try {
                const fields = await this.readMemoEchoFields(file);

                // Only process files that have memo echo fields
                if (fields.me_concepts || fields.me_indexed_at) {
                    await this.clearMemoEchoFields(file);
                    cleared++;
                }
            } catch (error) {
                console.error(`Failed to clear fields from ${file.path}:`, error);
                failed++;
            }
        }

        return { cleared, failed };
    }

    /**
     * Get all unique concepts from all indexed files
     */
    async getAllConcepts(): Promise<string[]> {
        const files = this.app.vault.getMarkdownFiles();
        const conceptSet = new Set<string>();

        for (const file of files) {
            try {
                const fields = await this.readMemoEchoFields(file);

                if (fields.me_concepts) {
                    for (const wikilink of fields.me_concepts) {
                        // Extract concept name from wikilink
                        // [[_me/Docker]] → Docker
                        const match = wikilink.match(/\[\[.*\/(.+)\]\]/);
                        if (match) {
                            conceptSet.add(match[1]);
                        }
                    }
                }
            } catch (error) {
                // Skip files with errors
            }
        }

        return Array.from(conceptSet).sort();
    }

    /**
     * Get files indexed after a certain date
     */
    async getFilesIndexedAfter(date: Date): Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        const result: TFile[] = [];

        for (const file of files) {
            try {
                const fields = await this.readMemoEchoFields(file);

                if (fields.me_indexed_at) {
                    const indexedAt = new Date(fields.me_indexed_at);
                    if (indexedAt > date) {
                        result.push(file);
                    }
                }
            } catch (error) {
                // Skip files with errors
            }
        }

        return result;
    }

    /**
     * Get files that share concepts with the given file
     */
    async getRelatedFiles(file: TFile): Promise<{ file: TFile; sharedConcepts: string[] }[]> {
        const fields = await this.readMemoEchoFields(file);

        if (!fields.me_concepts || fields.me_concepts.length === 0) {
            return [];
        }

        const conceptSet = new Set(fields.me_concepts);
        const allFiles = this.app.vault.getMarkdownFiles();
        const related: { file: TFile; sharedConcepts: string[] }[] = [];

        for (const otherFile of allFiles) {
            if (otherFile.path === file.path) continue;

            try {
                const otherFields = await this.readMemoEchoFields(otherFile);

                if (otherFields.me_concepts) {
                    const shared = otherFields.me_concepts.filter(c => conceptSet.has(c));

                    if (shared.length > 0) {
                        related.push({
                            file: otherFile,
                            sharedConcepts: shared,
                        });
                    }
                }
            } catch (error) {
                // Skip files with errors
            }
        }

        // Sort by number of shared concepts (descending)
        return related.sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length);
    }
}
