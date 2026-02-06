/**
 * SettingsManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsManager } from '../settings-manager';
import type { MemoEchoSettings } from '../../../views/settings';
import {
    DEFAULT_EMBEDDING_CONFIG,
    DEFAULT_LLM_CONFIG,
    DEFAULT_CONCEPT_EXTRACTION_CONFIG,
    DEFAULT_CONCEPT_FE_CONFIG,
    DEFAULT_CONCEPT_SKIP_CONFIG,
    DEFAULT_ASSOCIATION_CONFIG,
} from '../../types/setting';
import type { ServiceUpdaters } from '../types';

// Mock settings
const mockSettings: MemoEchoSettings = {
    // Model configs
    embeddingConfig: { ...DEFAULT_EMBEDDING_CONFIG },
    llmConfig: { ...DEFAULT_LLM_CONFIG },

    // Qdrant settings
    qdrantUrl: 'http://localhost:6333',
    qdrantCollection: 'obsidian_notes',

    // Concept extraction configs
    conceptExtraction: { ...DEFAULT_CONCEPT_EXTRACTION_CONFIG },
    conceptFE: { ...DEFAULT_CONCEPT_FE_CONFIG },
    conceptSkip: { ...DEFAULT_CONCEPT_SKIP_CONFIG },

    // Other concept settings
    enableConceptExtraction: true,
    conceptCountRules: [
        { minChars: 0, maxChars: 199, maxConcepts: 1 },
        { minChars: 200, maxChars: 499, maxConcepts: 2 },
        { minChars: 500, maxChars: 999, maxConcepts: 3 },
        { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
    ],

    // Association config
    association: { ...DEFAULT_ASSOCIATION_CONFIG },
    associationIgnoredAssociations: [],
    associationDeletedConcepts: {},

    debugLogging: true,
};

// Mock service updaters
const mockServiceUpdaters: ServiceUpdaters = {
    embedding: vi.fn(),
    llm: vi.fn(),
    conceptExtraction: vi.fn(),
    association: vi.fn(),
    conceptExtractionSettings: vi.fn(),
    conceptFE: vi.fn(),
    conceptSkip: vi.fn(),
    uiAssociation: vi.fn(),
};

const mockSaveSettings = vi.fn();

describe('SettingsManager', () => {
    let settingsManager: SettingsManager;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        mockSaveSettings.mockResolvedValue(undefined);

        // Reset settings to default
        mockSettings.embeddingConfig = { ...DEFAULT_EMBEDDING_CONFIG };
        mockSettings.llmConfig = { ...DEFAULT_LLM_CONFIG };
        mockSettings.conceptExtraction = { ...DEFAULT_CONCEPT_EXTRACTION_CONFIG };
        mockSettings.conceptFE = { ...DEFAULT_CONCEPT_FE_CONFIG };
        mockSettings.conceptSkip = { ...DEFAULT_CONCEPT_SKIP_CONFIG };
        mockSettings.association = { ...DEFAULT_ASSOCIATION_CONFIG };
        mockSettings.debugLogging = true;

        // Create new SettingsManager instance
        settingsManager = new SettingsManager(
            mockSettings,
            mockSaveSettings,
            mockServiceUpdaters
        );
    });

    describe('Embedding Settings', () => {
        it('should update and initialize embedding config', async () => {
            // Test update
            const result = await settingsManager.updateEmbedding({
                provider: 'openai',
                model: 'text-embedding-3-small',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });

            expect(result.success).toBe(true);
            expect(mockSettings.embeddingConfig.provider).toBe('openai');
            expect(mockSettings.embeddingConfig.model).toBe('text-embedding-3-small');
            expect(mockSaveSettings).toHaveBeenCalled();
            expect(mockServiceUpdaters.embedding).toHaveBeenCalled();
        });

        it('should validate URL format', async () => {
            const result = await settingsManager.updateEmbedding({
                baseUrl: 'invalid-url',
            });

            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors?.[0].field).toBe('baseUrl');
        });

        it('should reset to default embedding config', async () => {
            // First change the config
            await settingsManager.updateEmbedding({ provider: 'openai' });

            // Reset by updating back to defaults
            const result = await settingsManager.updateEmbedding(DEFAULT_EMBEDDING_CONFIG);

            expect(result.success).toBe(true);
            expect(mockSettings.embeddingConfig).toEqual(DEFAULT_EMBEDDING_CONFIG);
        });
    });

    describe('LLM Settings', () => {
        it('should update and initialize LLM config', async () => {
            const result = await settingsManager.updateLlm({
                provider: 'openai',
                model: 'gpt-4',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: 'sk-test',
            });

            expect(result.success).toBe(true);
            expect(mockSettings.llmConfig.provider).toBe('openai');
            expect(mockSettings.llmConfig.model).toBe('gpt-4');
            expect(mockSaveSettings).toHaveBeenCalled();
            expect(mockServiceUpdaters.llm).toHaveBeenCalled();
        });

        it('should validate provider', async () => {
            const result = await settingsManager.updateLlm({
                provider: 'invalid' as any,
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].field).toBe('provider');
        });
    });

    describe('Concept Extraction Settings', () => {
        it('should update and initialize concept extraction config', async () => {
            const result = await settingsManager.updateConceptExtraction({
                maxConcepts: 10,
                minConfidence: 0.8,
                focusOnAbstractConcepts: false,
            });

            expect(result.success).toBe(true);
            expect(mockSettings.conceptExtraction.maxConcepts).toBe(10);
            expect(mockSettings.conceptExtraction.minConfidence).toBe(0.8);
            expect(mockSaveSettings).toHaveBeenCalled();
            expect(mockServiceUpdaters.conceptExtraction).toHaveBeenCalled();
        });

        it('should validate maxConcepts range', async () => {
            const result = await settingsManager.updateConceptExtraction({
                maxConcepts: 25, //超出范围 1-20
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].field).toBe('maxConcepts');
        });

        it('should validate minConfidence range', async () => {
            const result = await settingsManager.updateConceptExtraction({
                minConfidence: 1.5, // 超出范围 0-1
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].field).toBe('minConfidence');
        });
    });

    describe('Association Settings', () => {
        it('should update and initialize association config', async () => {
            const result = await settingsManager.updateAssociation({
                associationMinConfidence: 0.7,
                associationAutoAccept: true,
                associationAutoAcceptConfidence: 0.95,
                associationAutoScanBatchSize: 100,
            });

            expect(result.success).toBe(true);
            expect(mockSettings.association.associationMinConfidence).toBe(0.7);
            expect(mockSettings.association.associationAutoAccept).toBe(true);
            expect(mockSaveSettings).toHaveBeenCalled();
        });

        it('should validate associationMinConfidence range', async () => {
            const result = await settingsManager.updateAssociation({
                associationMinConfidence: 1.5,
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].field).toBe('associationMinConfidence');
        });
    });

    describe('Concept FE Settings', () => {
        it('should update and initialize concept FE config', async () => {
            const result = await settingsManager.updateConceptFE({
                injectToFrontmatter: false,
                autoCreateConceptPage: true,
                conceptPagePrefix: '_custom',
            });

            expect(result.success).toBe(true);
            expect(mockSettings.conceptFE.injectToFrontmatter).toBe(false);
            expect(mockSettings.conceptFE.conceptPagePrefix).toBe('_custom');
            expect(mockSaveSettings).toHaveBeenCalled();
        });
    });

    describe('Concept Skip Settings', () => {
        it('should update and initialize concept skip config', async () => {
            const result = await settingsManager.updateConceptSkip({
                skipPaths: ['_custom/', 'templates/'],
                skipTags: ['template', 'daily'],
                minTextLength: 200,
            });

            expect(result.success).toBe(true);
            expect(mockSettings.conceptSkip.skipPaths).toEqual(['_custom/', 'templates/']);
            expect(mockSettings.conceptSkip.minTextLength).toBe(200);
            expect(mockSaveSettings).toHaveBeenCalled();
        });

        it('should validate minTextLength', async () => {
            const result = await settingsManager.updateConceptSkip({
                minTextLength: -10, // 负数
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].field).toBe('minTextLength');
        });
    });

    describe('Debug Settings', () => {
        it('should update and initialize debug logging', async () => {
            const result = await settingsManager.updateDebugLogging(false);

            expect(result.success).toBe(true);
            expect(mockSettings.debugLogging).toBe(false);
            expect(mockSaveSettings).toHaveBeenCalled();
        });
    });

    describe('Get Settings', () => {
        it('should return a readonly snapshot of settings', () => {
            const settings = settingsManager.getSettings();

            expect(settings).toBeDefined();
            expect(settings.embeddingConfig).toEqual(mockSettings.embeddingConfig);
            expect(settings.llmConfig).toEqual(mockSettings.llmConfig);

            // Verify it's a snapshot (modifying shouldn't affect original)
            settings.embeddingConfig.provider = 'openai';
            expect(mockSettings.embeddingConfig.provider).toBe('ollama');
        });
    });
});
