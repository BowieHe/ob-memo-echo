# Qdrant 单一集合设计方案

## 概述

将 Chunk、Concept、Wikilink 三种类型存储在同一个 Qdrant 集合中，通过 `type` 字段区分。这是对原有架构的重大优化，简化存储结构，提高查询效率。

---

## 核心设计思想

### 统一存储
- **Chunk**：笔记片段，用于语义搜索
- **Concept**：概念聚合，用于概念匹配和去重
- **Wikilink**：全局双链索引，不需要向量

### 向量策略
- **Chunk**：4 个向量（content_vec, summary_vec, title_vec, tag_vec）
- **Concept**：1 个向量（tag_vec）
- **Wikilink**：无向量，仅存储 payload

### 类型区分
通过 `type` 字段区分：
- `"chunk"`：笔记片段
- `"concept"`：概念聚合
- `"wikilink"`：全局双链索引

---

## Qdrant 存储结构

### 1. Chunk 类型（笔记片段）

```typescript
{
  type: "chunk",

  vectors: {
    content_vec: [...],    // 内容向量
    summary_vec: [...],    // 摘要向量
    title_vec: [...],      // 标题向量
    tag_vec: [...],        // me_tag 向量（用于概念匹配）
  },

  payload: {
    filePath: "Docker入门.md",
    content: "通过 docker run 启动容器...",
    header_path: "## 容器启动",
    start_line: 10,
    end_line: 20,
    summary: "介绍了 Docker 容器启动的基本方法",

    // me_tag（chunk 级别）
    me_tag: ["容器启动", "端口映射", "Docker"],

    // tags（me_tag + category）
    tags: ["容器启动", "端口映射", "Docker", "技术笔记"],

    // me_concepts（全文级别，推荐双链）
    me_concepts: [
      {
        raw_text: "[[虚拟机]]",
        reason: "容器技术与虚拟机相关"
      }
    ],

    // wikilinks（用户的双链）
    wikilinks: [
      { raw_text: "[[容器化技术]]", reason: "用户引用" }
    ],

    type: "chunk",
    word_count: 100,
    indexedAt: 1234567890
  }
}
```

### 2. Concept 类型（概念聚合）

```typescript
{
  type: "concept",

  vectors: {
    tag_vec: [...],  // tag 名称向量（替代 concept_vec）
  },

  payload: {
    concept: "容器启动",
    summary: "使用 docker run 启动容器的操作",
    link: "[[_me/容器启动]]",
    related_notes: ["笔记A.md", "笔记B.md"],
    noteCount: 2,
    type: "concept"
  }
}
```

### 3. Wikilink 类型（全局双链索引）

```typescript
{
  type: "wikilink",

  vectors: {},  // 不需要向量

  payload: {
    link_name: "虚拟机",
    link_text: "[[虚拟机]]",
    source_files: ["笔记A.md", "笔记C.md"],
    noteCount: 2,
    type: "wikilink"
  }
}
```

---

## 向量配置

### Named Vectors 配置

```typescript
// src/core/constants.ts
export const VECTOR_NAMES = {
  CONTENT: "content_vec",
  SUMMARY: "summary_vec", 
  TITLE: "title_vec",
  TAG: "tag_vec",
} as const;

export const VECTOR_DIMENSIONS = {
  [VECTOR_NAMES.CONTENT]: 768,  // 根据 embedding 模型调整
  [VECTOR_NAMES.SUMMARY]: 768,
  [VECTOR_NAMES.TITLE]: 768,
  [VECTOR_NAMES.TAG]: 768,
};

export const DEFAULT_WEIGHTS = {
  [VECTOR_NAMES.CONTENT]: 1.0,
  [VECTOR_NAMES.SUMMARY]: 0.8,
  [VECTOR_NAMES.TITLE]: 0.5,
};
```

### 各类型向量使用

| 类型 | content_vec | summary_vec | title_vec | tag_vec | 用途 |
|------|-------------|-------------|-----------|---------|------|
| **Chunk** | ✅ | ✅ | ✅ | ✅ | 语义搜索 + 概念匹配 |
| **Concept** | ❌ | ❌ | ❌ | ✅ | 概念匹配和去重 |
| **Wikilink** | ❌ | ❌ | ❌ | ❌ | 无向量，仅索引 |

---

## 搜索策略

### 1. 语义搜索（主要内容）

