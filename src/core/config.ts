/**
 * Global config accessor helpers
 * Provides convenient access to model configurations from anywhere in the plugin
 */

import { DEFAULT_LLM_CONFIG, type BaseModelConfig } from './types/setting';
import type MemoEchoPlugin from '../main';

/**
 * Get the plugin instance from the app
 * Note: Requires extending App interface or using type assertion
 */
export function getPlugin(app: any): MemoEchoPlugin | undefined {
    return app?.plugins?.plugins?.['memo-echo'] as MemoEchoPlugin;
}

/**
 * Get model config (embedding or llm) from the plugin
 * @param app - Obsidian App instance
 * @param type - 'embedding' or 'llm'
 * @returns BaseModelConfig
 */
export function getModelConfig(
    app: any,
    type: 'embedding' | 'llm'
): BaseModelConfig {
    const plugin = getPlugin(app);
    if (!plugin?.settings) {
        return DEFAULT_LLM_CONFIG;
    }
    return type === 'embedding' ? plugin.settings.embeddingConfig : plugin.settings.llmConfig;
}

/**
 * Get embedding config specifically
 */
export function getEmbeddingConfig(app: any): BaseModelConfig {
    return getModelConfig(app, 'embedding');
}

/**
 * Get LLM config specifically
 */
export function getLlmConfig(app: any): BaseModelConfig {
    return getModelConfig(app, 'llm');
}
