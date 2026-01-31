import { describe, it, expect, vi } from 'vitest'; import { FrontmatterService } from '@services/frontmatter-service';

describe('FrontmatterService', () => {
    it('removes me_concepts and me_indexed_at when concepts empty', async () => {
        const frontmatter: Record<string, any> = {
            me_concepts: ['[[_me/旧概念]]'],
            me_indexed_at: '2025-01-01T00:00:00.000Z',
        };

        const app = {
            fileManager: {
                processFrontMatter: vi.fn(async (_file: any, callback: (fm: any) => void) => {
                    callback(frontmatter);
                }),
            },
        } as any;

        const service = new FrontmatterService(app);

        await service.setConcepts({} as any, []);

        expect(frontmatter.me_concepts).toBeUndefined();
        expect(frontmatter.me_indexed_at).toBeUndefined();
    });

    it('removes me_concepts and me_indexed_at in updateAfterIndexing when concepts empty', async () => {
        const frontmatter: Record<string, any> = {
            me_concepts: ['[[_me/旧概念]]'],
            me_indexed_at: '2025-01-01T00:00:00.000Z',
        };

        const app = {
            fileManager: {
                processFrontMatter: vi.fn(async (_file: any, callback: (fm: any) => void) => {
                    callback(frontmatter);
                }),
            },
        } as any;

        const service = new FrontmatterService(app);

        await service.updateAfterIndexing({} as any, []);

        expect(frontmatter.me_concepts).toBeUndefined();
        expect(frontmatter.me_indexed_at).toBeUndefined();
    });
});
