import type { ConceptSkipConfig } from "./setting";

export interface ConceptDictionary {
    version: string;
    lastUpdated: string;
    concepts: Record<string, ConceptEntry>;
}

export interface ConceptEntry {
    aliases: string[];
    category?: string;
    description?: string;
    createdAt: string;
    noteCount: number;
}

export interface ConceptMatch {
    originalTerm: string; // 文档中找到的原始词
    matchedConcept: string; // 匹配到的标准化概念名
    matchType: "exact" | "alias" | "new"; // 匹配类型
    confidence: number; // 这个匹配的置信度 (0-1)
}

export interface SkipRules {
    skipPaths: string[];
    skipTags: string[];
    minTextLength: number;
    maxImageRatio: number;
}

export interface NoteTypeDetection {
    type:
        | "article"
        | "normal"
        | "vocabulary"
        | "daily"
        | "image-collection"
        | "template";
    confidence: number;
    shouldSkip: boolean;
    reason?: string;
}

export interface ConceptExtractionSettings {
    enableConceptExtraction: boolean;
    injectToFrontmatter: boolean;
    autoCreateConceptPage: boolean;
    conceptPagePrefix: string;
    skipRules: ConceptSkipConfig;
    conceptDictionaryPath: string;
}

export interface ExtractedConceptWithMatch {
    name: string;
    confidence: number;
    reason: string;
    matchInfo: ConceptMatch;
}

export interface ConfirmedConcept {
    name: string;
    isNew: boolean;
    createPage: boolean;
    aliases?: string[];
}

export interface ConceptExtractionResult {
    skipped: boolean;
    reason?: string;
    concepts?: ExtractedConceptWithMatch[];
    noteType?: NoteTypeDetection["type"];
}
