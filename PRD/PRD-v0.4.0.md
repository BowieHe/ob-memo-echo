# Obsidian Memo Echo - PRD v0.4.0

## 版本信息

-   **版本**: 0.4.0
-   **代号**: "多维检索" (Multi-Dimensional Search)
-   **状态**: Draft
-   **前置版本**: v0.3.0 (Insightful Synthesis)

---

## 1. 核心目标：从单一向量到多维语义空间

v0.3.0 实现了概念提取和推荐系统的基础架构。v0.4.0 将升级底层向量存储，引入 **Qdrant Named Vectors**，实现多维度加权检索，显著提升搜索的精准度和召回率。

### 核心价值

1. **多维度匹配**：同时从 原文内容 / AI 摘要 / 标题层级 三个维度进行语义匹配
2. **灵活权重**：可配置的加权融合策略，适应不同搜索场景
3. **精准过滤**：通过 Payload Filter 支持标签精确筛选（可选）

---

## 2. 技术设计

### 2.1 Named Vectors 架构

将单一向量替换为三个命名向量，存储在同一个 Qdrant Point 中：

```
┌─────────────────────────────────────────────────────────────┐
│                     Qdrant Point                            │
├─────────────────────────────────────────────────────────────┤
│  vectors: {                                                 │
│    "content_vec": [...],   // 原文内容 embedding            │
│    "summary_vec": [...],   // AI 摘要 embedding             │
│    "title_vec": [...]      // 标题层级 embedding            │
│  }                                                          │
├─────────────────────────────────────────────────────────────┤
│  payload: {                                                 │
│    filePath: string,       // 文件完整路径                  │
│    header_path: string,    // 标题层级 "# H1 > ## H2"       │
│    start_line: number,     // Chunk 起始行                  │
│    end_line: number,       // Chunk 结束行                  │
│    content: string,        // 原文内容（用于展示）          │
│    summary: string,        // AI 摘要（用于 summary_vec）   │
│    tags: string[],         // 用于 Payload Filter          │
│    word_count: number,     // 字数（可用于过滤太短的）      │
│    indexedAt: number       // 索引时间戳                    │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Payload 字段设计说明

**精简原则**：只保留必要字段，避免冗余。

| 字段                      | 用途            | 说明                                     |
| ------------------------- | --------------- | ---------------------------------------- |
| `filePath`                | 定位 + 展示     | 用于打开文件、显示来源                   |
| `header_path`             | 向量来源 + 展示 | 用于生成 `title_vec`，同时显示上下文层级 |
| `start_line` / `end_line` | 定位跳转        | 点击结果后跳转到具体行                   |
| `content`                 | 展示            | 预览卡片显示原文片段                     |
| `summary`                 | 向量来源 + 展示 | 用于生成 `summary_vec`，同时作为卡片摘要 |
| `tags`                    | Payload Filter  | 支持 `@标签` 语法精确过滤                |
| `word_count`              | 可选过滤        | 可排除太短的 Chunk                       |
| `indexedAt`               | 增量索引        | 判断是否需要重新索引                     |

**移除的字段**：

| 原字段           | 处理方式                                           |
| ---------------- | -------------------------------------------------- |
| `category`       | 合并到 `tags`（如 `tags: ["技术笔记", "Docker"]`） |
| `concepts`       | 合并到 `tags`（抽象概念也作为标签）                |
| `thinking_point` | 合并到 `summary` 末尾，或不再单独存储              |

### 2.3 向量来源

| 向量名称      | 内容来源                          | 用途         |
| ------------- | --------------------------------- | ------------ |
| `content_vec` | Chunk 原文内容                    | 精确细节匹配 |
| `summary_vec` | AI 生成的摘要 (`summary` 字段)    | 宏观语义匹配 |
| `title_vec`   | 标题层级路径 (`header_path` 字段) | 快速定位章节 |

### 2.4 加权融合搜索

默认权重配比（可在设置中调整）：

| 向量          | 权重      | 说明             |
| ------------- | --------- | ---------------- |
| `content_vec` | 0.4 (40%) | 细节匹配最重要   |
| `summary_vec` | 0.4 (40%) | 概念层面同样重要 |
| `title_vec`   | 0.2 (20%) | 辅助定位         |

**实现方式**：使用 Qdrant 的 `query` API 进行服务端融合：

```typescript
await client.query(collectionName, {
    prefetch: [
        { query: queryVec, using: "content_vec", limit: 20 },
        { query: queryVec, using: "summary_vec", limit: 20 },
        { query: queryVec, using: "title_vec", limit: 20 },
    ],
    query: { fusion: "rrf" }, // Reciprocal Rank Fusion
    limit: 10,
});
```

---

## 3. 搜索策略

### 3.1 两种召回场景

| 场景         | 触发方式                       | 搜索策略                                       |
| ------------ | ------------------------------ | ---------------------------------------------- |
| **主动搜索** | 用户在搜索框输入               | 纯向量搜索，不使用 Filter                      |
| **被动推荐** | 用户输入笔记时，侧边栏自动推荐 | 纯向量搜索 + 可选：提取上下文中的标签做 Filter |

### 3.2 主动搜索模式

```
用户输入: "Docker 如何配置 volumes"
         ↓
   生成 Query Embedding
         ↓
   三向量加权融合搜索 (4:4:2)
         ↓
      返回 Top-10
