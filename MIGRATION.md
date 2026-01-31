# Memo Echo 项目结构重构迁移指南 (v0.6.0+)

**时间**: 2026年1月31日
**版本**: v0.6.0 架构重构
**状态**: 类型剥离完成，后续逐步删除遗留代码

## 概述

本次重构的目标是改善代码组织、增强解耦、并为未来的功能扩展创造清晰的架构。重构分三个阶段：

1. **✅ 已完成 - 类型剥离**: 将分散在各服务中的类型定义集中到 `src/core/types/`
2. **进行中 - 目录重构**: 创建 `src/backends/` 和优化 `src/core/` 结构
3. **计划中 - 遗留代码清理**: 删除不再使用的文件和功能

---

## 迁移阶段 1: 类型剥离 ✅

### 创建的新目录结构

```
src/core/                    # 核心类型和常量
├── types/
│   ├── vector.ts           # VectorBackend, MultiVectorItem, SearchResult
│   ├── embedding.ts        # EmbeddingConfig, EmbeddingProvider
│   ├── extraction.ts       # ExtractedMetadata, ExtractedConcepts
│   ├── indexing.ts         # ChunkResult, CachedChunk, QueuedChunk
│   ├── association.ts      # NoteAssociation, AssociationConfig
│   └── frontmatter.ts      # MemoEchoFrontmatter
└── constants.ts            # VECTOR_NAMES, DEFAULT_WEIGHTS

src/backends/               # 向量存储后端实现
├── vector-backend.ts       # VectorBackend 接口 + 工具函数
└── qdrant-backend.ts       # Qdrant 实现
```

### 所有迁移的类型

| 来源文件               | 类型/接口                 | 迁移到                    | 备注         |
| ---------------------- | ------------------------- | ------------------------- | ------------ |
| vector-backend.ts      | `VectorBackend`           | core/types/vector.ts      | 核心接口     |
| vector-backend.ts      | `MultiVectorItem`         | core/types/vector.ts      | 三向量项目   |
| vector-backend.ts      | `SearchResult`            | core/types/vector.ts      | 搜索结果     |
| vector-backend.ts      | `SearchOptions`           | core/types/vector.ts      | 搜索选项     |
| embedding-service.ts   | `EmbeddingConfig`         | core/types/embedding.ts   | 嵌入配置     |
| embedding-service.ts   | `EmbeddingProvider`       | core/types/embedding.ts   | 提供商类型   |
| embedding-service.ts   | `BatchEmbeddingResult`    | core/types/embedding.ts   | 批量结果     |
| chunker.ts             | `ChunkResult`             | core/types/indexing.ts    | 分块结果     |
| chunker.ts             | `ChunkerConfig`           | core/types/indexing.ts    | 分块配置     |
| chunker.ts             | `Header`                  | core/types/indexing.ts    | Markdown 头  |
| memory-cache.ts        | `CachedChunk`             | core/types/indexing.ts    | 缓存项       |
| persist-queue.ts       | `QueuedChunk`             | core/types/indexing.ts    | 队列项       |
| persist-queue.ts       | `MultiVectorQueuedChunk`  | core/types/indexing.ts    | 多向量队列项 |
| persist-queue.ts       | `PersistQueueConfig`      | core/types/indexing.ts    | 队列配置     |
| persist-queue.ts       | `QueueStats`              | core/types/indexing.ts    | 队列统计     |
| metadata-extractor.ts  | `ExtractedMetadata`       | core/types/extraction.ts  | 元数据       |
| metadata-extractor.ts  | `MetadataExtractorConfig` | core/types/extraction.ts  | 元数据配置   |
| concept-extractor.ts   | `ConceptExtractionConfig` | core/types/extraction.ts  | 概念配置     |
| concept-extractor.ts   | `ExtractedConcepts`       | core/types/extraction.ts  | 概念结果     |
| association-engine.ts  | `NoteAssociation`         | core/types/association.ts | 关联定义     |
| association-engine.ts  | `AssociationConfig`       | core/types/association.ts | 关联配置     |
| association-engine.ts  | `ConceptIndexEntry`       | core/types/association.ts | 概念索引项   |
| frontmatter-service.ts | `MemoEchoFrontmatter`     | core/types/frontmatter.ts | 前置事项     |
| services/constants.ts  | (全部)                    | core/constants.ts         | 常量和配置   |

