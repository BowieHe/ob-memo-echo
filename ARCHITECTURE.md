# Memo Echo 项目架构参考 (v0.6.0+)

**最后更新**: 2026年1月31日  
**版本**: v0.6.0+  
**状态**: 重构完成 - 类型集中化 + 后端抽象

---

## 目录结构

```
src/
├── core/                          # 核心类型定义和常量 (NEW)
│   ├── types/                     # 领域类型集合
│   │   ├── vector.ts              # 向量存储类型 (VectorBackend 接口)
│   │   ├── embedding.ts           # 嵌入生成类型
│   │   ├── extraction.ts          # 元数据+概念提取类型
│   │   ├── indexing.ts            # 分块+缓存+队列类型
│   │   ├── association.ts         # 关联发现类型
│   │   └── frontmatter.ts         # 前置事项类型
│   └── constants.ts               # VECTOR_NAMES, 向量权重配置
│
├── backends/                      # 向量存储后端实现 (NEW)
│   ├── vector-backend.ts          # VectorBackend 接口 + 工具 (generateUUID, rrfFusionSync)
│   └── qdrant-backend.ts          # Qdrant 实现 (Named Vectors + 原生 RRF)
│
├── services/                      # 业务逻辑服务
│   ├── embedding-service.ts       # 多提供商嵌入 (local/ollama/openai)
│   ├── chunker.ts                 # Markdown 语义分块
│   ├── metadata-extractor.ts      # AI 元数据提取 (摘要/标签/类别)
│   ├── concept-extractor.ts       # AI 概念提取 (v0.5.0+)
│   ├── association-engine.ts      # 关联发现引擎 (v0.6.0+)
│   ├── association-preferences.ts # 用户偏好管理 (v0.6.0+)
│   ├── association-exporter.ts    # 关联导出工具 (v0.6.0+)
│   ├── frontmatter-service.ts     # 前置事项操作 (读写 me_concepts, me_indexed_at)
│   ├── memory-cache.ts            # 内存 LRU 缓存
│   ├── persist-queue.ts           # 批量持久化队列
│   ├── vector-index-manager.ts    # 索引管道编排
│   └── paragraph-detector.ts      # 段落完成检测
│
├── views/                         # Obsidian 视图
│   ├── unified-search-view.ts     # 语义搜索 + 实时建议
│   └── association-view.ts        # 智能关联发现
│
├── components/                    # React 组件
│   ├── Sidebar.tsx                # 搜索UI和建议展示
│   └── AssociationPanel.tsx       # 关联展示和管理
│
├── utils/
│   └── wikilink-utils.ts          # Wikilink 提取工具
│
├── __tests__/                     # Jest 单元和集成测试
├── __mocks__/                     # 依赖 mock
├── main.ts                        # 插件入口 + 服务初始化
├── settings.ts                    # 设置 UI 和配置管理
└── index.ts                       # 导出入口

ABANDONED (待删除):
├── services/vector-store.ts       # ❌ 已被 QdrantBackend 替代
├── services/lancedb-backend.ts    # ❌ 暂不支持
├── services/concept-cache-service.ts  # ❌ 功能合并到前置事项
├── indexing-view.ts               # ❌ 功能并入设置
└── __tests__/*.test.ts (相关废弃文件)
```

---

## 核心数据流

### 1. 索引流程

```
File Content
    ↓
Chunker → ChunkResult[]
    ↓
MetadataExtractor → ExtractedMetadata (摘要/标签/类别)
    ↓
EmbeddingService → 3x embeddings (content_vec, summary_vec, title_vec)
    ↓
MultiVectorItem { id, vectors, metadata }
    ↓
PersistQueue (批量去重)
    ↓
VectorBackend (Qdrant)
    ↓
✓ 已索引 + me_concepts, me_indexed_at 注入到前置事项
```

### 2. 搜索流程

```
User Query Text
    ↓
EmbeddingService → Query Vector
    ↓
VectorBackend.searchWithFusion() → RRF 融合3个向量
    ↓
SearchResult[] { id, score, metadata }
    ↓
UnifiedSearchView → 展示结果
```

### 3. 推荐流程

