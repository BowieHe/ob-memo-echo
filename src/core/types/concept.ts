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
    originalTerm: string;
    matchedConcept: string;
    matchType: 'exact' | 'alias' | 'new';
    confidence: number;
}

export interface ConceptCountRule {
    minChars: number;
    maxChars: number;
    maxConcepts: number;
}

export interface SkipRules {
    skipPaths: string[];
    skipTags: string[];
    minTextLength: number;
    maxImageRatio: number;
}

export interface NoteTypeDetection {
    type: 'article' | 'normal' | 'vocabulary' | 'daily' | 'image-collection' | 'template';
    confidence: number;
    shouldSkip: boolean;
    reason?: string;
}

export interface ConceptExtractionSettings {
    enableConceptExtraction: boolean;
    injectToFrontmatter: boolean;
    autoCreateConceptPage: boolean;
    conceptPagePrefix: string;
    conceptCountRules: ConceptCountRule[];
    skipRules: SkipRules;
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
    noteType?: NoteTypeDetection['type'];
}