```

**可选增强**：支持 `@标签` 语法强制过滤

```
用户输入: "@Docker 如何配置 volumes"
         ↓
   解析: Filter = { tags: "Docker" }, Query = "如何配置 volumes"
         ↓
   先 Filter 再向量搜索
```

### 3.3 被动推荐模式（侧边栏）

```
用户正在编辑的段落内容
         ↓
   提取当前段落文本
         ↓
   生成 Query Embedding
         ↓
   三向量加权融合搜索
         ↓
   【可选】从当前段落提取标签，用 Payload Filter 增强精准度
         ↓
   侧边栏展示推荐结果
```

> **注意**：被动推荐场景中，标签提取是**可选优化**，不强制要求。
> 初期实现可先不做标签提取，仅用向量搜索保证召回率。

---

## 4. Payload Filter 机制

### 4.1 什么是 Payload Filter？

Payload 就是存储在每个 Point 中的元数据（如 `tags`, `category` 等）。Filter 是对这些元数据的条件筛选。

**执行顺序**：

1. Filter 先执行 → 缩小候选集
2. Vector Search 在筛选后的候选集中进行

**优势**：

-   精确匹配标签/分类
-   不影响向量搜索性能（Qdrant 内部优化）

### 4.2 Filter 使用原则

| 原则             | 说明                                             |
| ---------------- | ------------------------------------------------ |
| **默认不使用**   | 普通搜索不加 Filter，最大化召回率                |
| **用户主动触发** | 用户使用 `@标签` 语法或 UI 勾选时才启用          |
| **被动推荐可选** | 侧边栏推荐时可根据上下文提取标签做增强（非必须） |

### 4.3 标签的使用场景

| 场景                 | 实现方式                                      |
| -------------------- | --------------------------------------------- |
| 在特定标签范围内搜索 | `@Docker 配置` → `filter: { tags: "Docker" }` |
| 侧边栏标签导航       | 点击标签 → 显示该分类下所有笔记               |
| 搜索结果分组展示     | 搜索后按 `tags` 在客户端聚合显示              |

---

## 5. 设置项扩展

在插件设置中新增以下配置：

```typescript
interface MemoEchoSettings {
    // ... 现有设置

    // v0.4.0 新增
    searchWeights: {
        content: number; // 默认 0.4
        summary: number; // 默认 0.4
        title: number; // 默认 0.2
    };

    enableTagFilterInRecommendation: boolean; // 被动推荐时是否启用标签过滤，默认 false
}
```

---

## 6. 实现阶段

### Phase 1: 向量存储升级

-   修改 `VectorStore` 支持 Named Vectors 创建 Collection
-   修改 `upsert` 方法支持多向量插入

### Phase 2: 索引流程改造

-   修改 `VectorIndexManager.indexChunk()` 生成三个向量
-   为 `summary` 和 `header_path` 分别生成 embedding

### Phase 3: 搜索功能升级

-   实现 `searchWithFusion()` 方法
-   支持 `@标签` 语法解析

### Phase 4: 设置与 UI

-   添加权重配置 UI
-   添加标签过滤开关

### Phase 5: 数据迁移（可选）

-   提供重建索引功能，将旧数据迁移到新格式

---

## 7. User Stories

### Story 1: 多维度精准匹配

> 作为用户，当我搜索 "幂等性设计" 时，
> 我希望既能匹配到原文包含 "幂等" 的笔记，
> 也能匹配到摘要包含相关概念的笔记（如 HTTP API 的设计模式），
> 从而获得更全面的搜索结果。

### Story 2: 标签精确过滤

> 作为用户，当我输入 "@Kafka 消息重复" 时，
> 我希望只在带有 Kafka 标签的笔记中搜索，
> 快速缩小范围找到精准答案。

### Story 3: 智能上下文推荐

> 作为用户，当我正在写关于 Docker 部署的笔记时，
> 我希望侧边栏能自动推荐我之前写过的相关内容，
> 包括概念相似但关键词不同的笔记（如 Kubernetes 部署笔记）。

---

## 8. 技术约束

-   **Qdrant 版本要求**：>= 1.7.0（支持 Named Vectors 和 Query API）
-   **向量维度一致性**：三个 Named Vector 使用相同的 Embedding 模型，维度相同
-   **索引重建**：升级到 v0.4.0 后需要重新索引所有文件
