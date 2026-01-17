module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/__tests__/**',
    ],
    moduleNameMapper: {
        '^@xenova/transformers$': '<rootDir>/src/__mocks__/transformers.ts',
        '^obsidian$': '<rootDir>/src/__mocks__/obsidian.ts',
        '^@qdrant/js-client-rest$': '<rootDir>/src/__mocks__/@qdrant/js-client-rest.ts',
    },
};
