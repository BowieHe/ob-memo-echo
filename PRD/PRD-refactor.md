# PRD-refactor: Memo Echo 完整技术规范

> **版本**: v0.6.0  
> **最后更新**: 2025-01-24  
> **状态**: 基于重构后代码的完整文档

本文档是 Memo Echo Obsidian 插件的技术规范，基于重构后的实际代码结构编写。后续所有更新和文档都将基于此文档进行补充。

---

## 1. 项目概述

### 1.1 产品定位

Memo Echo 是一个 AI 驱动的 Obsidian 知识助手插件，提供：

- **语义搜索**: 基于向量的智能搜索，超越关键词匹配
- **实时推荐**: 根据当前编辑内容自动推荐相关笔记
- **概念抽取**: AI 提取笔记中的抽象概念
- **关联发现**: 基于共享概念发现笔记间的隐藏关联

### 1.2 核心特性

| 特性                    | 描述                                   | 版本   |
| ----------------------- | -------------------------------------- | ------ |
| Named Vectors           | 三向量融合搜索 (content/summary/title) | v0.4.0 |
| RRF Fusion              | Reciprocal Rank Fusion 搜索排序        | v0.4.0 |
| Concept Extraction      | AI 抽象概念提取                        | v0.5.0 |
| Frontmatter Injection   | 自动注入 me_concepts/me_indexed_at     | v0.5.0 |
| Association Discovery   | 基于共享概念的关联发现                 | v0.6.0 |
| Association Preferences | 关联管理 (接受/忽略/删除概念)          | v0.6.0 |

### 1.3 隐私设计

- **完全本地**: 默认配置使用 Ollama 本地运行
- **可选云端**: 支持 OpenAI API (用户自行配置)
- **无数据上传**: 所有数据存储在本地 Qdrant 实例

---

## 2. 架构设计

### 2.1 目录结构

```
src/
├── core/                          # 核心定义层
│   ├── constants.ts               # 常量配置
│   └── types/                     # TypeScript 类型定义
│       ├── association.ts         # 关联类型
│       ├── embedding.ts           # 嵌入类型
│       ├── extraction.ts          # 提取类型
│       ├── frontmatter.ts         # Frontmatter 类型
│       ├── indexing.ts            # 索引类型
│       └── vector.ts              # 向量存储类型
│
├── backends/                      # 后端抽象层
│   ├── vector-backend.ts          # 向量存储接口定义
│   └── qdrant-backend.ts          # Qdrant 实现
│
├── services/                      # 业务逻辑层
│   ├── embedding-service.ts       # 嵌入生成
│   ├── chunker.ts                 # Markdown 分块
│   ├── metadata-extractor.ts      # 元数据提取
│   ├── concept-extractor.ts       # 概念提取
│   ├── vector-index-manager.ts    # 索引编排
│   ├── memory-cache.ts            # 内存缓存
│   ├── persist-queue.ts           # 持久化队列
│   ├── frontmatter-service.ts     # Frontmatter 读写
│   ├── paragraph-detector.ts      # 段落检测
│   ├── association-engine.ts      # 关联发现引擎
│   ├── association-preferences.ts # 关联偏好管理
│   └── association-exporter.ts    # 关联导出
│
├── components/                    # React UI 组件
│   ├── Sidebar.tsx                # 搜索侧边栏
│   └── AssociationPanel.tsx       # 关联面板
│
├── utils/                         # 工具函数
│   └── wikilink-utils.ts          # Wikilink 处理
│
├── main.ts                        # 插件入口
├── settings.ts                    # 设置界面
├── unified-search-view.ts         # 搜索视图
├── association-view.ts            # 关联视图
└── indexing-view.ts               # 索引视图 (备用)
```

### 2.2 模块导入路径别名

配置于 `tsconfig.json` 和 `vitest.config.ts`:

