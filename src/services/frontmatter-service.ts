/**
 * FrontmatterService - Safe read/write operations for note frontmatter
 * v0.6.0: Manages me_tag, me_concepts, me_indexed_at fields
 */

import { App, TFile } from 'obsidian';
import type { MemoEchoFrontmatter } from '@core/types/frontmatter';

export type { MemoEchoFrontmatter };

export interface FrontmatterSettings {
    meTagStrategy: 'always' | 'incremental' | 'smart';
    userTagThreshold: number;
}

export class FrontmatterService {
    private app: App;
    private conceptPagePrefix: string;
    private settings: FrontmatterSettings;

    constructor(app: App, conceptPagePrefix: string = '_me') {
        this.app = app;
        this.conceptPagePrefix = conceptPagePrefix;
        this.settings = {
            meTagStrategy: 'smart',
            userTagThreshold: 3,
        };
    }

    updateConceptPagePrefix(prefix: string): void {
        this.conceptPagePrefix = prefix;
    }

    updateSettings(settings: FrontmatterSettings): void {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Set me_tag field to frontmatter (smart incremental)
     */
    async setMeTag(file: TFile, me_tag: string[]): Promise<void> {
        const cache = this.app.metadataCache.getFileCache(file);
        const userTags = cache?.tags?.map(t => t.tag) || [];

        const strategy = this.settings.meTagStrategy || 'always';

        let finalMeTag: string[] | undefined;

        switch (strategy) {
            case "always":
                finalMeTag = me_tag;
                break;
            case "incremental":
                finalMeTag = [...userTags, ...me_tag];
                break;
            case "smart":
                const threshold = this.settings.userTagThreshold || 3;
                finalMeTag = userTags.length >= threshold ? undefined : me_tag;
                break;
        }

        if (!finalMeTag || finalMeTag.length === 0) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_tag = finalMeTag;
        });
    }

    /**
     * Set me_concepts_links field to frontmatter (recommended wikilinks from full text)
     */
    async setMeConceptsLinks(
        file: TFile,
        concepts_links: Array<{ raw_text: string; reason: string }>
    ): Promise<void> {
        if (!concepts_links || concepts_links.length === 0) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_concepts_links = concepts_links;
        });
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
            me_tag: frontmatter.me_tag,  // 新增
            me_concepts_links: frontmatter.me_concepts_links,  // 新增
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
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter || {};
        const existingConcepts = frontmatter.me_concepts || [];

        console.log(`[FrontmatterService] Setting concepts for ${file.path}:`, concepts);
        console.log(`[FrontmatterService] Existing concepts:`, existingConcepts);

        const newNames = new Set(
            existingConcepts.map((c: any) => c.match(/\[\/|\\|\|,]\]\]/g))
        );

        for (const concept of concepts) {
            if (!newNames.has(concept)) {
                newNames.add(concept);
            }
        }

        const finalConcepts = Array.from(newNames).map(
            c => `[[${this.conceptPagePrefix}/${c}]]`
        );

        console.log(`[FrontmatterService] Final concepts to write:`, finalConcepts);

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_concepts = finalConcepts;
        });

        // 🔍 Verify write result
        const updatedCache = this.app.metadataCache.getFileCache(file);
        console.log(`[FrontmatterService] Updated frontmatter:`, updatedCache?.frontmatter?.me_concepts);
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
     * Clear all me_* fields from frontmatter
     */
    async clearMemoEchoFields(file: TFile): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            delete frontmatter.me_concepts;
            delete frontmatter.me_indexed_at;
            delete frontmatter.me_tag;
            delete frontmatter.me_concepts_links;
        });
    }

    /**
     * Clear all me_* fields from all markdown files
     */
    async clearAllMemoEchoFieldsFromAllFiles(): Promise<{ cleared: number; failed: number }> {
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
     * Get files that share concepts with given file
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

        return related.sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length);
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
                existingConcepts.map((c: any) => c.match(/\[\[.+\/(.+)\]\]$/))
            );

            // Add new concepts to set
            concepts.forEach(c => existingNames.add(c));

            // Convert back to wikilink format
            frontmatter.me_concepts = Array.from(existingNames).map(
                c => `[[${this.conceptPagePrefix}/${c}]]`
            );

            // Update indexed_at timestamp
            frontmatter.me_indexed_at = isoString;
        });
    }
}