### 导入路径更新

**之前**:

```typescript
import {
    VectorBackend,
    SearchResult,
    VECTOR_NAMES,
} from "./services/vector-backend";
import { ChunkResult } from "./services/chunker";
import { EmbeddingConfig } from "./services/embedding-service";
```

**之后**:

```typescript
import type { VectorBackend, SearchResult } from "../backends/vector-backend";
import type { ChunkResult } from "../core/types/indexing";
import type { EmbeddingConfig } from "../core/types/embedding";
import { VECTOR_NAMES } from "../core/constants";
```

### 受影响的文件

所有导入已更新的文件:

- `src/main.ts`
- `src/services/vector-index-manager.ts`
- `src/services/persist-queue.ts`
- `src/services/memory-cache.ts`
- `src/services/chunker.ts`
- `src/services/embedding-service.ts`
- `src/services/metadata-extractor.ts`
- `src/services/concept-extractor.ts`
- `src/services/association-engine.ts`
- `src/services/association-preferences.ts`
- `src/services/frontmatter-service.ts`
- `src/services/paragraph-detector.ts`
- `src/__tests__/vector-index-manager.test.ts`
- `src/__tests__/persist-queue.test.ts`
- `src/__tests__/association-integration.test.ts`

---

## 迁移阶段 2: 后端目录重构

### 创建 backends 目录

```
src/backends/
├── vector-backend.ts       # 接口定义 + 工具函数 (generateUUID, rrfFusion)
├── qdrant-backend.ts       # Qdrant 实现 (从 services/ 迁移)
```

### VectorBackend 工具函数

在 `backends/vector-backend.ts` 中添加共享工具:

```typescript
/**
 * 生成 UUID v4
 */
export function generateUUID(): string { ... }

/**
 * RRF (Reciprocal Rank Fusion) 融合
 * 用于不支持原生融合的后端
 */
export function rrfFusionSync(
    resultSets: Array<Array<{...}>>,
    limit: number,
    k?: number
): SearchResult[] { ... }
```

### Qdrant 后端特性

`backends/qdrant-backend.ts` 保留所有原有特性:

- ✅ Named Vectors (content_vec, summary_vec, title_vec)
- ✅ 原生 RRF 融合
- ✅ 自动维度检测
- ✅ Cosine 距离度量
- ✅ 标签过滤支持

---

## 迁移阶段 3: 遗留代码清理 (计划中)

### 待删除文件

| 文件                                    | 原因                     | 状态     |
| --------------------------------------- | ------------------------ | -------- |
| `src/services/vector-store.ts`          | 已被 QdrantBackend 替代  | 计划删除 |
| `src/services/lancedb-backend.ts`       | 用户决定暂时不支持       | 计划删除 |
| `src/services/concept-cache-service.ts` | 功能可由前置事项替代     | 计划删除 |
| `src/indexing-view.ts`                  | 非激活视图，功能并入设置 | 计划删除 |

### 待更新的测试

| 文件                                          | 理由                         |
| --------------------------------------------- | ---------------------------- |
| `src/__tests__/vector-store.test.ts`          | 测试已废弃的类               |
| `src/__tests__/vector-store-metadata.test.ts` | 测试已废弃的类               |
| `src/__tests__/integration.test.ts`           | 使用废弃的 vector-store      |
| `src/__tests__/concept-cache-service.test.ts` | 将删除 concept-cache-service |

---

## 开发指南

### 为新的后端创建实现

当需要添加新的向量数据库支持时（如 LanceDB、Pinecone等），按以下步骤：