```typescript
{
    "@core/*":       "./src/core/*",
    "@services/*":   "./src/services/*",
    "@backends/*":   "./src/backends/*",
    "@components/*": "./src/components/*",
    "@utils/*":      "./src/utils/*"
}
```

### 2.3 数据流架构

```
┌─────────────────┐
│   用户编辑笔记   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ ParagraphDetector│────▶│   UnifiedSearch │ (实时推荐)
└─────────────────┘     │      View       │
                        └─────────────────┘
         │
         ▼
┌─────────────────┐
│  VectorIndex    │ ◀── 触发索引
│    Manager      │
└────────┬────────┘
         │
    ┌────┴────┬─────────────────┐
    ▼         ▼                 ▼
┌───────┐ ┌─────────────┐ ┌─────────────────┐
│Chunker│ │Metadata     │ │Concept          │
│       │ │Extractor    │ │Extractor        │
└───┬───┘ └──────┬──────┘ └────────┬────────┘
    │            │                  │
    └────────────┴──────────────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │   EmbeddingService     │
    │ (Local/Ollama/OpenAI)  │
    └───────────┬────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
┌───────────┐         ┌──────────────┐
│Memory     │         │PersistQueue  │
│Cache      │         │(批量写入)     │
└───────────┘         └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │ QdrantBackend│
                      │ (Named Vecs) │
                      └──────────────┘
```

---

## 3. 核心类型定义

### 3.1 向量相关 (`@core/types/vector.ts`)

```typescript
// 多向量存储项
interface MultiVectorItem {
    id: string;
    vectors: Record<VECTOR_NAMES, number[]>; // content_vec, summary_vec, title_vec
    metadata: Record<string, any>;
}

// 搜索结果
interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}

// 搜索选项
interface SearchOptions {
    limit?: number;
    weights?: { content?: number; summary?: number; title?: number };
    filter?: { tags?: string[] };
}

// 向量后端接口
interface VectorBackend {
    initialize(): Promise<void>;
    upsertMultiVector(item: MultiVectorItem): Promise<void>;
    searchWithFusion(
        queryVector: number[],
        options?: SearchOptions,
    ): Promise<SearchResult[]>;
    delete(id: string): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;
    count(): Promise<number>;
    clear(): Promise<void>;
}
```

### 3.2 嵌入相关 (`@core/types/embedding.ts`)

```typescript
type EmbeddingProvider = "local" | "ollama" | "openai";

interface EmbeddingConfig {
    provider: EmbeddingProvider;
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
}

interface BatchEmbeddingResult {
    successful: number[][];
    failed: Array<{ index: number; error: Error }>;
}
```

### 3.3 索引相关 (`@core/types/indexing.ts`)

```typescript
// Markdown 分块结果
interface ChunkResult {
    content: string;
    headers: Array<{ level: number; text: string }>;
    index: number;
    startPos: number;
    endPos: number;
    start_line: number; // 1-indexed
    end_line: number; // 1-indexed
    header_path: string; // "# H1 > ## H2"
}

// 多向量队列项
interface MultiVectorQueuedChunk {
    id: string;
    vectors: {
        content_vec: number[];
        summary_vec: number[];
        title_vec: number[];
    };
    metadata: Record<string, any>;
}

// 缓存块
interface CachedChunk {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
    timestamp: number;
}
```

### 3.4 提取相关 (`@core/types/extraction.ts`)

```typescript
// 元数据提取结果
interface ExtractedMetadata {
    summary: string;
    tags: string[];
    category: string;
    concepts: string[]; // 抽象概念
    thinking_point: string; // 思考点/洞见
}

// 概念提取结果
interface ExtractedConcepts {
    concepts: string[];
    confidence: number; // 0-1
    conceptConfidences?: number[]; // 每个概念的置信度
}

// 概念提取配置
interface ConceptExtractionConfig {
    provider: "ollama" | "openai" | "rules";
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    maxConcepts?: number;
    focusOnAbstractConcepts?: boolean; // v0.6.0
    minConfidence?: number; // v0.6.0
    excludeGenericConcepts?: string[]; // v0.6.0
}
```

