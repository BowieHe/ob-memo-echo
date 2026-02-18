/**
 * WikilinkExtractor - Extracts user's wikilinks from notes
 * Extracts [[Link]] format links from Obsidian metadata
 */

import type { App, TFile, MetadataCache } from 'obsidian';

export interface WikilinkInfo {
    raw_text: string;  // "[[Docker]]"
    reason: string;    // "用户引用链接"
}

export class WikilinkExtractor {
    constructor(private app: App) {}

    /**
     * Extract user's wikilinks from a file
     * Reads from Obsidian's metadataCache.links
     */
    extractUserLinks(file: TFile): WikilinkInfo[] {
        const cache = this.app.metadataCache.getFileCache(file);
        const links = cache?.links || [];

        return links.map((link: any) => ({
            raw_text: `[[${link.link}]]`,
            reason: "用户引用链接"
        }));
    }

    /**
     * Extract wikilink names from content using regex
     * Handles [[Link]] format
     */
    extractWikilinkNames(content: string): string[] {
        const regex = /\[\[([^\]]+)\]\]/g;
        const matches = [];
        let match;

        while ((match = regex.exec(content)) !== null) {
            matches.push(match[1]);
        }

        return matches;
    }

    /**
     * Clean wikilink name (remove path and alias)
     * [[Path/Note|Alias]] -> Note
     */
    cleanWikilinkName(rawName: string): string {
        // Remove alias
        const withoutAlias = rawName.split('|')[0].trim();
        
        // Remove path
        const parts = withoutAlias.split('/');
        return parts[parts.length - 1].trim();
    }

    /**
     * Extract unique wikilink names from content
     */
    extractUniqueWikilinkNames(content: string): string[] {
        const names = this.extractWikilinkNames(content);
        const cleaned = names.map(name => this.cleanWikilinkName(name));
        const unique = Array.from(new Set(cleaned));
        
        return unique;
    }
}