```typescript
// src/services/vector-backend.ts
async searchWithFusion(
  queryVector: number[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const limit = options.limit || 10;
  const prefetchLimit = limit * 2;

  // 使用 Qdrant Query API for native RRF fusion
  const results = await this.client.query(this.collectionName, {
    prefetch: [
      {
        query: queryVector,
        using: VECTOR_NAMES.CONTENT,
        limit: prefetchLimit,
        filter: this.buildFilter(options),
      },
      {
        query: queryVector,
        using: VECTOR_NAMES.SUMMARY,
        limit: prefetchLimit,
        filter: this.buildFilter(options),
      },
      {
        query: queryVector,
        using: VECTOR_NAMES.TITLE,
        limit: prefetchLimit,
        filter: this.buildFilter(options),
      },
    ],
    query: { fusion: 'rrf' },
    limit,
    with_payload: true,
  });

  return results.points.map(point => {
    const payload = point.payload as any;
    const { _customId, ...metadata } = payload;

    return {
      id: _customId,
      score: point.score || 0,
      metadata,
    };
  });
}
```

### 2. 概念匹配（tag_vec）

```typescript
// src/services/concept-registry.ts
async findSimilarConcept(tagName: string): Promise<ConceptRecord | null> {
  const tagVector = await this.embeddingService.embed(tagName);

  const results = await this.qdrant.search(this.collectionName, {
    vector: tagVector,
    using: VECTOR_NAMES.TAG,
    limit: 1,
    score_threshold: 0.85,
    filter: {
      must: [{ key: "type", match: { value: "concept" } }]
    },
    with_payload: true
  });

  if (results.length > 0 && results[0].score >= 0.85) {
    return results[0].payload as ConceptRecord;
  }

  return null;
}
```

### 3. 双链查询（无向量）

```typescript
// src/services/wikilink-index.ts
async getWikilinkByName(linkName: string): Promise<WikilinkRecord | null> {
  const results = await this.qdrant.scroll(this.collectionName, {
    limit: 1,
    filter: {
      must: [
        { key: "type", match: { value: "wikilink" } },
        { key: "link_name", match: { value: linkName } }
      ]
    },
    with_payload: true
  });

  if (results.points.length > 0) {
    return results.points[0].payload as WikilinkRecord;
  }

  return null;
}

async getAllWikilinks(): Promise<WikilinkRecord[]> {
  const results = await this.qdrant.scroll(this.collectionName, {
    limit: 1000,
    filter: {
      must: [{ key: "type", match: { value: "wikilink" } }]
    },
    with_payload: true
  });

  return results.points.map(p => p.payload as WikilinkRecord);
}
```

---

## 索引流程

### 1. MetadataExtractor 改造

```typescript
// src/core/types/extraction.ts
export interface ExtractedMetadata {
  summary: string;
  me_tag: string[];      // tags → me_tag
  category: string;
  me_concepts: Array<{      // 新增：全文级别推荐双链
    raw_text: string;
    reason: string;
  }>;
}

export const EMPTY_EXTRACTED_METADATA: ExtractedMetadata = {
  summary: "",
  me_tag: [],
  category: "",
  me_concepts: [],
};
```

### 2. VectorIndexManager 索引流程

