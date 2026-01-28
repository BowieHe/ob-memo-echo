import type { App } from 'obsidian';

export interface ConceptCacheEntry {
    mtime: number;
    concepts: string[];
}

export interface ConceptCacheData {
    version: number;
    updatedAt: string;
    notes: Record<string, ConceptCacheEntry>;
    concepts: Record<string, string[]>;
}

const CACHE_VERSION = 1;
const CACHE_DIR = '.obsidian/memo-echo';
const CACHE_PATH = `${CACHE_DIR}/concept-cache.json`;

export class ConceptCacheService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async load(): Promise<ConceptCacheData> {
        const adapter = this.app.vault.adapter;
        const exists = await adapter.exists(CACHE_PATH);

        if (!exists) {
            return this.createEmptyCache();
        }

        try {
            const raw = await adapter.read(CACHE_PATH);
            const parsed = JSON.parse(raw) as ConceptCacheData;
            if (!parsed || parsed.version !== CACHE_VERSION) {
                return this.createEmptyCache();
            }
            return parsed;
        } catch (error) {
            return this.createEmptyCache();
        }
    }

    async save(cache: ConceptCacheData): Promise<void> {
        const adapter = this.app.vault.adapter;
        const dirExists = await adapter.exists(CACHE_DIR);
        if (!dirExists) {
            await adapter.mkdir(CACHE_DIR);
        }

        await adapter.write(CACHE_PATH, JSON.stringify(cache, null, 2));
    }

    async updateFromFiles(
        files: Array<{ path: string; stat: { mtime: number } }>,
        resolver: (file: { path: string; stat: { mtime: number } }) => Promise<string[]>
    ): Promise<ConceptCacheData> {
        const cache = await this.load();

        for (const file of files) {
            const existing = cache.notes[file.path];
            if (existing && existing.mtime === file.stat.mtime) {
                continue;
            }

            const concepts = await resolver(file);

            if (concepts.length === 0) {
                delete cache.notes[file.path];
                continue;
            }

            cache.notes[file.path] = {
                mtime: file.stat.mtime,
                concepts,
            };
        }

        cache.concepts = this.buildConceptIndex(cache.notes);
        cache.updatedAt = new Date().toISOString();

        await this.save(cache);
        return cache;
    }

    rebuildConceptIndex(notes: Record<string, ConceptCacheEntry>): Record<string, string[]> {
        return this.buildConceptIndex(notes);
    }

    private buildConceptIndex(notes: Record<string, ConceptCacheEntry>): Record<string, string[]> {
        const conceptMap = new Map<string, Set<string>>();

        for (const [noteId, entry] of Object.entries(notes)) {
            for (const concept of entry.concepts) {
                if (!conceptMap.has(concept)) {
                    conceptMap.set(concept, new Set());
                }
                conceptMap.get(concept)!.add(noteId);
            }
        }

        const result: Record<string, string[]> = {};
        for (const [concept, noteIds] of conceptMap.entries()) {
            result[concept] = Array.from(noteIds);
        }

        return result;
    }

    private createEmptyCache(): ConceptCacheData {
        return {
            version: CACHE_VERSION,
            updatedAt: new Date(0).toISOString(),
            notes: {},
            concepts: {},
        };
    }
}
