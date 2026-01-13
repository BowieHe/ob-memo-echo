# Obsidian AI 神经中枢 (Core) 产品需求文档 (PRD)

## 1. 项目概述

本项目是为 Obsidian 开发的高性能、私有化语义搜索引擎。它初期作为一个通用的 RAG（检索增强生成）系统，通过对笔记内容的深度语义建模，实现比全文搜索更“聪明”的模糊搜索。其核心特色是通过“上下文代理”技术，将搜索能力延申至笔记中的图片资产。

## 2. 核心技术栈

-   **语言**: Rust (高效、并发安全、二进制体积适中)
-   **向量生成 (Embedding)**: Ollama - `qwen3-embedding:4b` (2560 维高精度向量)
-   **向量数据库 (Vector DB)**: Qdrant (高性能、支持 HNSW 索引、本地部署)
-   **架构模式**: 独立 Library Crate (`lib.rs`) + 二进制 CLI (`main.rs`)

## 2.5 系统架构与职责划分

### 2.5.1 整体架构

本项目采用 **前后端分离** 架构，实现关注点分离和性能最优化：

```
┌─────────────────────────────────────────────────────────────┐
│  Obsidian Plugin (TypeScript)  - 前端                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • UI 渲染 (搜索框、结果列表)                            │  │
│  │  • 用户交互 (点击、键盘事件)                             │  │
│  │  │  • Vault 文件系统扫描                                │  │
│  │  • Markdown 语法解析 (识别图片链接)                      │  │
│  └──────────────────┬────────────────────────────────────┘  │
└─────────────────────┼────────────────────────────────────────┘
                      │ IPC (进程间通信)
                      │  • HTTP REST API (推荐)
                      │  • CLI stdio (备选)
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  Rust Core Engine - 后端                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • 文本切分 (Markdown-aware Chunking)                   │  │
│  │  • Embedding 生成 (调用 Ollama API)                     │  │
│  │  • 向量存储 (Qdrant 交互)                                │  │
│  │  • 语义搜索 (向量相似度计算)                             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │                           │
          ↓                           ↓
  ┌─────────────┐           ┌──────────────┐
  │   Ollama    │           │   Qdrant     │
  │  (Embedding)│           │ (Vector DB)  │
  └─────────────┘           └──────────────┘
```

### 2.5.2 职责边界

| 组件                  | 职责                                                                      | 不负责                                            |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| **TypeScript Plugin** | • 监听用户输入<br>• 扫描 Vault 文件<br>• 提取图片前后文<br>• 渲染搜索结果 | ❌ 向量计算<br>❌ 数据库操作<br>❌ 重计算任务     |
| **Rust Core**         | • 高性能切分逻辑<br>• 批量 Embedding<br>• 向量数据库 CRUD<br>• 相似度排序 | ❌ UI 渲染<br>❌ Obsidian API 调用<br>❌ 用户交互 |

### 2.5.3 通信协议 (IPC)

**推荐方案：HTTP REST API**

Rust 使用 `axum` 提供本地 HTTP 服务 (如 `http://localhost:37337`)。

```typescript
// TypeScript 端调用示例
interface IndexRequest {
    path: string;
    content: string;
    point_type: "text" | "image";
}

interface SearchRequest {
    query: string;
    limit: number;
}

// 索引笔记
await fetch("http://localhost:37337/api/index", {
    method: "POST",
    body: JSON.stringify({
        path: "/vault/note.md",
        content: "笔记内容...",
        point_type: "text",
    }),
});

// 搜索
const results = await fetch("http://localhost:37337/api/search", {
    method: "POST",
    body: JSON.stringify({
        query: "埃菲尔铁塔",
        limit: 10,
    }),
}).then((r) => r.json());
```

**备选方案：CLI + stdio**

适用于不想启动常驻进程的场景。通过 `child_process.spawn` 调用 Rust 二进制：

```typescript
import { spawn } from "child_process";

const rust = spawn("./core/target/release/ob-image-vector-rs", [
    "search",
    "埃菲尔铁塔",
]);
rust.stdout.on("data", (data) => {
    const results = JSON.parse(data.toString());
    // 处理结果
});
```

### 2.5.4 部署模型

1.  **开发阶段**：

    -   Rust 以 `cargo run` 方式启动 HTTP 服务。
    -   TypeScript 通过 `localhost` 调用。

2.  **发布阶段**：

    -   将编译好的 Rust 二进制 (`ob-image-vector-rs`) 打包进 Obsidian 插件目录。
    -   插件启动时自动 `spawn` 该进程，退出时 `kill`。

3.  **未来演进 (可选)**：
    -   将 Rust 编译为 **WebAssembly (WASM)**，直接在 Electron 进程内运行，消除 IPC 开销。

### 2.5.5 数据流示例

**场景：用户搜索"埃菲尔铁塔"**

