# PRD v0.8.0 - 概念提取优化与图谱集成

## 1. 版本概述

### 1.1 版本目标

v0.8.0 专注于优化概念提取系统，解决 Graph View 污染问题，建立清晰的三层信息架构，并提供用户友好的确认流程。

### 1.2 核心改进

1. **优化概念提取 Prompt** - 提取更高抽象层级的稳定概念
2. **概念字典系统** - 规范化概念名称，支持别名匹配
3. **用户确认流程** - 概念注入前的预览与编辑
4. **三级开关控制** - 精细化功能启用层级

---

## 2. 三层信息架构

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Memo Echo 信息架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: 核心概念 (Wikilinks)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • 高抽象层级概念 (学科/领域/方法论)                    │   │
│  │ • 精确匹配，出现在 Graph View                         │   │
│  │ • 数量少而精 (1-4个/笔记)                             │   │
│  │ • 用户可编辑概念字典                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Layer 2: 内容标签 (Tags)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • 中等抽象层级 (主题/类型/状态)                        │   │
│  │ • 用户自定义标签体系                                  │   │
│  │ • 支持层级结构 (#tech/frontend)                       │   │
│  │ • 不污染 Graph View                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  Layer 3: 片段索引 (Vector Search)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • 细粒度语义相似度                                    │   │
│  │ • Fragment-level 检索                                 │   │
│  │ • Sidebar 实时推荐                                    │   │
│  │ • 不修改原文件                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各层特点对比

| 特性     | 核心概念 (L1)      | 内容标签 (L2)  | 片段索引 (L3) |
| -------- | ------------------ | -------------- | ------------- |
| 抽象层级 | 高 (学科/领域)     | 中 (主题/类型) | 低 (语义片段) |
| 匹配方式 | 精确匹配           | 精确匹配       | 模糊相似度    |
| 可见性   | Graph View         | Tag Pane       | Sidebar       |
| 修改原文 | 是 (frontmatter)   | 是 (tags)      | 否            |
| 自动化   | AI 提取 + 用户确认 | 用户手动       | 全自动        |
| 数量级   | 少 (1-4/note)      | 中 (3-10/note) | 多 (所有片段) |

---

## 3. 概念提取设置

### 3.1 三级开关设计

```typescript
interface ConceptExtractionSettings {
    // Level 1: 是否启用概念提取
    enableConceptExtraction: boolean; // default: true

    // Level 2: 是否注入到 frontmatter
    injectToFrontmatter: boolean; // default: true

    // Level 3: 是否自动创建概念页面
    autoCreateConceptPage: boolean; // default: false (保守)

    // 概念页面前缀
    conceptPagePrefix: string; // default: "_me"

    // 概念数量规则
    conceptCountRules: ConceptCountRule[];

    // 跳过规则
    skipRules: SkipRules;

    // 概念字典路径
    conceptDictionaryPath: string; // default: "{prefix}/_concept-dictionary.json"
}

interface ConceptCountRule {
    minChars: number;
    maxChars: number;
    maxConcepts: number;
}

interface SkipRules {
    // 跳过的路径前缀
    skipPaths: string[]; // default: ["_me/", "templates/", "daily/"]

    // 跳过包含这些标签的笔记
    skipTags: string[]; // default: ["vocabulary", "daily", "template"]

    // 最小文本长度 (排除图片标记后)
    minTextLength: number; // default: 100

    // 图片占比阈值 (超过则跳过)
    maxImageRatio: number; // default: 0.7
}
```

### 3.2 默认概念数量规则

```typescript
const DEFAULT_CONCEPT_COUNT_RULES: ConceptCountRule[] = [
    { minChars: 0, maxChars: 199, maxConcepts: 1 },
    { minChars: 200, maxChars: 499, maxConcepts: 2 },
    { minChars: 500, maxChars: 999, maxConcepts: 3 },
    { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
];
```

### 3.3 设置界面

```
┌─────────────────────────────────────────────────────────────┐
│ Concept Extraction Settings                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ☑ Enable concept extraction                                 │
│   Extract high-level concepts from notes using AI           │
│                                                             │
│   ├─ ☑ Inject concepts to frontmatter                      │
│   │    Add extracted concepts as wikilinks in frontmatter   │
│   │                                                         │
│   │   └─ ☐ Auto-create concept pages                       │
│   │        Automatically create pages for new concepts      │
│   │        ⚠️ May create many files. Recommended: manual    │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Concept Page Prefix                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ _me                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Folder prefix for concept pages (e.g., "_me/认知科学")      │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Skip Rules                                                  │
│                                                             │
│ Skip paths (one per line):                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ _me/                                                    │ │
│ │ templates/                                              │ │
│ │ daily/                                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Skip tags (comma-separated):                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ vocabulary, daily, template, image-collection           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Minimum text length: [100] characters                       │
│ Skip if image ratio exceeds: [70] %                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 概念字典系统

### 4.1 字典结构

```json
// {conceptPagePrefix}/_concept-dictionary.json
{
    "version": "1.0",
    "lastUpdated": "2026-02-01T10:30:00Z",
    "concepts": {
        "认知科学": {
            "aliases": ["cognitive science", "认知学", "认知研究"],
            "category": "学科",
            "description": "研究心智与认知过程的跨学科领域",
            "createdAt": "2026-01-15T08:00:00Z",
            "noteCount": 12
        },
        "分布式系统": {
            "aliases": ["distributed systems", "分布式", "分布式架构"],
            "category": "技术领域",
            "description": "多计算机协同工作的系统架构",
            "createdAt": "2026-01-20T14:30:00Z",
            "noteCount": 8
        },
        "第一性原理": {
            "aliases": ["first principles", "第一原理", "基本原理思维"],
            "category": "方法论",
            "description": "从最基本的事实出发进行推理的思维方式",
            "createdAt": "2026-01-25T09:15:00Z",
            "noteCount": 5
        }
    }
}
```

### 4.2 TypeScript 接口

```typescript
interface ConceptDictionary {
    version: string;
    lastUpdated: string;
    concepts: Record<string, ConceptEntry>;
}

interface ConceptEntry {
    aliases: string[]; // 别名列表
    category?: string; // 概念分类
    description?: string; // 概念描述
    createdAt: string; // 创建时间
    noteCount: number; // 关联笔记数
}

interface ConceptMatch {
    originalTerm: string; // AI 提取的原始词
    matchedConcept: string; // 匹配到的标准概念名
    matchType: "exact" | "alias" | "new";
    confidence: number; // 匹配置信度 (0-1)
}
```

### 4.3 概念匹配算法

```typescript
class ConceptMatcher {
    constructor(private dictionary: ConceptDictionary) {}

    /**
     * 匹配 AI 提取的概念到字典
     * 优先级: 精确匹配 > 别名匹配 > 新概念
     */
    match(extractedTerm: string): ConceptMatch {
        const normalized = this.normalize(extractedTerm);

        // 1. 精确匹配概念名
        if (this.dictionary.concepts[normalized]) {
            return {
                originalTerm: extractedTerm,
                matchedConcept: normalized,
                matchType: "exact",
                confidence: 1.0,
            };
        }

        // 2. 别名匹配
        for (const [conceptName, entry] of Object.entries(
            this.dictionary.concepts,
        )) {
            const normalizedAliases = entry.aliases.map((a) =>
                this.normalize(a),
            );
            if (normalizedAliases.includes(normalized)) {
                return {
                    originalTerm: extractedTerm,
                    matchedConcept: conceptName,
                    matchType: "alias",
                    confidence: 0.95,
                };
            }
        }

        // 3. 模糊匹配 (可选，使用编辑距离)
        const fuzzyMatch = this.fuzzyMatch(normalized);
        if (fuzzyMatch && fuzzyMatch.similarity > 0.85) {
            return {
                originalTerm: extractedTerm,
                matchedConcept: fuzzyMatch.concept,
                matchType: "alias",
                confidence: fuzzyMatch.similarity,
            };
        }

        // 4. 新概念
        return {
            originalTerm: extractedTerm,
            matchedConcept: normalized,
            matchType: "new",
            confidence: 0.5,
        };
    }

    private normalize(term: string): string {
        return term.trim().toLowerCase();
    }

    private fuzzyMatch(
        term: string,
    ): { concept: string; similarity: number } | null {
        // 实现编辑距离或其他模糊匹配算法
        // ...
    }
}
```

---

## 5. 优化的概念提取 Prompt

### 5.1 系统提示词

```typescript
const CONCEPT_EXTRACTION_SYSTEM_PROMPT = `You are an expert knowledge analyst specializing in identifying high-level academic and professional concepts.

Your task is to extract STABLE, HIGH-ABSTRACTION concepts that connect notes in a knowledge graph.

## Extraction Principles

1. **High Abstraction Level**: Extract concepts at the level of:
   - Academic disciplines (认知科学, 分布式系统, 量子力学)
   - Methodologies (第一性原理, 敏捷开发, 设计思维)
   - Theoretical frameworks (复杂系统理论, 行为经济学)
   - Professional domains (用户体验设计, 数据工程)

2. **Stability Over Specificity**: Prefer stable, reusable concepts over note-specific terms
   - ✅ "机器学习" (can connect many notes)
   - ❌ "GPT-4的上下文窗口" (too specific)

3. **Connectivity Potential**: Choose concepts likely to appear in multiple notes
   - ✅ "信息架构" (architectural concept)
   - ❌ "我的项目计划" (single-note relevance)

4. **Language Consistency**: 
   - Use the same language as the note content
   - For mixed-language notes, prefer the dominant language
   - Maintain consistent terminology across extractions

## DO NOT Extract

- Proper nouns (人名, 公司名, 产品名) unless they represent concepts
- Temporal references (今天, 本周, Q1)
- Personal references (我的, 我们的)
- Generic terms (东西, 事情, 问题)
- Note-specific details that won't connect to other notes`;
```

### 5.2 用户提示词模板

```typescript
const CONCEPT_EXTRACTION_USER_PROMPT = `Extract {maxConcepts} high-level concepts from this note.

<note_title>
{title}
</note_title>

<note_content>
{content}
</note_content>

<existing_concepts>
{existingConcepts}
</existing_concepts>

## Instructions

1. Read the note carefully to understand its main themes
2. Identify {maxConcepts} concepts at the HIGHEST appropriate abstraction level
3. Check if any extracted concepts match or are aliases of existing concepts
4. Return concepts in the note's primary language

## Response Format

Return a JSON object:
{
  "concepts": [
    {
      "name": "概念名称",
      "confidence": 0.95,
      "reason": "为什么这个概念适合这篇笔记"
    }
  ],
  "noteType": "article|vocabulary|daily|image-collection|template|normal",
  "skipReason": null | "reason if note should be skipped"
}

## Important

- Maximum {maxConcepts} concepts
- Confidence should reflect how central the concept is to the note
- If the note is a vocabulary list, daily note, or image collection, set appropriate noteType and skipReason`;
```

### 5.3 提取示例

**输入笔记:**

```markdown
# 如何用 LangChain 构建 RAG 应用

今天学习了使用 LangChain 框架构建 RAG (Retrieval-Augmented Generation) 应用的方法。

主要步骤：

1. 文档加载和分块
2. 向量化存储
3. 检索增强生成

关键发现：chunk size 对检索质量影响很大，需要根据具体场景调优。
```

**提取结果:**

```json
{
    "concepts": [
        {
            "name": "检索增强生成",
            "confidence": 0.95,
            "reason": "RAG 是本文的核心主题，属于 AI 应用架构层面的概念"
        },
        {
            "name": "知识库系统",
            "confidence": 0.85,
            "reason": "RAG 本质上是构建知识库系统，属于信息架构领域"
        }
    ],
    "noteType": "normal",
    "skipReason": null
}
```

---

## 6. 用户确认流程

### 6.1 确认界面设计

```
┌─────────────────────────────────────────────────────────────┐
│ 📝 Confirm Extracted Concepts                               │
│                                                             │
│ Note: 如何用 LangChain 构建 RAG 应用                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Extracted Concepts:                                         │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ [[检索增强生成]]                         95% ✓ exists │ │
│ │   → RAG 是本文的核心主题                                 │ │
│ │                                                         │ │
│ │ ☑ [[知识库系统]]                           85% ⚡ new   │ │
│ │   → RAG 本质上是构建知识库系统                           │ │
│ │   💡 Similar: "知识管理系统" - Use instead?  [Yes] [No]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Add Custom Concept:                                         │
│ ┌───────────────────────────────────────┐ [+ Add]          │
│ │                                       │                   │
│ └───────────────────────────────────────┘                   │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Preview frontmatter changes:                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ---                                                     │ │
│ │ me_concepts:                                            │ │
│ │   - "[[_me/检索增强生成]]"                               │ │
│ │   - "[[_me/知识库系统]]"                                 │ │
│ │ me_indexed_at: 2026-02-01T10:30:00Z                     │ │
│ │ ---                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                              [Cancel]  [Skip Note]  [Apply] │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 React 组件接口

```typescript
interface ConceptConfirmationProps {
    note: {
        path: string;
        title: string;
        content: string;
    };
    extractedConcepts: ExtractedConcept[];
    existingConcepts: string[];
    onConfirm: (concepts: ConfirmedConcept[]) => void;
    onSkip: () => void;
    onCancel: () => void;
}

interface ExtractedConcept {
    name: string;
    confidence: number;
    reason: string;
    matchInfo: ConceptMatch;
}

interface ConfirmedConcept {
    name: string;
    isNew: boolean;
    createPage: boolean;
    aliases?: string[];
}
```

### 6.3 批量处理模式

对于大量笔记的初次索引，提供批量确认模式：

```
┌─────────────────────────────────────────────────────────────┐
│ 📚 Batch Concept Review                                     │
│                                                             │
│ Processing: 45 notes | New concepts: 23 | Skipped: 12       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ New Concepts to Create:                                     │
│                                                             │
│ ☑ 检索增强生成        (5 notes)                             │
│ ☑ 知识库系统          (3 notes)                             │
│ ☑ 向量数据库          (4 notes)                             │
│ ☐ LangChain          (2 notes) - Merge with "AI框架"?       │
│ ☑ 分布式系统          (8 notes)                             │
│                                                             │
│ [Select All] [Deselect All]                                 │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Options:                                                    │
│ ☐ Create concept pages for selected                         │
│ ☑ Add to concept dictionary                                 │
│                                                             │
│                                    [Cancel]  [Apply to All] │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 笔记类型检测

### 7.1 检测逻辑

````typescript
interface NoteTypeDetection {
    type: "normal" | "vocabulary" | "daily" | "image-collection" | "template";
    confidence: number;
    shouldSkip: boolean;
    reason?: string;
}

class NoteTypeDetector {
    detect(note: {
        path: string;
        content: string;
        tags?: string[];
    }): NoteTypeDetection {
        // 1. 路径检测
        if (this.matchesSkipPath(note.path)) {
            return {
                type: "template",
                confidence: 1.0,
                shouldSkip: true,
                reason: "Matches skip path",
            };
        }

        // 2. 标签检测
        if (note.tags?.some((t) => this.settings.skipTags.includes(t))) {
            return {
                type: "vocabulary",
                confidence: 0.95,
                shouldSkip: true,
                reason: "Has skip tag",
            };
        }

        // 3. 内容分析
        const textContent = this.extractTextContent(note.content);
        const imageCount = (note.content.match(/!\[\[.*?\]\]/g) || []).length;
        const totalLength = note.content.length;

        // 图片集检测
        if (
            imageCount > 5 &&
            (imageCount * 50) / totalLength > this.settings.maxImageRatio
        ) {
            return {
                type: "image-collection",
                confidence: 0.9,
                shouldSkip: true,
                reason: "Image-heavy note",
            };
        }

        // 词汇表检测 (大量短行，可能是列表)
        const lines = textContent.split("\n").filter((l) => l.trim());
        const avgLineLength = textContent.length / lines.length;
        if (lines.length > 20 && avgLineLength < 30) {
            return {
                type: "vocabulary",
                confidence: 0.8,
                shouldSkip: true,
                reason: "Appears to be a list",
            };
        }

        // 文本长度检测
        if (textContent.length < this.settings.minTextLength) {
            return {
                type: "normal",
                confidence: 1.0,
                shouldSkip: true,
                reason: "Too short",
            };
        }

        return { type: "normal", confidence: 1.0, shouldSkip: false };
    }

    private extractTextContent(content: string): string {
        // 移除图片标记、代码块等
        return content
            .replace(/!\[\[.*?\]\]/g, "") // 图片
            .replace(/```[\s\S]*?```/g, "") // 代码块
            .replace(/`[^`]+`/g, "") // 行内代码
            .replace(/^---[\s\S]*?---/m, "") // frontmatter
            .trim();
    }
}
````