### 3.5 关联相关 (`@core/types/association.ts`)

```typescript
// 笔记关联
interface NoteAssociation {
    sourceNoteId: string;
    targetNoteId: string;
    sourceNoteTitle?: string;
    targetNoteTitle?: string;
    sharedConcepts: string[];
    confidence: number; // 0-1
    vectorSimilarity?: number;
    discoveredAt: Date;
}

// 关联配置
interface AssociationConfig {
    minSharedConcepts: number;
    minConfidence: number;
    maxAssociations: number;
    excludeSelfAssociations: boolean;
}

// 概念索引条目
interface ConceptIndexEntry {
    concept: string;
    noteIds: string[];
    avgConfidence: number;
    lastUpdated: Date;
}

// 关联偏好状态
interface AssociationPreferenceState {
    ignoredAssociations: Set<string>;
    deletedConcepts: Map<string, Set<string>>;
}
```

### 3.6 Frontmatter 相关 (`@core/types/frontmatter.ts`)

```typescript
// Memo Echo 注入的 frontmatter 字段
interface MemoEchoFrontmatter {
    me_concepts?: string[]; // [[_me/概念名]]
    me_indexed_at?: string; // ISO 时间戳
}

// 段落完成事件
interface ParagraphCompletionEvent {
    paragraph: string;
    position: number;
    timestamp: number;
}
```

---

## 4. 核心常量 (`@core/constants.ts`)

```typescript
// ===== 向量配置 =====
enum VECTOR_NAMES {
    CONTENT = 'content_vec',
    SUMMARY = 'summary_vec',
    TITLE = 'title_vec'
}

const VECTOR_CONFIGS = [
    { name: VECTOR_NAMES.CONTENT, weight: 0.4 },
    { name: VECTOR_NAMES.SUMMARY, weight: 0.4 },
    { name: VECTOR_NAMES.TITLE,   weight: 0.2 },
];

const DEFAULT_WEIGHTS = { content: 0.4, summary: 0.4, title: 0.2 };
const SEARCH_DEFAULTS = { limit: 10, weights: DEFAULT_WEIGHTS };

// ===== 视图类型 =====
const VIEW_TYPE_ASSOCIATION = 'memo-echo-association-view';
const VIEW_TYPE_UNIFIED_SEARCH = 'memo-echo-unified-search';

// ===== 分类关键词 =====
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '技术笔记': ['代码', 'API', '函数', '配置', '部署', ...],
    '日记':     ['今天', '昨天', '日常', '日记', '心情', ...],
    '读书笔记': ['摘录', '书评', '作者', '读后感', ...],
    '想法':     ['想法', '思考', '灵感', '创意', ...],
};

const VALID_CATEGORIES = Object.keys(CATEGORY_KEYWORDS);
const DEFAULT_CATEGORY = '技术笔记';

// ===== 元数据约束 =====
const METADATA_CONSTRAINTS = {
    maxSummaryLength: 2000,
    maxKeywords: 5,
};

// ===== 关联置信度 =====
const ASSOCIATION_CONFIDENCE = { linked: 0.85 };

// ===== RRF 参数 =====
const RRF_K = 60;
```

---

## 5. 服务层详解

### 5.1 EmbeddingService

**职责**: 多提供商嵌入向量生成

**支持提供商**:

- `local`: Transformers.js (Xenova/bge-m3)
- `ollama`: 本地 Ollama 服务 (默认: qwen3-embedding:4b)
- `openai`: OpenAI API (text-embedding-3-small)

**关键方法**:

```typescript
class EmbeddingService {
    async embed(text: string): Promise<number[]>;
    async embedBatch(
        texts: string[],
        options?: { continueOnError?: boolean },
    ): Promise<number[][] | BatchEmbeddingResult>;
    updateConfig(config: Partial<EmbeddingConfig>): void;
}
```

