import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '@utils/logger';

describe('createLogger', () => {
    it('always logs regardless of enabled flag (respects Obsidian log level)', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const logger = createLogger(false);

        logger.debug('test message');

        // Logger now always outputs to console, letting Obsidian filter by level
        expect(debug).toHaveBeenCalled();
        debug.mockRestore();
    });

    it('logs with correct method and prefix', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const logger = createLogger(true, '[Test]');

        logger.info('hello', { foo: 'bar' });
        logger.warn('warning message');

        expect(info).toHaveBeenCalled();
        expect(info.mock.calls[0][0]).toContain('[Test]');
        expect(warn).toHaveBeenCalled();

        info.mockRestore();
        warn.mockRestore();
    });

    it('logs debug using console.debug', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const logger = createLogger(true, '[Test]');

        logger.debug('debug message');

        expect(debug).toHaveBeenCalledWith('[Test] debug message');
        debug.mockRestore();
    });
});
