import { App, TFile } from 'obsidian';
import type { ConceptDictionary } from '@core/types/concept';

export function createEmptyDictionary(): ConceptDictionary {
    return {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        concepts: {},
    };
}

export class ConceptDictionaryStore {
    private app: App;
    private dictionaryPath: string;

    constructor(app: App, dictionaryPath: string) {
        this.app = app;
        this.dictionaryPath = dictionaryPath;
    }

    async load(): Promise<ConceptDictionary> {
        const file = this.app.vault.getAbstractFileByPath(this.dictionaryPath);
        if (!file || !(file instanceof TFile)) {
            return createEmptyDictionary();
        }

        try {
            const raw = await this.app.vault.read(file);
            const parsed = JSON.parse(raw);
            return {
                version: parsed.version || '1.0',
                lastUpdated: parsed.lastUpdated || new Date().toISOString(),
                concepts: parsed.concepts || {},
            };
        } catch (error) {
            console.error('[MemoEcho] Failed to load concept dictionary:', error);
            return createEmptyDictionary();
        }
    }

    async save(dictionary: ConceptDictionary): Promise<void> {
        const payload = JSON.stringify(dictionary, null, 2);
        const file = this.app.vault.getAbstractFileByPath(this.dictionaryPath);

        if (!file || !(file instanceof TFile)) {
            await this.app.vault.create(this.dictionaryPath, payload);
            return;
        }

        await this.app.vault.modify(file, payload);
    }

    async ensure(): Promise<ConceptDictionary> {
        const existing = await this.load();
        const file = this.app.vault.getAbstractFileByPath(this.dictionaryPath);
        if (!file || !(file instanceof TFile)) {
            await this.save(existing);
        }
        return existing;
    }
}