### 5.2 Chunker

**职责**: Markdown 内容分块，保留标题层级

**配置**:

- `minChunkSize`: 100 字符
- `maxChunkSize`: 800 字符
- `overlapSize`: 50 字符

**特性**:

- 按标题分割
- 保留标题路径 (header_path)
- 计算行号 (start_line, end_line)
- 超长内容递归分割

### 5.3 MetadataExtractor

**职责**: AI/规则混合元数据提取

**提取内容**:

- `summary`: 文档摘要
- `tags`: 关键词标签
- `category`: 文档分类
- `concepts`: 抽象概念
- `thinking_point`: 思考洞见

**提供商**:

- `ollama`: 本地 LLM (默认: qwen2.5:7b)
- `openai`: OpenAI API
- 降级: 规则提取 (从标题、粗体、标签中提取)

### 5.4 ConceptExtractor

**职责**: 抽取笔记中的抽象概念

**v0.6.0 增强**:

- `focusOnAbstractConcepts`: 优先抽象概念
- `minConfidence`: 最小置信度阈值
- `excludeGenericConcepts`: 排除通用概念列表

**提供商**:

- `ollama`: AI 提取
- `openai`: AI 提取
- `rules`: 基于标题/粗体/wikilink/标签的规则提取

### 5.5 VectorIndexManager

**职责**: 索引编排中心

**功能**:

- 协调 Chunker、MetadataExtractor、EmbeddingService
- 管理 MemoryCache 和 PersistQueue
- 支持 Named Vectors (content/summary/title)
- 集成 AssociationEngine (v0.6.0)

**关键方法**:

```typescript
class VectorIndexManager {
    async indexFile(filePath: string, content: string): Promise<void>;
    async search(
        query: string,
        options?: { limit?: number; tags?: string[] },
    ): Promise<SearchResult[]>;
    async updateFile(filePath: string, content: string): Promise<void>;
    removeFile(filePath: string): void;
    async flush(): Promise<void>;
}
```

### 5.6 MemoryCache

**职责**: 内存中的向量缓存

**特性**:

- 固定内存限制 (默认 50MB)
- LRU 驱逐策略
- 支持按 filePath 批量删除

### 5.7 PersistQueue

**职责**: 批量持久化到向量存储

**配置**:

- `batchSize`: 50
- `flushInterval`: 30000ms
- `useMultiVector`: true

**多向量支持**:

```typescript
enqueueMultiVector(chunk: MultiVectorQueuedChunk): void;
flushMultiVector(): Promise<void>;
```

### 5.8 SimpleAssociationEngine

**职责**: 基于共享概念发现笔记关联

**核心数据结构**:

- `conceptIndex`: Map<concept, ConceptIndexEntry>
- `noteConcepts`: Map<noteId, concepts[]>
- `noteConfidences`: Map<noteId, confidences[]>

**关键方法**:

```typescript
class SimpleAssociationEngine {
    async indexNote(noteId: string, content: string, title?: string): Promise<{ indexed: boolean; concepts: string[] }>;
    indexNoteConcepts(noteId: string, concepts: string[], confidences?: number[]): { indexed: boolean; concepts: string[] };
    removeNote(noteId: string): void;
    async discoverAssociations(): Promise<NoteAssociation[]>;
    async discoverAssociationsForNote(noteId: string): Promise<NoteAssociation[]>;
    getStats(): { totalNotes, totalConcepts, avgConceptsPerNote, ... };
    clearIndex(): void;
}
```

**置信度计算**:

- 基于共享概念的平均置信度
- 共享概念数量奖励 (最多 +20%)
- Wikilink 中的概念获得更高置信度 (0.85)

### 5.9 AssociationPreferences

**职责**: 管理用户的关联偏好

