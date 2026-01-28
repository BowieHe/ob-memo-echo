import { DEFAULT_SETTINGS } from '../settings';

describe('DEFAULT_SETTINGS', () => {
    it('removes deprecated settings flags', () => {
        expect(DEFAULT_SETTINGS).not.toHaveProperty('createConceptPages');
        expect(DEFAULT_SETTINGS).not.toHaveProperty('enableIncrementalIndexing');
    });

    it('keeps a fixed concept page prefix', () => {
        expect(DEFAULT_SETTINGS.conceptPageFolder).toBe('_me');
    });
});
