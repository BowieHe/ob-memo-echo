# Obsidian Memo Echo - PRD v0.5.0

## 版本信息

- **版本**: 0.5.0
- **代号**: "图谱增强" (Graph-Enhanced)
- **状态**: Draft
- **前置版本**: v0.4.0 (Multi-Dimensional Search)

---

## 1. 核心目标

v0.4.0 实现了多维向量检索。v0.5.0 将：

1. **双后端支持**：Qdrant / LanceDB 可切换，让用户无需 Docker 也能使用
2. **Frontmatter 概念注入**：在笔记头部写入 AI 提取的概念，用户可见
3. **Graph View 集成**：通过概念页实现笔记间可视化连接
4. **增量索引**：基于文件修改时间智能判断是否需要重新索引

---

## 2. 技术设计

### 2.1 向量后端抽象

```typescript
interface VectorBackend {
    upsertMultiVector(item: MultiVectorItem): Promise<void>;
    searchWithFusion(
        query: number[],
        options?: SearchOptions,
    ): Promise<SearchResult[]>;
    delete(id: string): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;
    count(): Promise<number>;
}
```

| 实现           | 文件                 | 特点                                 |
| -------------- | -------------------- | ------------------------------------ |
| QdrantBackend  | `qdrant-backend.ts`  | Named Vectors 原生支持，需要服务     |
| LanceDBBackend | `lancedb-backend.ts` | 嵌入式零配置，三表模拟 Named Vectors |

### 2.2 LanceDB 三表架构

```
.memo-echo/vectors/
├── content_vectors.lance   # 原文 embedding
├── summary_vectors.lance   # 摘要 embedding
└── title_vectors.lance     # 标题 embedding
```

RRF 融合搜索在客户端实现，效果与 Qdrant 一致。

### 2.3 Frontmatter 结构

```yaml
---
me_concepts:
    - "[[_me/Docker]]"
    - "[[_me/容器化]]"
me_indexed_at: 2026-01-25T14:00:00
---
```

| 字段            | 类型     | 说明                    |
| --------------- | -------- | ----------------------- |
| `me_concepts`   | string[] | Wikilink 格式的概念列表 |
| `me_indexed_at` | ISO8601  | 最后索引时间戳          |

### 2.4 概念页自动创建

首次遇到新概念时，创建 `_me/Docker.md`：

```markdown
---
type: me-concept
auto_generated: true
---

# Docker

_由 Memo Echo 自动创建_
```

Obsidian 反向链接面板自动显示所有引用此概念的笔记。

---

## 3. 增量索引

```typescript
async needsReindex(file: TFile): Promise<boolean> {
    const cache = this.app.metadataCache.getFileCache(file);
    const indexedAt = cache?.frontmatter?.me_indexed_at;

    if (!indexedAt) return true;
    return file.stat.mtime > new Date(indexedAt).getTime();
}
```

---

## 4. 设置项

```typescript
interface MemoEchoSettings {
    // v0.4.0 设置保留...

    // v0.5.0 新增
    vectorBackend: "qdrant" | "lancedb";
    qdrantUrl: string; // 默认 http://localhost:6333
    lancedbPath: string; // 默认 .memo-echo/vectors

    injectConcepts: boolean; // 是否注入概念到 frontmatter
    conceptLinkFormat: "wikilink" | "plain";
    createConceptPages: boolean; // 是否自动创建概念页
    conceptPageFolder: string; // 默认 "_me"
}
```

---

## 5. 实现阶段

### Phase 1: 向量后端抽象

- 定义 `VectorBackend` 接口
- 重构 `vector-store.ts` → `qdrant-backend.ts`
- 新建 `lancedb-backend.ts`
- 设置页后端切换 UI

### Phase 2: Frontmatter 概念注入

- `frontmatter-service.ts`：安全读写 frontmatter
- 概念提取 + 注入流程
- 增量索引逻辑

### Phase 3: 概念页 + 清理

- 概念页自动创建
- 设置页 **[一键清除所有 me_* 字段]** 按钮

---

## 6. User Stories

### Story 1: 零配置使用

> 作为用户，我希望安装插件后直接可用，
> 不需要安装 Docker 或启动任何服务。

### Story 2: 概念可见性

> 作为用户，我希望能看到插件给我的笔记打了什么标签，
> 而不是完全黑盒操作。

### Story 3: Graph 可视化

> 作为用户，我希望在 Obsidian Graph View 中
> 看到我的笔记通过共同概念连接在一起。

### Story 4: 可撤销

> 作为用户，我希望随时可以清除插件添加的所有元数据，
> 恢复笔记原状。

---

## 7. 技术约束

- **LanceDB 版本**：使用 `@lancedb/lancedb` npm 包
- **Obsidian API**：使用 `app.fileManager.processFrontMatter()` 安全操作 frontmatter
- **向迁移**：从 v0.4.0 升级需要选择后端并重建索引