```typescript
// src/services/vector-index-manager.ts
async indexFileComplete(
  filePath: string,
  content: string,
  title: string,
): Promise<UnifiedIndexResult> {
  console.log("[MemoEcho] Unified index start:", filePath);

  const preprocessed = this.contentPreprocessor.preprocess(content);
  const semanticChunks = await this.semanticChunker.chunk(
    preprocessed.cleaned,
    title,
  );
  const chunks = this.buildChunksFromSemantic(content, semanticChunks);

  // 🆕 全文级别提取 me_concepts
  const me_concepts = await this.metadataExtractor.extractConceptsFromFullText(content);

  const concepts: ExtractedConceptDetail[] = [];

  for (const chunk of chunks) {
    const extractedMetadata = await this.metadataExtractor.extract(
      chunk.content,
    );
    
    // 🆕 生成 tag 向量
    const tagVector = await this.embeddingService.embed(
      extractedMetadata.me_tag.join(", ")
    );

    const chunkConcepts = this.mapConceptsFromMetadata(
      extractedMetadata.concepts,
      extractedMetadata.summary,
      chunk.header_path,
    );

    concepts.push(...chunkConcepts);
    
    await this.indexChunkWithMetadata(
      filePath,
      chunk,
      extractedMetadata,
      me_concepts,  // 🆕 传入 me_concepts
      tagVector,     // 🆕 传入 tag_vector
    );
  }

  console.log("[MemoEcho] Unified index finished:", filePath);

  return {
    chunks,
    concepts: this.deduplicateConcepts(concepts),
  };
}

private async indexChunkWithMetadata(
  filePath: string,
  chunk: ChunkResult,
  extractedMetadata: {
    summary: string;
    me_tag: string[];
    category: string;
    concepts: ExtractedMetadataConcept[];
  },
  me_concepts: Array<{ raw_text: string; reason: string }>, // 🆕 新增
  tagVector: number[],  // 🆕 新增
): Promise<void> {
  const chunkId = `${filePath}-chunk-${chunk.index}`;

  // Generate three embeddings in parallel
  const [contentEmbedding, summaryEmbedding, titleEmbedding] =
    await Promise.all([
      this.embeddingService.embed(chunk.content),
      this.embeddingService.embed(
        extractedMetadata.summary || chunk.content.slice(0, 200),
      ),
      this.embeddingService.embed(chunk.header_path || filePath),
    ]);

  const conceptNames = extractedMetadata.concepts
    .map((concept) => concept.name)
    .filter(Boolean);

  // 🆕 修改 payload
  const payload = {
    filePath,
    header_path: chunk.header_path,
    start_line: chunk.start_line,
    end_line: chunk.end_line,
    content: chunk.content,
    summary: extractedMetadata.summary,
    
    // 🆕 me_tag 和 tags
    me_tag: extractedMetadata.me_tag,
    tags: [...extractedMetadata.me_tag, extractedMetadata.category].filter(Boolean),
    
    // 🆕 me_concepts
    me_concepts: me_concepts,
    
    concepts: conceptNames,
    type: "chunk",
    word_count: chunk.content.length,
    indexedAt: Date.now(),
  };

  // Create cached chunk
  const cachedChunk: CachedChunk = {
    id: chunkId,
    content: chunk.content,
    embedding: contentEmbedding,
    metadata: payload,
    timestamp: Date.now(),
  };

  this.memoryCache.set(chunkId, cachedChunk);

  // Add to multi-vector persist queue
  const queuedChunk: MultiVectorQueuedChunk = {
    id: chunkId,
    vectors: {
      [VECTOR_NAMES.CONTENT]: contentEmbedding,
      [VECTOR_NAMES.SUMMARY]: summaryEmbedding,
      [VECTOR_NAMES.TITLE]: titleEmbedding,
      [VECTOR_NAMES.TAG]: tagVector,  // 🆕 新增
    },
    metadata: payload,
  };

  this.persistQueue.enqueueMultiVector(queuedChunk);
}
```

### 3. WikilinkExtractor 新增

```typescript
// src/services/wikilink-extractor.ts
export class WikilinkExtractor {
  extractUserLinks(file: TFile): Array<{ raw_text: string; reason: string }> {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = cache?.links || [];

    return links.map(link => ({
      raw_text: `[[${link.link}]]`,
      reason: "用户引用链接"
    }));
  }

  extractWikilinkNames(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const matches = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }
}
```

---

## Frontmatter 注入

### 1. 新增字段

```typescript
// src/core/types/frontmatter.ts
export interface MemoEchoFrontmatter {
    me_concepts?: string[];    // 保留：概念聚合页面
    me_indexed_at?: string;    // 最后索引时间
    me_tag?: string[];         // 🆕：chunk 级别的核心内容
    me_concepts_links?: Array<{  // 🆕：全文级别推荐双链
        raw_text: string;
        reason: string;
    }>;
}
```

### 2. FrontmatterService 扩展

```typescript
// src/services/frontmatter-service.ts
class FrontmatterService {
    /**
     * 设置 me_tag 字段到 frontmatter（智能增量）
     */
    async setMeTag(file: TFile, me_tag: string[]): Promise<void> {
        const cache = this.app.metadataCache.getFileCache(file);
        const userTags = cache?.tags?.map(t => t.tag) || [];
        
        // 智能增量策略（从 settings 读取）
        const strategy = this.settings.meTagStrategy || "always";
        
        let finalMeTag: string[] | undefined;
        
        switch (strategy) {
            case "always":
                finalMeTag = me_tag;
                break;
            case "incremental":
                finalMeTag = [...userTags, ...me_tag];
                break;
            case "smart":
                const threshold = this.settings.userTagThreshold || 3;
                finalMeTag = userTags.length >= threshold ? undefined : me_tag;
                break;
        }

        if (!finalMeTag || finalMeTag.length === 0) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_tag = finalMeTag;
        });
    }

    /**
     * 设置 me_concepts_links 字段到 frontmatter
     */
    async setMeConceptsLinks(
        file: TFile, 
        concepts_links: Array<{ raw_text: string; reason: string }>
    ): Promise<void> {
        if (!concepts_links || concepts_links.length === 0) return;

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.me_concepts_links = concepts_links;
        });
    }
}
```