---

## 8. 完整处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Concept Extraction Flow                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Note Modified  │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Check Settings  │
                    │ enableConcept-  │
                    │ Extraction?     │
                    └────────┬────────┘
                              │
                    ┌────────┴────────┐
                    │                 │
                   Yes               No ──────────► Done
                    │
                    ▼
           ┌─────────────────┐
           │ Detect Note     │
           │ Type            │
           └────────┬────────┘
                    │
           ┌────────┴────────┐
           │                 │
        shouldSkip=true   shouldSkip=false
           │                 │
           ▼                 ▼
         Done       ┌─────────────────┐
                    │ Load Concept    │
                    │ Dictionary      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Calculate       │
                    │ maxConcepts     │
                    │ from text length│
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Call AI Extract │
                    │ with optimized  │
                    │ prompt          │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Match concepts  │
                    │ to dictionary   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Show Confirm    │
                    │ Dialog          │
                    └────────┬────────┘
                              │
                    ┌────────┴────────┐
                    │                 │
                 Confirm           Cancel/Skip
                    │                 │
                    ▼                 ▼
           ┌─────────────────┐      Done
           │ Check inject-   │
           │ ToFrontmatter?  │
           └────────┬────────┘
                    │
           ┌────────┴────────┐
           │                 │
          Yes               No ──────────► Update Dictionary Only
           │
           ▼
  ┌─────────────────┐
  │ Inject concepts │
  │ to frontmatter  │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Check auto-     │
  │ CreatePage?     │
  └────────┬────────┘
           │
  ┌────────┴────────┐
  │                 │
 Yes               No
  │                 │
  ▼                 ▼