```
Editor Content (实时)
    ↓
ParagraphDetector (段落完成检测)
    ↓
提取段落文本 (>100 chars)
    ↓
搜索流程 (同上)
    ↓
"Ambient" 模式显示推荐
```

### 4. 关联发现流程

```
Note File
    ↓
ConceptExtractor → ExtractedConcepts[]
    ↓
SimpleAssociationEngine.indexNote()
    ↓
Concept Index Updated (concept → [noteIds])
    ↓
For Each Concept:
    Find Other Notes with Same Concept
    ↓
NoteAssociation[] { sourceId, targetId, sharedConcepts, confidence }
    ↓
AssociationView 展示 + 用户可删除概念/忽略关联
```

---

## 类型系统

### 向量存储类型 (core/types/vector.ts)

```typescript
// 实现多向量存储
interface MultiVectorItem {
    id: string;
    vectors: {
        content_vec: number[]; // 内容向量 (权重 0.4)
        summary_vec: number[]; // 摘要向量 (权重 0.4)
        title_vec: number[]; // 标题向量 (权重 0.2)
    };
    metadata: Record<string, any>;
}

// 搜索结果
interface SearchResult {
    id: string;
    score: number; // RRF 融合分数 (0-∞)
    metadata: Record<string, any>;
}

// 后端抽象接口
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

### 索引类型 (core/types/indexing.ts)

```typescript
interface ChunkResult {
    content: string;
    headers: Header[];
    index: number;
    start_line: number; // 1-indexed
    end_line: number;
    header_path: string; // "# H1 > ## H2"
}

interface CachedChunk {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
    timestamp: number;
}

// 队列中的多向量项
interface MultiVectorQueuedChunk {
    id: string;
    vectors: {
        content_vec: number[];
        summary_vec: number[];
        title_vec: number[];
    };
    metadata: Record<string, any>;
}
```

### 提取类型 (core/types/extraction.ts)

```typescript
interface ExtractedMetadata {
    summary: string;
    tags: string[];
    category: string;
    concepts: string[]; // 抽象概念
    thinking_point: string; // 洞察/格言
}

interface ExtractedConcepts {
    concepts: string[];
    confidence: number; // 总体置信度
    conceptConfidences?: number[]; // 每个概念的置信度
}
```

### 关联类型 (core/types/association.ts)

```typescript
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

