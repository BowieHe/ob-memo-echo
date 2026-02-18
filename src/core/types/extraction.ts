/**
 * Extraction Types
 * Types for metadata and concept extraction
 */

/**
 * Me concept link structure (for full-text recommended wikilinks)
 */
export interface MeConceptLink {
	raw_text: string;  // "[[虚拟机]]"
	reason: string;
}

/**
 * Extracted metadata from content
 */
export interface ExtractedMetadata {
	summary: string;
	me_tag: string[];  // tags → me_tag
	category: string;
	me_concepts: MeConceptLink[];  // Full-text recommended wikilinks
}

export const EMPTY_EXTRACTED_METADATA: ExtractedMetadata = {
	summary: "",
	me_tag: [],
	category: "",
	me_concepts: [],
};

/**
 * Configuration for MetadataExtractor
 */
export interface MetadataExtractorConfig {
	enableAi: boolean;
	provider: "ollama" | "openai";
	ollamaUrl?: string;
	ollamaModel?: string;
	openaiUrl?: string;
	openaiModel?: string;
	openaiApiKey?: string;
}

export interface ExtractedConceptDetail {
	name: string;
	confidence: number;
	reason: string;
}
