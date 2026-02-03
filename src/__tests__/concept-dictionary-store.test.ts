import { describe, it, expect, vi } from 'vitest';
import { ConceptDictionaryStore, createEmptyDictionary } from '@services/concept-dictionary-store';
import { TFile } from 'obsidian';

describe('ConceptDictionaryStore', () => {
    it('creates empty dictionary with defaults', () => {
        const dictionary = createEmptyDictionary();
        expect(dictionary.version).toBe('1.0');
        expect(dictionary.concepts).toEqual({});
        expect(dictionary.lastUpdated).toBeTruthy();
    });

    it('returns empty dictionary when file is missing', async () => {
        const app = {
            vault: {
                getAbstractFileByPath: vi.fn(() => null),
            },
        } as any;

        const store = new ConceptDictionaryStore(app, '_me/_concept-dictionary.json');
        const dictionary = await store.load();

        expect(dictionary.concepts).toEqual({});
    });

    it('loads dictionary from existing file', async () => {
        const file = new TFile();
        file.path = '_me/_concept-dictionary.json';
        const app = {
            vault: {
                getAbstractFileByPath: vi.fn(() => file),
                read: vi.fn(async () => JSON.stringify({
                    version: '1.0',
                    lastUpdated: '2026-02-01T00:00:00Z',
                    concepts: {
                        '认知科学': {
                            aliases: ['cognitive science'],
                            createdAt: '2026-01-01T00:00:00Z',
                            noteCount: 1,
                        },
                    },
                })),
            },
        } as any;

        const store = new ConceptDictionaryStore(app, '_me/_concept-dictionary.json');
        const dictionary = await store.load();

        expect(dictionary.concepts['认知科学']).toBeDefined();
        expect(dictionary.concepts['认知科学'].aliases).toContain('cognitive science');
    });
});