---

## Settings 配置

### 新增配置项

```typescript
// src/core/types/setting.ts
export interface MemoEchoSettings {
    // ... 现有配置
    
    // 🆕 me_tag 配置
    meTagStrategy: "always" | "incremental" | "smart";
    userTagThreshold: number;
    
    // 🆕 概念聚合配置
    autoCreateConceptPage: boolean;
    conceptPagePrefix: string;
    
    // 🆕 双链索引配置
    enableWikilinkIndex: boolean;
    wikilinkIndexRefreshInterval: number; // 分钟
}

export const DEFAULT_SETTINGS: MemoEchoSettings = {
    // ... 现有默认值
    
    // 🆕 me_tag 默认配置
    meTagStrategy: "smart",
    userTagThreshold: 3,
    
    // 🆕 概念聚合默认配置
    autoCreateConceptPage: true,
    conceptPagePrefix: "_me",
    
    // 🆕 双链索引默认配置
    enableWikilinkIndex: true,
    wikilinkIndexRefreshInterval: 60, // 1小时
};
```

---

## 代码清理

基于 Qdrant 单一集合设计，以下代码可以直接删除：

### 1. 可以删除的方法（5 个）

#### QdrantBackend

**文件：`src/services/qdrant-backend.ts`**

```typescript
// ❌ 删除：第 345-379 行
async searchSimilarConceptsStrict(
    queryVector: number[],
    options: { limit?: number; scoreThreshold?: number } = {}
): Promise<Array<{ id: string; score: number; payload: ConceptPayload }>> {
    // 这个方法将被新的 searchSimilarConcepts 替代
}

// ❌ 删除：第 384-428 行
async searchSimilarConceptsLoose(
    conceptVector: number[],
    summaryVector: number[],
    options: { limit?: number; scoreThreshold?: number } = {}
): Promise<Array<{ id: string; score: number; payload: ConceptPayload }>> {
    // 这个方法将被新的 searchSimilarConcepts 替代
}
```

#### VectorIndexManager

**文件：`src/services/vector-index-manager.ts`**

```typescript
// ❌ 删除：第 301-321 行
private mapConceptsFromMetadata(
    concepts: ExtractedMetadataConcept[],
    summary: string,
    headerPath: string,
): ExtractedConceptDetail[] {
    // 不再需要，因为 concepts 字段将被删除
}

// ❌ 删除：第 323-337 行
private deduplicateConcepts(
    concepts: ExtractedConceptDetail[],
): ExtractedConceptDetail[] {
    // 不再需要，因为 concepts 字段将被删除
}
```

#### MetadataExtractor

**文件：`src/services/metadata-extractor.ts`**

```typescript
// ❌ 删除：第 199-238 行
private normalizeConcepts(
    concepts: any[],
): Array<{ name: string; confidence: number }> {
    // 不再需要，因为 concepts 字段将被删除
}
```

#### 工具类

**文件：`src/utils/wikilink-utils.ts`**

```typescript
// ❌ 删除：整个文件
export function extractWikilinkConcepts(content: string): string[] {
    // 这个函数从未被引用
}
```

---

### 2. 可以删除的字段（8 个）

#### 类型定义

**文件：`src/core/types/extraction.ts`**

```typescript
// ❌ 删除：第 6-9 行
export interface ExtractedMetadataConcept {
    name: string;
    confidence: number;
}

// ❌ 删除：第 18 行
concepts: ExtractedMetadataConcept[]; // Abstract concepts with confidence
```

**文件：`src/core/types/extraction.ts`**

```typescript
// ❌ 删除：第 25 行
export const EMPTY_EXTRACTED_METADATA: ExtractedMetadata = {
    summary: "",
    tags: [],
    category: "",
    concepts: [],  // 删除
};
```

#### 常量定义

**文件：`src/services/qdrant-backend.ts`**