interface AssociationConfig {
    minSharedConcepts: number;
    minConfidence: number;
    maxAssociations: number;
    excludeSelfAssociations: boolean;
}
```

---

## 服务说明

### 核心服务

#### EmbeddingService

- **职责**: 多提供商嵌入生成
- **提供商**: local (Transformers.js), ollama, openai
- **关键方法**:
    - `embed(text): Promise<number[]>` - 单个文本嵌入
    - `embedBatch(texts[]): Promise<BatchEmbeddingResult>` - 批量嵌入
    - `updateConfig(config): void` - 动态切换提供商

#### Chunker

- **职责**: Markdown 内容语义分块
- **算法**: 按 Markdown 头分块，支持重叠
- **配置**:
    - minChunkSize: 最小块大小 (默认 100)
    - maxChunkSize: 最大块大小 (默认 800)
    - overlapSize: 块重叠大小 (默认 50)

#### MetadataExtractor

- **职责**: 从内容提取元数据
- **输出**: 摘要、标签、类别、概念、洞察
- **支持**: AI (Ollama/OpenAI) 或规则基础降级

#### ConceptExtractor

- **职责**: 从内容提取关键概念 (v0.5.0+)
- **特性** (v0.6.0):
    - `focusOnAbstractConcepts`: 优先抽象概念
    - `minConfidence`: 置信度阈值过滤
    - `excludeGenericConcepts`: 黑名单过滤
- **输出**: 概念列表 + 各自置信度

#### SimpleAssociationEngine

- **职责**: 发现基于共享概念的关联 (v0.6.0+)
- **关键方法**:
    - `indexNote(noteId, content, title?): {indexed, concepts}`
    - `indexNoteConcepts(noteId, concepts[], confidences[]): {indexed, concepts}`
    - `getAssociationsFor(noteId, config?): NoteAssociation[]`
    - `removeNote(noteId): void`
    - `clearIndex(): void`
- **特性**: 概念索引、置信度追踪、关联评分

#### VectorIndexManager

- **职责**: 编排完整的索引管道
- **关键方法**:
    - `indexFile(filePath, content): Promise<void>`
    - `search(query, options?): Promise<SearchResult[]>`
    - `flush(): Promise<void>` - 持久化队列
    - `stop(): void` - 清理资源
- **依赖**: VectorBackend, EmbeddingService, Chunker, MetadataExtractor, MemoryCache, PersistQueue

#### FrontmatterService

- **职责**: 安全的前置事项操作
- **管理字段**:
    - `me_concepts`: 提取的概念列表
    - `me_indexed_at`: 最后索引时间戳 (ISO 8601)
- **关键方法**:
    - `readMemoEchoFields(file): Promise<MemoEchoFrontmatter>`
    - `setConcepts(file, concepts[]): Promise<void>`
    - `setIndexedAt(file): Promise<void>`
    - `needsReindex(file): Promise<boolean>` - 检查是否需要重新索引

#### MemoryCache

- **职责**: 内存 LRU 缓存，用于实时推荐
- **特性**:
    - LRU 驱逐策略
    - 可配置大小 (默认 50MB)
    - 快速访问
- **关键方法**:
    - `set(id, chunk): void`
    - `get(id): CachedChunk | undefined`
    - `clear(): void`

#### PersistQueue

- **职责**: 批量持久化去重队列
- **特性**:
    - 自动批处理
    - 定时刷新
    - ID 去重
    - 多向量支持 (v0.4.0+)
- **默认配置**:
    - batchSize: 50
    - flushInterval: 30000ms (30s)

---

## 后端架构

### VectorBackend 接口

所有向量存储实现必须遵循此接口:

```typescript
interface VectorBackend {
    // 初始化 (创建表/集合)
    initialize(): Promise<void>;

    // 存储多向量项
    upsertMultiVector(item: MultiVectorItem): Promise<void>;

    // 搜索 + RRF 融合
    searchWithFusion(
        queryVector: number[],
        options?: SearchOptions,
    ): Promise<SearchResult[]>;

    // 删除操作
    delete(id: string): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;

    // 统计信息
    count(): Promise<number>;
    clear(): Promise<void>;
}
```

### Qdrant 后端特性

**文件**: `src/backends/qdrant-backend.ts`

实现方案:

- ✅ Named Vectors: 三个独立向量字段 (content_vec, summary_vec, title_vec)
- ✅ 原生 RRF: 使用 Qdrant Query API 的 `fusion: 'rrf'`
- ✅ 自动维度检测: 从第一个向量推断
- ✅ Cosine 距离: 所有向量使用 cosine 相似度
- ✅ 标签过滤: 支持按 tags 过滤结果

关键实现:

```typescript
// Named Vector 配置
vectors: {
    'content_vec': { size: dimension, distance: 'Cosine' },
    'summary_vec': { size: dimension, distance: 'Cosine' },
    'title_vec': { size: dimension, distance: 'Cosine' },
}

// 原生 RRF 查询
query: {
    prefetch: [
        { query: queryVector, using: 'content_vec', ... },
        { query: queryVector, using: 'summary_vec', ... },
        { query: queryVector, using: 'title_vec', ... },
    ],
    query: { fusion: 'rrf' },
    limit: k,
}
```

### 添加新后端

见 [MIGRATION.md](MIGRATION.md) 中的"为新的后端创建实现"章节。

---

## 配置常量

**文件**: `src/core/constants.ts`

```typescript
// 向量名称枚举
enum VECTOR_NAMES {
    CONTENT = 'content_vec',
    SUMMARY = 'summary_vec',
    TITLE = 'title_vec',
}

// 默认权重
const DEFAULT_WEIGHTS: Record<VECTOR_NAMES, number> = {
    [VECTOR_NAMES.CONTENT]: 0.4,  // 内容最重要
    [VECTOR_NAMES.SUMMARY]: 0.4,  // 摘要同等重要
    [VECTOR_NAMES.TITLE]: 0.2,    // 标题权重最低
};

