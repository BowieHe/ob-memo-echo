export interface ConceptMatch {
	originalTerm: string; // 文档中找到的原始词
	matchedConcept: string; // 匹配到的标准化概念名
	matchType: "exact" | "alias" | "new"; // 匹配类型
	confidence: number; // 这个匹配的置信度 (0-1)
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