┌─────────────────┐ │
│ Create concept  │ │
│ pages for new   │ │
│ concepts        │ │
└────────┬────────┘ │
         │          │
         └────┬─────┘
              │
              ▼
    ┌─────────────────┐
    │ Update concept  │
    │ dictionary      │
    └────────┬────────┘
              │
              ▼
            Done
```

---

## 9. API 设计

### 9.1 ConceptExtractor 服务

```typescript
class ConceptExtractor {
    constructor(
        private settings: ConceptExtractionSettings,
        private aiProvider: AIProvider,
        private dictionary: ConceptDictionary,
    ) {}

    /**
     * 提取笔记概念
     */
    async extract(note: Note): Promise<ExtractionResult> {
        // 1. 检测笔记类型
        const detection = this.noteTypeDetector.detect(note);
        if (detection.shouldSkip) {
            return { skipped: true, reason: detection.reason };
        }

        // 2. 计算最大概念数
        const textLength = this.getTextLength(note.content);
        const maxConcepts = this.getMaxConcepts(textLength);

        // 3. 调用 AI 提取
        const prompt = this.buildPrompt(note, maxConcepts);
        const response = await this.aiProvider.complete(prompt);

        // 4. 匹配字典
        const concepts = this.parseResponse(response);
        const matchedConcepts = concepts.map((c) => ({
            ...c,
            matchInfo: this.matcher.match(c.name),
        }));

        return {
            skipped: false,
            concepts: matchedConcepts,
            noteType: detection.type,
        };
    }