```typescript
// ❌ 删除：ensureCollection 方法中的第 88-89 行
vectors: {
    content_vec: { size: dimension, distance: 'Cosine' },
    summary_vec: { size: dimension, distance: 'Cosine' },
    title_vec: { size: dimension, distance: 'Cosine' },
    // ❌ 删除：
    concept_vec: { size: dimension, distance: 'Cosine' },
    concept_summary_vec: { size: dimension, distance: 'Cosine' },
}
```

---

### 3. 删除原因总结

| 文件 | 删除内容 | 原因 |
|------|----------|------|
| `extraction.ts` | `ExtractedMetadataConcept` 接口 | 替换为 `Array<{ raw_text: string; reason: string }>` |
| `extraction.ts` | `concepts` 字段 | 移动到全文级别提取 |
| `metadata-extractor.ts` | `normalizeConcepts` 方法 | concepts 字段被删除 |
| `concept-registry.ts` | `searchSimilarConceptsStrict` 和 `searchSimilarConceptsLoose` 接口 | 替换为 `searchSimilarConcepts` |
| `qdrant-backend.ts` | `concept_vec`, `concept_summary_vec` 向量定义 | 替换为 `tag_vec` |
| `qdrant-backend.ts` | `searchSimilarConceptsStrict` 方法 | 替换为 `searchSimilarConcepts` |
| `qdrant-backend.ts` | `searchSimilarConceptsLoose` 方法 | 替换为 `searchSimilarConcepts` |
| `vector-index-manager.ts` | `mapConceptsFromMetadata` 方法 | concepts 字段被删除 |
| `vector-index-manager.ts` | `deduplicateConcepts` 方法 | concepts 字段被删除 |
| `wikilink-utils.ts` | 整个文件 | 函数未被使用 |

---

## 需要修改的文件清单

### 类型定义（4 个文件）

1. **`src/core/types/vector-backend.ts`**
   - 添加 `tag_vec` 到 `VECTOR_NAMES`
   - 修改 `SearchOptions` 支持更多过滤

2. **`src/core/types/extraction.ts`**
   - 修改 `ExtractedMetadata`，将 `tags` 改为 `me_tag`
   - 添加 `me_concepts` 类型

3. **`src/core/types/frontmatter.ts`**
   - 添加 `me_tag` 字段
   - 添加 `me_concepts_links` 字段

4. **`src/core/types/qdrant-backend.ts`**（新增）
   - `ChunkRecord`
   - `ConceptRecord` 
   - `WikilinkRecord`

### 服务层（5 个文件）

5. **`src/services/metadata-extractor.ts`**
   - 修改 `ExtractedMetadata` 类型
   - 修改 prompt：chunk 级别提取 me_tag，全文级别提取 me_concepts
   - 添加 `extractConceptsFromFullText()` 方法

6. **`src/services/concept-registry.ts`**
   - 使用 `tag_vec` 替代 `concept_vec`
   - 修改查询逻辑，添加 `type: "concept"` 过滤

7. **`src/services/wikilink-extractor.ts`**（新增）
   - 提取用户双链
   - 扫描所有笔记的双链

8. **`src/services/wikilink-index.ts`**（新增）
   - 全局双链索引管理
   - 无向量查询

9. **`src/services/frontmatter-service.ts`**
   - 添加 `setMeTag()` 方法
   - 添加 `setMeConceptsLinks()` 方法

### 后端层（2 个文件）

10. **`src/services/vector-index-manager.ts`**
    - 修改索引流程，添加 `tag_vec` 生成
    - 添加全文级别提取
    - 集成 WikilinkExtractor

11. **`src/services/qdrant-backend.ts`**
    - 添加 `tag_vec` 到 named vectors
    - 修改 `upsertMultiVector()` 支持 tag_vec
    - 添加 `upsertConcept()` 和 `upsertWikilink()` 方法

### 配置层（1 个文件）

12. **`src/core/constants.ts`**
    - 添加 `VECTOR_NAMES.TAG`
    - 添加相关维度和权重

---

## 实施步骤

### Phase 1: 类型定义（1 天）
1. 修改 `extraction.ts`，`tags` → `me_tag`
2. 添加 `me_concepts` 和 `me_concepts_links` 类型
3. 添加 `tag_vec` 到 `VECTOR_NAMES`
4. 运行 TypeScript check