// 向量配置对象
const VECTOR_CONFIGS = [
    { name: 'CONTENT', value: 'content_vec', weight: 0.4, label: 'Content', ... },
    { name: 'SUMMARY', value: 'summary_vec', weight: 0.4, label: 'Summary', ... },
    { name: 'TITLE', value: 'title_vec', weight: 0.2, label: 'Title', ... },
];

// 搜索默认值
const SEARCH_DEFAULTS = {
    limit: 10,
    prefetchMultiplier: 2,  // 预取 2x 用于融合
};
```

---

## 设置结构

**文件**: `src/settings.ts`

重要设置字段:

```typescript
interface MemoEchoSettings {
    // 嵌入配置
    embeddingProvider: "local" | "ollama" | "openai";
    ollamaUrl: string;
    ollamaModel: string;
    openaiApiKey: string;
    openaiModel: string;

    // AI 生成配置
    enableAiMetadata: boolean;
    aiGenProvider: "ollama" | "openai";
    aiGenUrl: string;
    aiGenModel: string;

    // Qdrant 配置
    qdrantUrl: string;
    qdrantCollection: string;

    // 概念和关联 (v0.5.0+)
    injectConcepts: boolean;
    conceptExtractionProvider: "ollama" | "openai" | "rules";
    conceptPageFolder: string;

    // 抽象概念 (v0.6.0+)
    focusOnAbstractConcepts: boolean;
    minConceptConfidence: number;
    excludeGenericConcepts: string; // 逗号分隔

    // 关联管理 (v0.6.0+)
    associationMinConfidence: number;
    associationAutoAccept: boolean;
    associationAutoAcceptConfidence: number;
}
```

---

## 开发工作流

### 添加新功能

1. **确定属于哪个领域** (embedding, indexing, extraction, association, etc.)
2. **定义类型** 在相应的 `core/types/*.ts` 中
3. **实现服务** 在 `services/` 中
4. **编写测试** 在 `__tests__/` 中
5. **集成** 在 `main.ts` 中初始化

### 修改类型

1. **查找定义** 在 `core/types/` 中
2. **更新类型** 并保持向后兼容
3. **检查导入** 确保所有依赖都更新
4. **运行测试** `npm test` 验证

### 调试提示

- 使用 `console.log` 和标准前缀 (如 `[Qdrant]`, `[IndexManager]`)
- 检查错误信息中的前缀确定问题来源
- 使用 VS Code 调试器设置断点
- 查看 DevTools 控制台获取运行时错误

---

## 性能考虑

### 缓存策略

- MemoryCache 限制 50MB，使用 LRU 驱逐
- PersistQueue 批处理大小默认 50
- 搜索预取 2x 限制用于 RRF

### 向量权重调整

当前权重 (0.4, 0.4, 0.2) 可调整:

- 增加 content_vec 权重 以强调主体内容
- 增加 summary_vec 权重 以强调浓缩要点
- 减少 title_vec 权重 以减少标题偏差

### 批量索引优化

- 使用 PersistQueue 自动批处理
- 调整 `flushInterval` 平衡延迟和吞吐
- 监视内存使用调整缓存大小

---

## 常见问题

**Q: 如何启用调试日志?**
A: 查看每个服务的 `console.log` 调用。实现一个 `Logger` 类如需更好控制。

**Q: 可以离线使用吗?**
A: 是的。使用 `provider: 'local'` 用 Transformers.js 本地嵌入。概念提取时也可以使用 `provider: 'rules'`。

**Q: 推荐速度如何提升?**
A: 调整 `ParagraphDetector` 的 debounce 延迟。增加 `MemoryCache` 大小。优化 Ollama 模型大小。

**Q: 支持哪些向量数据库?**
A: 当前只支持 Qdrant。可扩展添加其他 (LanceDB, Pinecone, Weaviate, 等)。

---

## 相关文档

- [MIGRATION.md](MIGRATION.md) - 迁移指南和历史
- [AGENTS.md](AGENTS.md) - 项目概述 (AI 工作用)
- 各个服务文件的注释和类型定义

---

**最后更新**: 2026年1月31日  
**维护者**: Memo Echo 团队