1. **创建新文件**:

    ```
    src/backends/my-vector-backend.ts
    ```

2. **实现接口**:

    ```typescript
    import type { VectorBackend, MultiVectorItem, SearchResult, SearchOptions } from './vector-backend';

    export class MyVectorBackend implements VectorBackend {
        async initialize(): Promise<void> { ... }
        async upsertMultiVector(item: MultiVectorItem): Promise<void> { ... }
        async searchWithFusion(queryVector: number[], options?: SearchOptions): Promise<SearchResult[]> { ... }
        // ... 其他必需方法
    }
    ```

3. **支持 RRF 融合**:
    - 如果后端支持原生融合: 在 `searchWithFusion` 中直接使用
    - 如果不支持: 导入 `rrfFusionSync` 并手动融合结果

    ```typescript
    import { rrfFusionSync } from "./vector-backend";

    // 执行3个单独查询
    const [contentResults, summaryResults, titleResults] = await Promise.all([
        this.queryVector(VECTOR_NAMES.CONTENT, queryVector),
        this.queryVector(VECTOR_NAMES.SUMMARY, queryVector),
        this.queryVector(VECTOR_NAMES.TITLE, queryVector),
    ]);

    // 融合结果
    return rrfFusionSync([contentResults, summaryResults, titleResults], limit);
    ```

4. **在 main.ts 中添加选项**:
    ```typescript
    // 根据设置选择后端
    if (this.settings.vectorBackendType === 'qdrant') {
        this.vectorBackend = new QdrantBackend(...);
    } else if (this.settings.vectorBackendType === 'my-backend') {
        this.vectorBackend = new MyVectorBackend(...);
    }
    ```

### 类型定义的组织原则

- **按领域分组**: 相关的类型放在同一个 `types/*.ts` 文件中
- **导出重新导出**: 服务可以重新导出其类型供外部使用
- **避免循环导入**: 类型应该只依赖其他类型，不依赖服务实现

### 新增类型的最佳实践

如果需要新增类型:

1. **确定其归属领域**: 是向量存储、索引、提取还是其他?
2. **添加到相应 types/\*.ts 文件**: 或创建新的类型文件
3. **从服务重新导出**:
    ```typescript
    // src/services/my-service.ts
    import type { MyType } from '../core/types/my-domain';
    export type { MyType };
    export class MyService { ... }
    ```
4. **更新文档**: 在此迁移指南中记录

---

## 验证清单

完成每个迁移步骤后，检查:

- [ ] `npm run build` 无错误
- [ ] `npm test` 所有测试通过
- [ ] 没有导入错误警告
- [ ] TypeScript strict mode 下无问题
- [ ] 相关文件的导入路径正确

---

## 后续计划

### v0.6.1

- 删除 `concept-cache-service.ts`
- 更新 `association-view.ts` 移除缓存依赖
- 删除遗留测试文件

### v0.7.0

- 删除 `vector-store.ts` 及其测试
- 考虑添加 LanceDB 或其他后端支持
- 完整的架构文档

---

## 常见问题

**Q: 为什么要这样重构?**
A: 让代码更容易理解、维护和扩展。集中的类型定义使得接口更清晰，后端抽象使得添加新数据库支持变得容易。

**Q: 这会破坏现有功能吗?**
A: 不会。这是纯重构，所有功能保持不变。导入路径改变了，但实现逻辑没有改变。

**Q: 我如何快速学习新结构?**
A:

1. 查看 `ARCHITECTURE.md` 了解全局结构
2. 从 `src/backends/qdrant-backend.ts` 理解后端实现
3. 查看 `src/core/types/` 了解所有类型定义
4. 如果要添加功能，找相应的域文件修改

**Q: 如何验证迁移?**
A: 运行 `npm run build && npm test`。如果通过，说明迁移成功。

---

## 联系和反馈

如有问题或建议，请参考相关的源文件或架构文档。
