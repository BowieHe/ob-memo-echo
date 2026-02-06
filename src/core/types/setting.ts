export interface BaseModelConfig {
    provider: "ollama" | "openai";
    model: string;
    baseUrl: string;
    apiKey: string;
}

export const DEFAULT_EMBEDDING_CONFIG: BaseModelConfig = {
    provider: "ollama",
    model: "bge-m3:latest",
    baseUrl: "http://localhost:11434",
    apiKey: "",
};

export const DEFAULT_LLM_CONFIG: BaseModelConfig = {
    provider: "ollama",
    model: "qwen3:4b",
    baseUrl: "http://localhost:11434",
    apiKey: "",
};

export interface ConceptExtractionConfig {
    maxConcepts: number;
    focusOnAbstractConcepts: boolean; // Focus on abstract concepts vs specific tech
    minConfidence: number; // Minimum confidence threshold for concepts
    excludeGenericConcepts: string[]; // Comma-separated list of generic concepts to exclude
}

export const DEFAULT_CONCEPT_EXTRACTION_CONFIG: ConceptExtractionConfig = {
    maxConcepts: 5,
    focusOnAbstractConcepts: true,
    minConfidence: 0.7,
    excludeGenericConcepts: ["技术开发", "总结", "概述", "简介", "设计"],
};

export interface ConceptFEConfig {
    //front end config
    injectToFrontmatter: boolean; // Whether to inject concepts into note frontmatter
    autoCreateConceptPage: boolean; // Whether to auto-create concept note pages
    conceptPagePrefix: string; // Prefix for auto-created concept pages
}

export const DEFAULT_CONCEPT_FE_CONFIG: ConceptFEConfig = {
    injectToFrontmatter: true,
    autoCreateConceptPage: false,
    conceptPagePrefix: "_me",
};

export interface ConceptSkipConfig {
    skipPaths: string[];
    skipTags: string[];
    minTextLength: number;
    conceptDictionaryPath: string;
}

export const DEFAULT_CONCEPT_SKIP_CONFIG: ConceptSkipConfig = {
    skipPaths: ["_me/", "templates/", "daily/"],
    skipTags: ["vocabulary", "daily", "template", "image-collection"],
    minTextLength: 100,
    conceptDictionaryPath: "_me/_concept-dictionary.json",
};

export interface AssociationConfig {
    associationMinConfidence: number;
    associationAutoAccept: boolean;
    associationAutoAcceptConfidence: number;
    associationAutoScanBatchSize: number;
}

export const DEFAULT_ASSOCIATION_CONFIG: AssociationConfig = {
    associationMinConfidence: 0.5,
    associationAutoAccept: false,
    associationAutoAcceptConfidence: 0.9,
    associationAutoScanBatchSize: 50,
};
