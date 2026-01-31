import { extractWikilinkConcepts } from '@utils/wikilink-utils';

describe('extractWikilinkConcepts', () => {
    it('extracts concepts from wikilinks with aliases and paths', () => {
        const content = [
            'This mentions [[_me/幂等性]].',
            'Also [[概念A|别名]] and [[folder/概念B]].',
            'Ignore empty [[ ]] and normal text.',
        ].join('\n');

        const concepts = extractWikilinkConcepts(content);

        expect(concepts).toContain('幂等性');
        expect(concepts).toContain('概念A');
        expect(concepts).toContain('概念B');
    });

    it('deduplicates repeated concepts', () => {
        const content = '[[概念A]] and [[folder/概念A]] and [[概念A|别名]]';

        const concepts = extractWikilinkConcepts(content);

        expect(concepts).toEqual(['概念A']);
    });
});