1.  用户在 Obsidian 搜索框输入 → TypeScript 捕获事件。
2.  TypeScript 发送 `POST /api/search` 到 Rust 服务。
3.  Rust 调用 Ollama 将查询转换为向量。
4.  Rust 在 Qdrant 中执行向量相似度搜索。
5.  Rust 返回 JSON 结果（包含文件路径、分数）。
6.  TypeScript 解析结果，渲染预览窗口。

### 2.5.6 性能优化策略

-   **批量索引**：TypeScript 扫描到多个文件时，批量发送给 Rust，减少往返次数。
-   **增量更新**：仅对修改过的笔记重新索引，而非全量重建。
-   **缓存机制**：Rust 端缓存最近的查询向量，避免重复调用 Ollama。

## 3. 功能需求

### 3.1 通用语义检索 (Universal RAG)

-   **文本切分策略 (Chunking Strategy)**:
    -   **默认方案**: 采用 **Markdown 结构化切分 (Markdown-aware Chunking)**。利用 AST 解析笔记结构，优先按 H1/H2 标题进行语义分块，保留父级标题作为上下文路径。
    -   **长度控制**: 目标切片长度控制在 **500-800 字符** (中文)，以平衡 Embedding 模型的语义密度与包含的信息量。使用 **递归字符切分** 作为兜底策略，处理超长段落。
-   **语义索引**: 使用 Qwen 模型将文本块转换为 2560 维向量并存入 Qdrant。
-   **自然语言搜索**: 用户输入非关键词的描述（如“关于去年旅行的感悟”），系统返回语义最接近的笔记片段。

### 3.2 图片上下文代理搜索 (Context-based Image Discovery)

-   **自动锚点识别**: 识别笔记中的 `![[image.png]]` 或 `![](path/to/img)` 语法。
-   **语境提取**: 自动提取图片前后 N 个字符或当前标题下的所有文字作为该图片的“代理描述”。
-   **多模态关联**: 在向量数据库中，将上述语境向量直接关联到图片文件路径。
-   **结果呈现**: 搜索结果中若命中图片语境，系统需提供图片预览能力。

## 4. 关键技术特性

### 4.1 高维向量处理 (2560 Dims)

-   **精度优势**: 使用 2560 维向量捕获极细微的语义差别，支持更复杂的语义查询。
-   **性能优化**: 依托 Qdrant 的 HNSW 索引实现 $O(\log N)$ 级别的检索速度。
-   **内存估算**: 每万个索引点占用约 100MB 磁盘/内存空间，完全适配个人电脑资源。

### 4.2 智能切分与模型适配

-   **黄金语义区间**: 尽管模型支持长上下文，但为了检索精度，强制将 Context 限制在模型的“高注意力”区间（512 tokens 以内），避免长文本导致的语义稀释。

### 4.3 统一数据模型

数据库中的每个点 (`Point`) 包含以下元数据：

-   `path`: 对应文件路径（`.md` 或 `.jpg/.png`）。
-   `content`: 原始文本片段或图片的语境片段。
-   `point_type`: 标识是 `text`（纯笔记内容）还是 `image`（图片代理语境）。
-   `score`: 向量相似度得分。

## 5. 演进路线图

1. **阶段 1**: 全量笔记语义检索 (基础 RAG)。实现 Markdown 结构化切分器。
2. **阶段 2**: 图片上下文语境增强 (Image Proxy)。
3. **阶段 3 (高级特性)**: **LLM 语义增强 (Agentic Indexing)**。
    - 引入 1.5B 级别的端侧小模型 (如 `Qwen2.5-1.5B`)。
    - 对切分后的片段生成“一句话摘要”或“潜在问题”。
    - 将摘要向量化作为索引，大幅提升复杂查询的召回率 (需作为可选功能，考虑硬件压力)。
4. **阶段 4**: 视觉特征提取 (Vision-to-Text Integration) - 引入 `moondream` 等模型进行像素级自动标签生成。

## 6. 测试策略与 TDD (Test Driven Development)

### 6.1 测试层次

-   **单元测试 (Unit Tests)**:
    -   位于 `src/*.rs` 底部模块 `mod tests`。
    -   标记为 `#[cfg(test)]`。
    -   核心关注：Embedding 生成逻辑、字符串切分准确性、路径解析等。
-   **集成测试 (Integration Tests)**:
    -   位于 `tests/*.rs` 独立文件。
    -   核心关注：Rust 核心与 Ollama/Qdrant 服务的端到端协作、搜索召回率验证。

### 6.2 测试规范 (TDD 流程)

1. **Red**: 编写一个失败的测试案例（例如搜索一个已索引的复杂短语，预期返回特定路径）。
2. **Green**: 编写实现代码使测试通过。
3. **Refactor**: 优化代码结构，确保高性能的高维向量搬运。

## 7. 质量指标

-   **检索速度**: 本地 5 万条数据下，单次查询延迟 < 50ms。
-   **资源占用**: 闲置时 CPU 占用 < 1%，内存波动符合本地模型运行预期。
-   **正确性**: 搜索结果的相关性需显著优于 Obsidian 原生的关键词过滤。
