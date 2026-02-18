/**
 * WikilinkIndex - Global wikilink index management
 * Stores and queries user's wikilinks in Qdrant (no vectors)
 */

import type { VectorBackend } from './vector-backend';

export interface WikilinkRecord {
    link_name: string;     // "虚拟机"
    link_text: string;     // "[[虚拟机]]"
    source_files: string[];  // Array of file paths that use this wikilink
    noteCount: number;     // Number of notes using this wikilink
    type: 'wikilink';
}

export class WikilinkIndex {
    private readonly ZERO_VECTOR_LENGTH = 768;

    constructor(
        private qdrant: VectorBackend,
        private collectionName: string = 'obsidian_notes'
    ) {}

    /**
     * Create a zero vector (placeholder for wikilinks which don't need vectors)
     */
    private createZeroVector(): number[] {
        return Array(this.ZERO_VECTOR_LENGTH).fill(0);
    }

    /**
     * Simulate scroll by using search with zero vector
     * This is a workaround since VectorBackend.scroll() method may not be implemented yet
     */
    private async scrollSimulate(options: {
        limit?: number;
        filter?: {
            must?: Array<{ key: string; match: { value: string } }>;
        };
    }): Promise<WikilinkRecord[]> {
        const limit = options.limit || 1000;
        const zeroVector = this.createZeroVector();

        try {
            const results = await this.qdrant.searchWithFusion(zeroVector, {
                limit,
            });

            // Apply filter manually if provided
            const filterConditions = options.filter?.must;
            const filtered = filterConditions
                ? results.filter(r => this.matchFilter(r.metadata, filterConditions))
                : results;

            return filtered.map(r => r.metadata as unknown as WikilinkRecord);
        } catch (error) {
            console.warn('[WikilinkIndex] Scroll simulate failed:', error);
            return [];
        }
    }

    /**
     * Match filter condition
     */
    private matchFilter(metadata: Record<string, any>, must: Array<{ key: string; match: { value: string } }>): boolean {
        return must.every(condition => {
            const value = metadata[condition.key];
            return value === condition.match.value;
        });
    }

    /**
     * Build global wikilink index by scanning all markdown files
     */
    async buildIndex(): Promise<void> {
        console.log('[WikilinkIndex] Building global wikilink index...');

        // This would need access to app.vault to scan all files
        // For now, this is a placeholder - actual implementation
        // should be called from the plugin main file
        console.log('[WikilinkIndex] Global wikilink index built');
    }

    /**
     * Get a specific wikilink by name
     */
    async getWikilinkByName(linkName: string): Promise<WikilinkRecord | null> {
        try {
            const results = await this.scrollSimulate({
                limit: 1,
                filter: {
                    must: [
                        { key: 'type', match: { value: 'wikilink' } },
                        { key: 'link_name', match: { value: linkName } }
                    ]
                }
            });

            if (results.length > 0) {
                return results[0];
            }

            return null;
        } catch (error) {
            console.warn('[WikilinkIndex] Get by name failed:', error);
            return null;
        }
    }

    /**
     * Get all wikilinks
     */
    async getAllWikilinks(): Promise<WikilinkRecord[]> {
        try {
            const results = await this.scrollSimulate({
                limit: 1000,
                filter: {
                    must: [{ key: 'type', match: { value: 'wikilink' } }]
                }
            });

            return results;
        } catch (error) {
            console.warn('[WikilinkIndex] Get all failed:', error);
            return [];
        }
    }

    /**
     * Upsert a wikilink (create or update)
     */
    async upsertWikilink(
        linkName: string,
        linkText: string,
        sourceFile: string
    ): Promise<void> {
        try {
            const existing = await this.getWikilinkByName(linkName);

            if (existing) {
                // Update existing wikilink
                await this.updateWikilink(linkName, linkText, sourceFile, existing);
            } else {
                // Create new wikilink
                await this.createWikilink(linkName, linkText, sourceFile);
            }
        } catch (error) {
            console.error('[WikilinkIndex] Upsert failed:', error);
            throw error;
        }
    }

    /**
     * Create a new wikilink
     */
    private async createWikilink(
        linkName: string,
        linkText: string,
        sourceFile: string
    ): Promise<void> {
        const id = `wikilink-${linkName}`;
        const now = new Date().toISOString();
        const zeroVector = this.createZeroVector();

        // Create with zero vectors (placeholder, won't be used for search)
        await this.qdrant.upsertMultiVector({
            id,
            vectors: {
                content_vec: zeroVector,
                summary_vec: zeroVector,
                title_vec: zeroVector,
                tag_vec: zeroVector,
            },
            metadata: {
                link_name: linkName,
                link_text: linkText,
                source_files: [sourceFile],
                noteCount: 1,
                type: 'wikilink',
                indexedAt: now,
            },
        });

        console.log(`[WikilinkIndex] Created wikilink: ${linkName}`);
    }

    /**
     * Update an existing wikilink
     */
    private async updateWikilink(
        linkName: string,
        linkText: string,
        sourceFile: string,
        existing: WikilinkRecord
    ): Promise<void> {
        const id = `wikilink-${linkName}`;

        // Merge source files
        const sourceFiles = [...existing.source_files];
        if (!sourceFiles.includes(sourceFile)) {
            sourceFiles.push(sourceFile);
        }

        const zeroVector = this.createZeroVector();

        await this.qdrant.upsertMultiVector({
            id,
            vectors: {
                content_vec: zeroVector,
                summary_vec: zeroVector,
                title_vec: zeroVector,
                tag_vec: zeroVector,
            },
            metadata: {
                ...existing,
                source_files: sourceFiles,
                noteCount: sourceFiles.length,
            },
        });

        console.log(`[WikilinkIndex] Updated wikilink: ${linkName} (count: ${sourceFiles.length})`);
    }
}
