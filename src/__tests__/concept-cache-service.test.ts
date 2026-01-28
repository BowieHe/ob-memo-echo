import { ConceptCacheService } from '../services/concept-cache-service';

describe('ConceptCacheService', () => {
    const createService = () => {
        const store = new Map<string, string>();
        const adapter = {
            exists: jest.fn(async (path: string) => store.has(path)),
            read: jest.fn(async (path: string) => {
                const value = store.get(path);
                if (!value) {
                    throw new Error('Missing');
                }
                return value;
            }),
            write: jest.fn(async (path: string, content: string) => {
                store.set(path, content);
            }),
            mkdir: jest.fn(async () => undefined),
        };

        const app = {
            vault: {
                adapter,
            },
        } as any;

        return { service: new ConceptCacheService(app), adapter, store };
    };

    it('returns empty cache when file missing', async () => {
        const { service } = createService();

        const cache = await service.load();

        expect(cache.notes).toEqual({});
        expect(cache.concepts).toEqual({});
        expect(cache.version).toBe(1);
    });

    it('saves and loads cache', async () => {
        const { service } = createService();

        const data = {
            version: 1,
            updatedAt: '2026-01-28T10:00:00Z',
            notes: {
                'note.md': { mtime: 1, concepts: ['A'] },
            },
            concepts: {
                A: ['note.md'],
            },
        };

        await service.save(data);
        const loaded = await service.load();

        expect(loaded).toEqual(data);
    });

    it('updates only changed files and rebuilds concept index', async () => {
        const { service } = createService();

        const files = [
            { path: 'note1.md', stat: { mtime: 1 } },
            { path: 'note2.md', stat: { mtime: 2 } },
        ] as any[];

        const resolver = jest.fn(async (file: any) => {
            return file.path === 'note1.md' ? ['A'] : ['A', 'B'];
        });

        const first = await service.updateFromFiles(files, resolver);
        expect(first.notes['note1.md'].concepts).toEqual(['A']);
        expect(first.concepts.A).toEqual(expect.arrayContaining(['note1.md', 'note2.md']));
        expect(first.concepts.B).toEqual(['note2.md']);

        const resolver2 = jest.fn(async () => ['C']);
        const second = await service.updateFromFiles(files, resolver2);

        expect(resolver2).not.toHaveBeenCalled();
        expect(second.notes['note1.md'].concepts).toEqual(['A']);
        expect(second.concepts.A).toEqual(expect.arrayContaining(['note1.md', 'note2.md']));
    });
});