**功能**:

- 忽略关联 (ignoreAssociation)
- 删除概念 (deleteConcept)
- 过滤关联 (filterAssociations)
- 持久化到 settings

### 5.10 FrontmatterService

**职责**: 安全读写 Obsidian 笔记的 frontmatter

**注入字段**:

- `me_concepts`: `[[_me/概念名]]` 格式的 wikilink 数组
- `me_indexed_at`: ISO 时间戳

**关键方法**:

```typescript
class FrontmatterService {
    async readMemoEchoFields(file: TFile): Promise<MemoEchoFrontmatter>;
    async needsReindex(file: TFile): Promise<boolean>;
    async setConcepts(file: TFile, concepts: string[]): Promise<void>;
    async updateAfterIndexing(file: TFile, concepts: string[]): Promise<void>;
    async clearMemoEchoFields(file: TFile): Promise<void>;
}
```

### 5.11 ParagraphDetector

**职责**: 检测用户编辑中的段落完成

**配置**:

- `debounceMs`: 1000ms
- `minParagraphLength`: 100 字符

**用途**: 触发实时推荐更新

---

## 6. 后端抽象层

### 6.1 VectorBackend 接口

定义于 `@backends/vector-backend.ts`:

```typescript
interface VectorBackend {
    initialize(): Promise<void>;
    upsertMultiVector(item: MultiVectorItem): Promise<void>;
    searchWithFusion(
        queryVector: number[],
        options?: SearchOptions,
    ): Promise<SearchResult[]>;
    delete(id: string): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;
    count(): Promise<number>;
    clear(): Promise<void>;
}
```

### 6.2 QdrantBackend 实现

**特性**:

- 自动检测向量维度
- Named Vectors: content_vec, summary_vec, title_vec
- 原生 RRF Fusion (Qdrant Query API)
- 支持标签过滤

**Qdrant 集合配置**:

```typescript
{
    vectors: {
        content_vec: { size: dimension, distance: 'Cosine' },
        summary_vec: { size: dimension, distance: 'Cosine' },
        title_vec:   { size: dimension, distance: 'Cosine' },
    }
}
```

**RRF 搜索实现**:

```typescript
await client.query(collectionName, {
    prefetch: [
        { query: queryVector, using: "content_vec", limit: prefetchLimit },
        { query: queryVector, using: "summary_vec", limit: prefetchLimit },
        { query: queryVector, using: "title_vec", limit: prefetchLimit },
    ],
    query: { fusion: "rrf" },
    limit,
    with_payload: true,
});
```

---

## 7. 视图层

### 7.1 UnifiedSearchView

**文件**: `unified-search-view.ts`

**功能**:

- 搜索模式: 显示语义搜索结果
- Ambient 模式: 显示实时推荐 (空搜索框时)

**React 集成**: 挂载 `Sidebar` 组件

**事件**:

- `memo-echo:open-file`: 打开搜索结果文件
- `memo-echo:ambient-update`: 更新实时推荐
- `memo-echo:index-current-file`: 索引当前文件

### 7.2 AssociationView

**文件**: `association-view.ts`

**功能**:

- 显示发现的关联
- 接受关联 (创建 wikilink)
- 忽略关联
- 删除概念
- 手动刷新扫描

**React 集成**: 挂载 `AssociationPanel` 组件

### 7.3 React 组件

#### Sidebar.tsx

- 搜索输入框
- 模式切换 (ambient/search)
- 结果列表 (SmartCard)
- 索引当前文件按钮

#### AssociationPanel.tsx

- 关联卡片列表
- 接受/忽略/删除概念按钮
- 批量操作
- 刷新按钮

---

## 8. 插件设置

### 8.1 设置结构 (`MemoEchoSettings`)