### Phase 2: MetadataExtractor（1 天）
1. 修改 prompt，区分 chunk 和全文提取
2. 实现 `extractConceptsFromFullText()` 方法
3. 测试 AI 提取

### Phase 3: Wikilink 服务（1 天）
1. 创建 `WikilinkExtractor` 类
2. 创建 `WikilinkIndex` 类
3. 测试双链提取和查询

### Phase 4: VectorIndexManager（1 天）
1. 修改索引流程，添加 `tag_vec` 生成
2. 添加全文级别 me_concepts 提取
3. 集成 WikilinkExtractor

### Phase 5: Qdrant Backend（1 天）
1. 添加 `tag_vec` 到 named vectors
2. 实现 `upsertConcept()` 和 `upsertWikilink()` 方法
3. 测试三种类型存储

### Phase 6: Frontmatter Service（1 天）
1. 添加 `setMeTag()` 和 `setMeConceptsLinks()` 方法
2. 实现智能增量策略
3. 测试 frontmatter 注入

### Phase 7: Settings 配置（0.5 天）
1. 添加新的配置项
2. 更新设置 UI
3. 测试配置

### Phase 8: 集成测试（1 天）
1. 端到端测试
2. 向后兼容性测试
3. 性能测试

---

## 向后兼容性

### 数据迁移

```typescript
async migrateFromOldSchema() {
  // 1. 读取旧的 chunk 记录
  const oldChunks = await this.qdrant.scroll(this.collectionName, {
    filter: { must: [{ key: "type", match: { value: "chunk" } }] },
    with_payload: true
  });

  for (const oldChunk of oldChunks.points) {
    const payload = oldChunk.payload;

    // 2. 生成 tag 向量
    const tagVector = await this.embeddingService.embed(
      (payload.tags || []).join(", ")
    );

    // 3. 更新记录，添加 tag_vec 和新字段
    await this.qdrant.upsert(this.collectionName, {
      id: oldChunk.id,
      vectors: {
        content_vec: oldChunk.vector.content_vec,
        summary_vec: oldChunk.vector.summary_vec,
        title_vec: oldChunk.vector.title_vec,
        tag_vec: tagVector  // 新增
      },
      payload: {
        ...payload,
        me_tag: payload.tags || [],  // tags → me_tag
        tags: [...(payload.tags || []), payload.category].filter(Boolean),
        me_concepts: [],  // 初始化为空
        me_concepts_links: [],  // 初始化为空
        wikilinks: []  // 初始化为空
      }
    });
  }

  // 4. 迁移 concept 记录
  const oldConcepts = await this.qdrant.scroll(this.collectionName, {
    filter: { must: [{ key: "type", match: { value: "concept" } }] },
    with_payload: true
  });

  for (const oldConcept of oldConcepts.points) {
    // 生成 tag 向量
    const tagVector = await this.embeddingService.embed(
      oldConcept.payload.concept
    );

    await this.qdrant.upsert(this.collectionName, {
      id: oldConcept.id,
      vectors: {
        tag_vec: tagVector
      },
      payload: {
        ...oldConcept.payload,
        type: "concept"
      }
    });
  }
}
```

### Frontmatter 迁移

```typescript
async migrateFrontmatter() {
  const files = this.app.vault.getMarkdownFiles();
  
  for (const file of files) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    
    // 如果有旧的 me_concepts，迁移到新字段
    if (frontmatter.me_concepts) {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.me_concept_links = fm.me_concepts?.map(concept => ({
          raw_text: `[[${concept}]]`,
          reason: "概念聚合页面"
        })) || [];
        delete fm.me_concepts;  // 删除旧字段
      });
    }
  }
}
```

---

## 风险评估

### 技术风险
1. **数据迁移风险**：确保现有数据不丢失
2. **性能风险**：tag_vec 可能增加存储成本
3. **向后兼容性**：确保旧版本插件能正常工作

### 解决方案
1. 完整的数据迁移脚本
2. 性能测试和优化
3. 版本兼容检测

---

## 总结

这个 Qdrant 单一集合设计具有以下优势：

✅ **统一管理** - 三种类型在同一个集合，便于维护
✅ **向量优化** - tag_vec 用于概念匹配，避免概念_vec 冗余
✅ **无向量索引** - Wikilink 类型不生成向量，节省存储
✅ **灵活查询** - 通过 type 字段实现高效过滤
✅ **向后兼容** - 提供完整的数据迁移方案

实施时间：约 **7 天**，需要逐步测试以确保每个环节正常工作。
