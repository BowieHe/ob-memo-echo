/**
 * Extraction Types
 * Types for metadata and concept extraction
 */

export interface ExtractedMetadataConcept {
	name: string;
	confidence: number;
}

/**
 * Extracted metadata from content
 */
export interface ExtractedMetadata {
	summary: string;
	tags: string[];
	category: string;
	concepts: ExtractedMetadataConcept[]; // Abstract concepts with confidence
}

export const EMPTY_EXTRACTED_METADATA: ExtractedMetadata = {
	summary: "",
	tags: [],
	category: "",
	concepts: [],
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
