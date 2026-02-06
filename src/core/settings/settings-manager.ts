/**
 * Settings Manager
 * Encapsulates all settings update logic with validation and service coordination
 */

import type { MemoEchoSettings } from '../../views/settings';
import type { SettingsUpdateResult, SettingsContext, ServiceUpdaters } from './types';
import { EmbeddingSettingsHandler } from './settings-handlers';
import { LlmSettingsHandler } from './settings-handlers';
import { ConceptExtractionSettingsHandler } from './settings-handlers';
import { AssociationSettingsHandler } from './settings-handlers';
import { ConceptFESettingsHandler } from './settings-handlers';
import { ConceptSkipSettingsHandler } from './settings-handlers';
import type { BaseModelConfig } from '../types/setting';
import type { ConceptExtractionConfig } from '../types/setting';
import type { ConceptFEConfig } from '../types/setting';
import type { ConceptSkipConfig } from '../types/setting';
import type { AssociationConfig as EngineAssociationConfig } from '../types/association';
import type { UIAssociationConfig } from './types';

/**
 * SettingsManager - Encapsulates all settings update logic
 *
 * Responsibilities:
 * - Validates settings before applying
 * - Coordinates persistence (saveSettings)
 * - Updates affected services
 * - Provides type-safe update methods
 *
 * Benefits:
 * - Decouples UI from service update logic
 * - Easy to unit test (no Obsidian dependencies)
 * - Centralized validation and error handling
 * - Clear audit trail of settings changes
 */
export class SettingsManager {
    private settings: MemoEchoSettings;
    private saveSettings: () => Promise<void>;
    private serviceUpdaters: ServiceUpdaters;

    // Handler instances for each settings group
    private handlers: Map<string, any> = new Map();

    constructor(
        settings: MemoEchoSettings,
        saveSettings: () => Promise<void>,
        serviceUpdaters: ServiceUpdaters
    ) {
        this.settings = settings;
        this.saveSettings = saveSettings;
        this.serviceUpdaters = serviceUpdaters;

        // Initialize handlers
        this.handlers.set('embedding', new EmbeddingSettingsHandler(serviceUpdaters.embedding));
        this.handlers.set('llm', new LlmSettingsHandler(serviceUpdaters.llm));
        this.handlers.set('conceptExtraction', new ConceptExtractionSettingsHandler(serviceUpdaters.conceptExtraction));
        this.handlers.set('association', new AssociationSettingsHandler(serviceUpdaters.uiAssociation));
        this.handlers.set('conceptFE', new ConceptFESettingsHandler(serviceUpdaters.conceptFE));
        this.handlers.set('conceptSkip', new ConceptSkipSettingsHandler(serviceUpdaters.conceptSkip));
    }

    /**
     * Update embedding configuration
     * @example
     * await settingsManager.updateEmbedding({ provider: 'openai' })
     */
    async updateEmbedding(config: Partial<BaseModelConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('embedding', this.settings.embeddingConfig, config);
    }

    /**
     * Update LLM configuration
     */
    async updateLlm(config: Partial<BaseModelConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('llm', this.settings.llmConfig, config);
    }

    /**
     * Update concept extraction configuration
     */
    async updateConceptExtraction(config: Partial<ConceptExtractionConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('conceptExtraction', this.settings.conceptExtraction, config);
    }

    /**
     * Update association configuration
     */
    async updateAssociation(config: Partial<UIAssociationConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('association', this.settings.association, config);
    }

    /**
     * Update concept front-end configuration
     */
    async updateConceptFE(config: Partial<ConceptFEConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('conceptFE', this.settings.conceptFE, config);
    }

    /**
     * Update concept skip configuration
     */
    async updateConceptSkip(config: Partial<ConceptSkipConfig>): Promise<SettingsUpdateResult> {
        return this.updateGroup('conceptSkip', this.settings.conceptSkip, config);
    }

    /**
     * Generic group update method
     */
    private async updateGroup<T extends object>(
        groupName: string,
        currentConfig: T,
        updates: Partial<T>
    ): Promise<SettingsUpdateResult> {
        const handler = this.handlers.get(groupName);
        if (!handler) {
            return { success: false, errors: [{ field: groupName, message: 'Unknown settings group' }] };
        }

        // Validate
        const validationResult = handler.validate(updates);
        if (!validationResult.success) {
            console.warn(`[SettingsManager] Validation failed for ${groupName}`, validationResult);
            return validationResult;
        }

        // Create context
        const context: SettingsContext = {
            saveSettings: this.saveSettings,
        };

        // Apply updates (handler will call service updater and save)
        try {
            await handler.apply(updates, context);
            // Merge updates into settings object (for object configs)
            Object.assign(currentConfig, updates);
            console.log(`[SettingsManager] Updated ${groupName}`, updates);
            return { success: true };
        } catch (error) {
            console.error(`[SettingsManager] Failed to apply settings for ${groupName}`, error);
            return {
                success: false,
                errors: [{ field: groupName, message: error instanceof Error ? error.message : String(error) }],
            };
        }
    }

    /**
     * Get current settings snapshot (for testing/inspection)
     */
    getSettings(): Readonly<MemoEchoSettings> {
        // Return a deep copy to prevent mutations
        return JSON.parse(JSON.stringify(this.settings));
    }
}
