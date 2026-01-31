/**
 * Constants - Centralized constants for vector storage and management
 */

/**
 * Vector configuration interface
 */
export interface VectorConfig {
    name: string;
    value: string;
    weight: number;
    label: string;
    description: string;
}

/**
 * Vector definitions - single source of truth
 */
export const VECTOR_CONTENT: VectorConfig = {
    name: 'CONTENT',
    value: 'content_vec',
    weight: 0.4,
    label: 'Content',
    description: 'Main content vector from note body',
};

export const VECTOR_SUMMARY: VectorConfig = {
    name: 'SUMMARY',
    value: 'summary_vec',
    weight: 0.4,
    label: 'Summary',
    description: 'Summary vector from note summary',
};

export const VECTOR_TITLE: VectorConfig = {
    name: 'TITLE',
    value: 'title_vec',
    weight: 0.2,
    label: 'Title',
    description: 'Title vector from note title',
};

/**
 * All vector configs as array (for iteration)
 */
export const VECTOR_CONFIGS = [VECTOR_CONTENT, VECTOR_SUMMARY, VECTOR_TITLE];

/**
 * Vector name enum - for backward compatibility and type safety
 */
export enum VECTOR_NAMES {
    CONTENT = 'content_vec',
    SUMMARY = 'summary_vec',
    TITLE = 'title_vec',
}

/**
 * Default fusion weights
 */
export const DEFAULT_WEIGHTS: Record<VECTOR_NAMES, number> = {
    [VECTOR_NAMES.CONTENT]: VECTOR_CONTENT.weight,
    [VECTOR_NAMES.SUMMARY]: VECTOR_SUMMARY.weight,
    [VECTOR_NAMES.TITLE]: VECTOR_TITLE.weight,
};

/**
 * Search options defaults
 */
export const SEARCH_DEFAULTS = {
    limit: 10,
    prefetchMultiplier: 2, // Fetch 2x more for fusion
} as const;

/**
 * View Type Constants - Obsidian View registration
 */
export const VIEW_TYPE_ASSOCIATION = 'association-view';
export const VIEW_TYPE_UNIFIED_SEARCH = 'unified-search-view';

/**
 * Category Keywords - for metadata extraction
 */
export const CATEGORY_KEYWORDS = {
    tech: ['code', 'function', 'class', 'api', 'bug', 'algorithm', 'data', 'programming', 'software', 'development', 'typescript', 'javascript', 'python', 'rust', 'java', 'database', 'server', 'client', '代码', '函数', '类', '算法', '数据', '编程', '软件', '开发'],
    diary: ['今天', '昨天', '明天', '心情', '感觉', '想到', '觉得', 'today', 'yesterday', 'feel', 'feeling', 'mood'],
    book: ['读了', '书中', '作者', '认为', '观点', '章节', 'book', 'author', 'chapter', 'read', 'reading'],
    idea: ['想法', '灵感', '或许', '可以', '尝试', '创意', 'idea', 'inspiration', 'maybe', 'perhaps', 'creative'],
} as const;

/**
 * Valid note categories
 */
export const VALID_CATEGORIES = ['技术笔记', '生活日记', '读书笔记', '想法灵感', '工作记录'] as const;

/**
 * Default category
 */
export const DEFAULT_CATEGORY = '技术笔记';

/**
 * Metadata extraction constraints
 */
export const METADATA_CONSTRAINTS = {
    maxSummaryLength: 2000,
    minKeywordLength: 1,
    maxKeywords: 5,
} as const;

/**
 * Association engine confidence threshold
 */
export const ASSOCIATION_CONFIDENCE = {
    linked: 0.85,
} as const;

/**
 * RRF (Reciprocal Rank Fusion) parameter
 */
export const RRF_K = 60;