    /**
     * 确认并应用概念
     */
    async apply(
        note: Note,
        confirmedConcepts: ConfirmedConcept[],
    ): Promise<void> {
        // 1. 更新 frontmatter
        if (this.settings.injectToFrontmatter) {
            await this.frontmatterService.injectConcepts(
                note,
                confirmedConcepts,
            );
        }

        // 2. 创建概念页面
        if (this.settings.autoCreateConceptPage) {
            for (const concept of confirmedConcepts.filter(
                (c) => c.isNew && c.createPage,
            )) {
                await this.createConceptPage(concept);
            }
        }

        // 3. 更新字典
        await this.updateDictionary(confirmedConcepts);
    }

    private getMaxConcepts(textLength: number): number {
        for (const rule of this.settings.conceptCountRules) {
            if (textLength >= rule.minChars && textLength < rule.maxChars) {
                return rule.maxConcepts;
            }
        }
        return 4; // default max
    }
}
```

### 9.2 事件集成

```typescript
// main.ts 集成
class MemoEchoPlugin extends Plugin {
    private conceptExtractor: ConceptExtractor;

    async onload() {
        // ... 其他初始化 ...

        // 监听文件修改
        this.registerEvent(
            this.app.vault.on("modify", async (file) => {
                if (file instanceof TFile && file.extension === "md") {
                    await this.onNoteModified(file);
                }
            }),
        );
    }

