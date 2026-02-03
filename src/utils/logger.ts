export interface Logger {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
}

export function createLogger(enabled: boolean, prefix: string = '[MemoEcho]'): Logger {
    const log = (method: 'info' | 'warn' | 'error' | 'debug') => {
        return (message: string, data?: Record<string, unknown>) => {
            // Always use console to respect Obsidian's log level filtering
            // Obsidian will handle filtering based on its settings
            if (data) {
                console[method](`${prefix} ${message}`, data);
            } else {
                console[method](`${prefix} ${message}`);
            }
        };
    };

    return {
        debug: log('debug'),
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
    };
}