```typescript
interface MemoEchoSettings {
    // Embedding 设置
    embeddingProvider: "local" | "ollama" | "openai";
    ollamaUrl: string; // 默认: http://localhost:11434
    ollamaModel: string; // 默认: qwen3-embedding:4b
    openaiApiKey: string;
    openaiModel: string; // 默认: text-embedding-3-small

    // AI 生成设置 (元数据提取)
    enableAiMetadata: boolean; // 默认: true
    aiGenProvider: "ollama" | "openai";
    aiGenUrl: string;
    aiGenModel: string; // 默认: qwen2.5:7b
    aiGenApiKey: string;

    // Qdrant 设置
    qdrantUrl: string; // 默认: http://localhost:6333
    qdrantCollection: string; // 默认: obsidian_notes

    // v0.5.0: Frontmatter & 概念设置
    injectConcepts: boolean; // 默认: true
    conceptExtractionProvider: "ollama" | "openai" | "rules";
    conceptPageFolder: string; // 默认: _me

    // v0.6.0: 抽象概念提取设置
    focusOnAbstractConcepts: boolean; // 默认: true
    minConceptConfidence: number; // 默认: 0.7
    excludeGenericConcepts: string; // 逗号分隔

    // v0.6.0: 关联管理设置
    associationMinConfidence: number; // 默认: 0.5
    associationAutoAccept: boolean; // 默认: false
    associationAutoAcceptConfidence: number; // 默认: 0.9
    associationAutoScanBatchSize: number; // 默认: 50
    associationIgnoredAssociations: string[];
    associationDeletedConcepts: Record<string, string[]>;
}
```

### 8.2 设置界面分区

1. **概览**: 数据库统计、关联统计
2. **环境配置**: 连接状态、Qdrant、Embedding
3. **AI 总结与标签**: 提供商选择、模型选择
4. **概念设置**: 注入开关、抽象概念配置
5. **索引管理**: 索引当前文件、同步所有文档
6. **数据库操作**: 清除、导出

---

## 9. 构建与测试

### 9.1 构建配置

**esbuild.config.mjs**:

- 入口: `src/main.ts`
- 输出: `main.js`
- External: `obsidian`, `electron`, `@codemirror/*`
- 支持 JSX (React)

**TypeScript 配置**:

- `target`: ES6
- `module`: ESNext
- `moduleResolution`: bundler
- `strict`: true
- Path aliases: @core, @services, @backends, @components, @utils

### 9.2 测试框架

**Vitest** (从 Jest 迁移):

```typescript
// vitest.config.ts
export default defineConfig({
    test: {
        globals: true,
        environment: "jsdom",
        include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    },
    resolve: {
        alias: {
            "@core": "./src/core",
            "@services": "./src/services",
            "@backends": "./src/backends",
            "@components": "./src/components",
            "@utils": "./src/utils",
            obsidian: "./src/__mocks__/obsidian.ts",
            "@qdrant/js-client-rest":
                "./src/__mocks__/@qdrant/js-client-rest.ts",
            "@xenova/transformers": "./src/__mocks__/transformers.ts",
        },
    },
});
```

### 9.3 NPM 脚本

```json
{
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
}
```

### 9.4 Mock 文件

- `src/__mocks__/obsidian.ts`: Obsidian API mock
- `src/__mocks__/transformers.ts`: @xenova/transformers mock
- `src/__mocks__/@qdrant/js-client-rest.ts`: Qdrant client mock

---

## 10. 依赖

### 10.1 运行时依赖

| 包                       | 版本    | 用途          |
| ------------------------ | ------- | ------------- |
| `@qdrant/js-client-rest` | ^1.16.2 | Qdrant 客户端 |
| `@xenova/transformers`   | ^2.17.2 | 本地嵌入      |
| `react`                  | ^18.2.0 | UI 框架       |
| `react-dom`              | ^18.2.0 | React DOM     |
| `uuid`                   | ^13.0.0 | UUID 生成     |

### 10.2 开发依赖