    private async onNoteModified(file: TFile) {
        if (!this.settings.enableConceptExtraction) return;

        // 防抖处理
        this.debounceConceptExtraction(file, async () => {
            const note = await this.loadNote(file);
            const result = await this.conceptExtractor.extract(note);

            if (!result.skipped && result.concepts.length > 0) {
                // 显示确认对话框
                this.showConceptConfirmation(note, result.concepts);
            }
        });
    }
}
```

---

## 10. 迁移与兼容性

### 10.1 从 v0.7.0 迁移

```typescript
interface MigrationPlan {
    // v0.7.0 的 me_concepts 格式保持兼容
    // 新增字典文件，不影响现有数据
    steps: [
        "创建概念字典文件",
        "扫描现有 me_concepts 生成初始字典",
        "保留现有 frontmatter 格式",
    ];
}

async function migrateFromV070(vault: Vault): Promise<void> {
    const dictionary: ConceptDictionary = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        concepts: {},
    };

    // 扫描所有笔记的 me_concepts
    const files = vault.getMarkdownFiles();
    for (const file of files) {
        const cache = this.app.metadataCache.getFileCache(file);
        const concepts = cache?.frontmatter?.me_concepts || [];

        for (const concept of concepts) {
            const name = this.extractConceptName(concept);
            if (!dictionary.concepts[name]) {
                dictionary.concepts[name] = {
                    aliases: [],
                    createdAt: new Date().toISOString(),
                    noteCount: 1,
                };
            } else {
                dictionary.concepts[name].noteCount++;
            }
        }
    }

    // 保存字典
    await this.saveDictionary(dictionary);
}
```

---

## 11. 测试策略

### 11.1 单元测试

```typescript
describe("ConceptExtractor", () => {
    describe("extract", () => {
        it("should skip notes matching skip paths", async () => {
            const note = { path: "_me/test.md", content: "test content" };
            const result = await extractor.extract(note);
            expect(result.skipped).toBe(true);
            expect(result.reason).toContain("skip path");
        });

        it("should respect maxConcepts based on text length", async () => {
            const shortNote = { path: "test.md", content: "x".repeat(150) };
            const result = await extractor.extract(shortNote);
            expect(result.concepts.length).toBeLessThanOrEqual(1);
        });

        it("should match concepts to dictionary aliases", async () => {
            dictionary.concepts["认知科学"] = {
                aliases: ["cognitive science"],
            };
            const result = await extractor.extract(noteWithCognitiveScience);
            expect(result.concepts[0].matchInfo.matchedConcept).toBe(
                "认知科学",
            );
        });
    });
});

