/**
 * Settings Handlers
 * Handler classes for each settings group with validation logic
 */

import type {
    SettingsGroupHandler,
    SettingsContext,
    SettingsUpdateResult,
    ServiceUpdaters,
} from './types';
import type { BaseModelConfig } from '../types/setting';
import type { ConceptExtractionConfig } from '../types/setting';
import type { ConceptFEConfig } from '../types/setting';
import type { ConceptSkipConfig } from '../types/setting';
import type { AssociationConfig as EngineAssociationConfig } from '../types/association';
import type { UIAssociationConfig } from './types';

/**
 * Embedding Settings Handler
 * Handles updates for embedding configuration (provider, URLs, models)
 */
export class EmbeddingSettingsHandler implements SettingsGroupHandler<BaseModelConfig> {
    readonly groupName = 'embedding';

    constructor(private updateService: (config: Partial<BaseModelConfig>) => void | Promise<void>) {}

    validate(config: Partial<BaseModelConfig>): SettingsUpdateResult {
        // Validate provider
        if (config.provider && !['ollama', 'openai', 'local'].includes(config.provider)) {
            return {
                success: false,
                errors: [{ field: 'provider', message: 'Invalid provider' }],
            };
        }

        // Validate URL format
        if (config.baseUrl) {
            try {
                new URL(config.baseUrl);
            } catch {
                return {
                    success: false,
                    errors: [{ field: 'baseUrl', message: 'Invalid URL format' }],
                };
            }
        }

        return { success: true };
    }

    async apply(config: Partial<BaseModelConfig>, context: SettingsContext): Promise<void> {
        // BaseModelConfig already has the right structure, just pass it through
        await this.updateService(config);
        await context.saveSettings();
    }
}

/**
 * LLM Settings Handler
 * Handles updates for LLM configuration (used by metadata extractor)
 */
export class LlmSettingsHandler implements SettingsGroupHandler<BaseModelConfig> {
    readonly groupName = 'llm';

    constructor(private updateService: (config: Partial<BaseModelConfig>) => void | Promise<void>) {}

    validate(config: Partial<BaseModelConfig>): SettingsUpdateResult {
        if (config.provider && !['ollama', 'openai'].includes(config.provider)) {
            return {
                success: false,
                errors: [{ field: 'provider', message: 'Invalid provider' }],
            };
        }

        return { success: true };
    }

    async apply(config: Partial<BaseModelConfig>, context: SettingsContext): Promise<void> {
        // BaseModelConfig already has the right structure
        await this.updateService(config);
        await context.saveSettings();
    }
}

/**
 * Concept Extraction Settings Handler
 */
export class ConceptExtractionSettingsHandler implements SettingsGroupHandler<ConceptExtractionConfig> {
    readonly groupName = 'conceptExtraction';

    constructor(private updateService: (config: Partial<ConceptExtractionConfig>) => void | Promise<void>) {}

    validate(config: Partial<ConceptExtractionConfig>): SettingsUpdateResult {
        if (config.maxConcepts !== undefined) {
            if (config.maxConcepts < 1 || config.maxConcepts > 20) {
                return {
                    success: false,
                    errors: [{ field: 'maxConcepts', message: 'Must be between 1 and 20' }],
                };
            }
        }

        if (config.minConfidence !== undefined) {
            if (config.minConfidence < 0 || config.minConfidence > 1) {
                return {
                    success: false,
                    errors: [{ field: 'minConfidence', message: 'Must be between 0 and 1' }],
                };
            }
        }

        return { success: true };
    }

    async apply(config: Partial<ConceptExtractionConfig>, context: SettingsContext): Promise<void> {
        await this.updateService(config);
        await context.saveSettings();
    }
}

/**
 * Association Settings Handler
 * Handles UI association settings
 */
export class AssociationSettingsHandler implements SettingsGroupHandler<UIAssociationConfig> {
    readonly groupName = 'association';

    constructor(private updateSettings: (config: Partial<UIAssociationConfig>) => void) {}

    validate(config: Partial<UIAssociationConfig>): SettingsUpdateResult {
        if (config.associationMinConfidence !== undefined) {
            if (config.associationMinConfidence < 0 || config.associationMinConfidence > 1) {
                return {
                    success: false,
                    errors: [{ field: 'associationMinConfidence', message: 'Must be between 0 and 1' }],
                };
            }
        }

        if (config.associationAutoScanBatchSize !== undefined) {
            if (config.associationAutoScanBatchSize < 1) {
                return {
                    success: false,
                    errors: [{ field: 'associationAutoScanBatchSize', message: 'Must be positive' }],
                };
            }
        }

        return { success: true };
    }

    async apply(config: Partial<UIAssociationConfig>, context: SettingsContext): Promise<void> {
        this.updateSettings(config);
        await context.saveSettings();
    }
}

/**
 * Concept FE Settings Handler
 * Handles front-end injection settings
 */
export class ConceptFESettingsHandler implements SettingsGroupHandler<ConceptFEConfig> {
    readonly groupName = 'conceptFE';

    constructor(private updateService: (config: Partial<ConceptFEConfig>) => void | Promise<void>) {}

    validate(_config: Partial<ConceptFEConfig>): SettingsUpdateResult {
        return { success: true };
    }

    async apply(config: Partial<ConceptFEConfig>, context: SettingsContext): Promise<void> {
        await this.updateService(config);
        await context.saveSettings();
    }
}

/**
 * Concept Skip Settings Handler
 * Handles skip rules for concept extraction
 */
export class ConceptSkipSettingsHandler implements SettingsGroupHandler<ConceptSkipConfig> {
    readonly groupName = 'conceptSkip';

    constructor(private updateService: (config: Partial<ConceptSkipConfig>) => void | Promise<void>) {}

    validate(config: Partial<ConceptSkipConfig>): SettingsUpdateResult {
        if (config.minTextLength !== undefined) {
            if (config.minTextLength < 0) {
                return {
                    success: false,
                    errors: [{ field: 'minTextLength', message: 'Must be non-negative' }],
                };
            }
        }

        return { success: true };
    }

    async apply(config: Partial<ConceptSkipConfig>, context: SettingsContext): Promise<void> {
        await this.updateService(config);
        await context.saveSettings();
    }
}

/**
 * Debug Settings Handler
 * Special handler for debug logging (updates multiple services)
 */
export class DebugSettingsHandler implements SettingsGroupHandler<{ debugLogging: boolean }> {
    readonly groupName = 'debug';

    constructor(
        private updateLogger: (enabled: boolean) => void | Promise<void>,
        private updateConceptSettings: () => void | Promise<void>
    ) {}

    validate(_config: Partial<{ debugLogging: boolean }>): SettingsUpdateResult {
        return { success: true };
    }

    async apply(config: Partial<{ debugLogging: boolean }>, context: SettingsContext): Promise<void> {
        if (config.debugLogging !== undefined) {
            await this.updateLogger(config.debugLogging);
            await this.updateConceptSettings();
            await context.saveSettings();
        }
    }
}