| 包           | 版本    | 用途              |
| ------------ | ------- | ----------------- |
| `typescript` | ^5.9.3  | 类型检查          |
| `vitest`     | ^1.0.4  | 测试框架          |
| `jsdom`      | ^23.0.1 | DOM 模拟          |
| `esbuild`    | ^0.19.8 | 构建工具          |
| `obsidian`   | latest  | Obsidian API 类型 |

---

## 11. 外部服务要求

### 11.1 Qdrant 向量数据库

**部署**:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

**默认配置**:

- URL: `http://localhost:6333`
- Collection: `obsidian_notes`

### 11.2 Ollama 本地 AI

**部署**:

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型
ollama pull qwen3-embedding:4b  # Embedding
ollama pull qwen2.5:7b          # 生成/提取
```

**默认配置**:

- URL: `http://localhost:11434`
- Embedding Model: `qwen3-embedding:4b`
- Generation Model: `qwen2.5:7b`

---

## 12. 版本历史

| 版本   | 主要特性                     |
| ------ | ---------------------------- |
| v0.2.0 | 基础向量搜索、Qdrant 集成    |
| v0.3.0 | 元数据提取、分类系统         |
| v0.4.0 | Named Vectors、RRF Fusion    |
| v0.5.0 | 概念提取、Frontmatter 注入   |
| v0.6.0 | 关联发现、抽象概念、关联管理 |

---

## 13. 开发指南

### 13.1 TDD 工作流

```
1. Red:    编写失败的测试
2. Green:  编写最小实现使测试通过
3. Refactor: 重构代码保持测试通过
```

### 13.2 代码风格

- **命名**: PascalCase (类/接口), camelCase (变量/函数), UPPER_SNAKE_CASE (常量)
- **导入**: 外部依赖优先，内部按类型分组
- **类型**: 优先 interface，使用 Record<string, any> 处理灵活元数据
- **错误处理**: async 使用 try/catch，返回结构化错误结果

### 13.3 添加新后端

1. 实现 `VectorBackend` 接口
2. 放置于 `src/backends/`
3. 在 `main.ts` 中根据配置选择后端
4. 添加对应测试

### 13.4 添加新服务

1. 定义类型于 `src/core/types/`
2. 实现服务于 `src/services/`
3. 在 `VectorIndexManager` 或 `main.ts` 中集成
4. 添加单元测试

---

## 14. 附录

### A. Qdrant 数据模型

```json
{
    "id": "uuid",
    "vector": {
        "content_vec": [0.1, 0.2, ...],
        "summary_vec": [0.3, 0.4, ...],
        "title_vec": [0.5, 0.6, ...]
    },
    "payload": {
        "_customId": "filepath-chunk-0",
        "filePath": "notes/example.md",
        "header_path": "# Section > ## Subsection",
        "start_line": 10,
        "end_line": 25,
        "content": "...",
        "summary": "...",
        "tags": ["tag1", "tag2", "concept1"],
        "word_count": 500,
        "indexedAt": 1706000000000
    }
}
```

### B. Frontmatter 示例

```yaml
---
me_concepts:
    - "[[_me/幂等性]]"
    - "[[_me/分布式系统]]"
    - "[[_me/最终一致性]]"
me_indexed_at: "2025-01-24T10:30:00.000Z"
---
```

### C. 关联发现算法

```
1. 遍历 conceptIndex 中的每个概念
2. 对于每个概念，获取包含该概念的所有笔记
3. 生成所有笔记对的组合
4. 对于每对笔记:
   a. 计算共享概念列表
   b. 如果共享概念 >= minSharedConcepts:
      - 计算置信度 (基于概念置信度平均 + 数量奖励)
      - 如果置信度 >= minConfidence，创建关联
5. 按共享概念数量、置信度、发现时间排序
6. 返回前 maxAssociations 个关联
```

---

_本文档基于 2025-01-24 的实际代码重构结果编写。_
