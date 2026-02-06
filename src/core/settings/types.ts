/**
 * Settings Manager Types
 * Core types for the settings management system
 */

import type { BaseModelConfig } from '../types/setting';
import type { ConceptExtractionConfig } from '../types/setting';
import type { ConceptFEConfig } from '../types/setting';
import type { ConceptSkipConfig } from '../types/setting';
import type { AssociationConfig as EngineAssociationConfig } from '../types/association';
import type { EmbeddingConfig } from '../types/embedding';
import type { MetadataExtractorConfig } from '../types/extraction';

/**
 * UI Association Settings (from settings.ts)
 * These are user-configurable settings for the association feature
 */
export interface UIAssociationConfig {
    associationMinConfidence: number;
    associationAutoAccept: boolean;
    associationAutoAcceptConfidence: number;
    associationAutoScanBatchSize: number;
}

/**
 * Result of a settings update operation
 */
export interface SettingsUpdateResult {
    success: boolean;
    errors?: Array<{ field: string; message: string }>;
}

/**
 * Context provided to settings handlers
 */
export interface SettingsContext {
    saveSettings: () => Promise<void>;
}

/**
 * Base interface for settings group handlers
 */
export interface SettingsGroupHandler<TConfig> {
    readonly groupName: string;
    validate(config: Partial<TConfig>): SettingsUpdateResult;
    apply(config: Partial<TConfig>, context: SettingsContext): Promise<void>;
}

/**
 * Service updater functions for each settings group
 *
 * Note: embedding and llm use BaseModelConfig (unified UI format) with adapters in main.ts
 * to convert to service-specific config types (EmbeddingConfig, MetadataExtractorConfig)
 */
export interface ServiceUpdaters {
    embedding: (config: Partial<BaseModelConfig>) => void | Promise<void>;
    llm: (config: Partial<BaseModelConfig>) => void | Promise<void>;
    conceptExtraction: (config: Partial<ConceptExtractionConfig>) => void | Promise<void>;
    association: (config: Partial<EngineAssociationConfig>) => void | Promise<void>;
    conceptExtractionSettings: () => void | Promise<void>;
    conceptFE: (config: Partial<ConceptFEConfig>) => void | Promise<void>;
    conceptSkip: (config: Partial<ConceptSkipConfig>) => void | Promise<void>;
    uiAssociation: (config: Partial<UIAssociationConfig>) => void | Promise<void>;
}