describe("NoteTypeDetector", () => {
    it("should detect image-heavy notes", () => {
        const content =
            "![[img1.png]]\n![[img2.png]]\n![[img3.png]]\nshort text";
        const result = detector.detect({ path: "test.md", content });
        expect(result.type).toBe("image-collection");
        expect(result.shouldSkip).toBe(true);
    });

    it("should detect vocabulary lists", () => {
        const content = "word1\nword2\nword3\n" + "word".repeat(50);
        const result = detector.detect({ path: "vocab.md", content });
        expect(result.type).toBe("vocabulary");
    });
});
```

### 11.2 集成测试

```typescript
describe("Concept Extraction Integration", () => {
    it("should complete full extraction flow", async () => {
        // 1. 创建测试笔记
        const note = await createTestNote("Test note about machine learning");

        // 2. 触发提取
        const result = await extractor.extract(note);

        // 3. 确认概念
        await extractor.apply(
            note,
            result.concepts.map((c) => ({
                name: c.name,
                isNew: c.matchInfo.matchType === "new",
                createPage: false,
            })),
        );

        // 4. 验证 frontmatter
        const updated = await vault.read(note.path);
        expect(updated).toContain("me_concepts:");

        // 5. 验证字典更新
        const dict = await loadDictionary();
        expect(dict.concepts).toHaveProperty(result.concepts[0].name);
    });
});
```

---

## 12. 未来扩展

### 12.1 v0.9.0 潜在功能

- **概念关系图**: 可视化概念之间的关系
- **概念合并工具**: 批量合并相似概念
- **智能别名建议**: AI 自动建议概念别名
- **概念热度分析**: 追踪概念使用趋势

### 12.2 API 预留

```typescript
interface ConceptRelation {
    source: string;
    target: string;
    type: "parent" | "child" | "related" | "synonym";
    strength: number;
}

interface ConceptAnalytics {
    concept: string;
    noteCount: number;
    trend: "rising" | "stable" | "declining";
    lastUsed: string;
    relatedConcepts: string[];
}
```

---

## 13. 总结

v0.8.0 通过以下改进优化概念提取系统：

1. **三层信息架构** - 清晰区分概念、标签、向量三种连接方式
2. **优化提取 Prompt** - 专注高抽象层级、稳定、可复用的概念
3. **概念字典系统** - 规范化名称，支持别名，用户可编辑
4. **智能跳过规则** - 自动识别不适合提取的笔记类型
5. **用户确认流程** - 透明的预览与编辑机制
6. **三级开关控制** - 精细化功能启用，保守默认值

这些改进将显著减少 Graph View 污染，提高概念连接的质量和一致性。
