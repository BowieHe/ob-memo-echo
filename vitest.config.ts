import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
        include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.d.ts',
                'src/__tests__/**',
                'src/__mocks__/**',
            ],
        },
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@core': path.resolve(__dirname, './src/core'),
            '@services': path.resolve(__dirname, './src/services'),
            '@backends': path.resolve(__dirname, './src/backends'),
            '@components': path.resolve(__dirname, './src/components'),
            '@utils': path.resolve(__dirname, './src/utils'),
            '@xenova/transformers': path.resolve(__dirname, './src/__mocks__/transformers.ts'),
            obsidian: path.resolve(__dirname, './src/__mocks__/obsidian.ts'),
            '@qdrant/js-client-rest': path.resolve(__dirname, './src/__mocks__/@qdrant/js-client-rest.ts'),
        },
    },
});
