# Memo Echo (MemoEcho)

**Your AI Knowledge Assistant.**

Memo Echo is an AI-powered Obsidian plugin that acts as your "Second Brain's Voice". It automatically connects your thoughts and recalls relevant memories (notes) using vector search and semantic understanding.

> "Memo Echo" - The echo of your memories.

## Features

- 🗣️ **Recommendation View ("Deep Recall")**:
    - As you type, it automatically analyzes your current paragraph.
    - Instantly recommends relevant past notes based on semantic meaning, not just keywords.
    - Helps you discover connections you might have forgotten.

- 🔍 **Semantic Search**:
    - Search your knowledge base by concept and meaning.
    - Example: Search "how to build a website" and find notes about "HTML", "CSS", "Deployment" even if they don't contain the exact keywords.

- 🧠 **AI-Powered Metadata**:
    - Automatically generates summaries, tags, and categories for your notes using LLMs (Ollama or OpenAI).

- 🔒 **Privacy First**:
    - Designed to work fully locally with Ollama and Qdrant.
    - Your data stays on your machine unless you explicitly choose an online provider (like OpenAI).

## Prerequisites

1. **Ollama**: For running local AI models (Embeddings & Chat).
    - Install from: https://ollama.ai
    - Pull an embedding model: `ollama pull qwen3-embedding:4b` (or `bge-m3`)
    - Pull a chat model: `ollama pull qwen2.5` (or `llama3`)

2. **Qdrant**: High-performance Vector Database.
    - Run with Docker: `docker run -d --name qdrant -p 6333:6333 -p 6334:6334 -v ~/.qdrant_storage:/qdrant/storage qdrant/qdrant:latest`
    - Or install locally: https://qdrant.tech

## Installation

### Development Setup

1. **Clone the repository**:

    ```bash
    git clone https://github.com/yourusername/memo-echo.git
    cd memo-echo
    ```

    _(Note: The directory name doesn't affect functionality, you can rename `ob-image-vector` to `memo-echo`)_

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Build the plugin**:

    ```bash
    npm run dev
    ```

4. **Install to Obsidian**:

    ```bash
    # Create plugin directory
    mkdir -p /path/to/vault/.obsidian/plugins/memo-echo

    # Copy files
    cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/memo-echo/
    ```

5. **Enable**:
    - Open Obsidian Settings -> Community Plugins -> Refresh
    - Enable **Memo Echo**.

## Usage

1. **Configure**:
    - Go to Settings -> **Memo Echo**.
    - Set up your Embedding Provider (Ollama/OpenAI).
    - Set up your AI Generation Provider (Ollama/OpenAI).

2. **Index**:
    - Open the Semantic Search sidebar (🔍 icon).
    - Click "Index Current File" or "Sync All Files".

3. **Experience**:
    - **Search**: Use the search sidebar to find semantic matches.
    - **Write**: Open the "Recommendation View" (🔗 icon). Start writing a note, and watch relevant memories appear automatically!

## Project Structure

```
memo-echo/
├── src/
│   ├── main.ts                      # Plugin entry point (MemoEchoPlugin)
│   ├── search-view.ts               # Semantic Search UI
│   ├── recommendation-view.ts       # Recommendation UI
│   ├── settings.ts                  # Settings tab
│   ├── services/
│   │   ├── embedding-service.ts     # Embedding generation
│   │   ├── vector-store.ts          # Qdrant client
│   │   ├── metadata-extractor.ts    # AI Summarization
│   │   └── paragraph-detector.ts    # Typing detection
│   └── __tests__/                   # Unit tests
├── styles.css                       # Plugin styles
├── manifest.json                    # Plugin manifest
└── package.json                     # Dependencies
```

- 插件总入口: src/main.ts
    - onload/onunload、服务初始化、视图注册、命令注册
- 设置页入口: src/settings.ts
    - 设置 UI、默认配置、设置读写、分组布局
- 向量数据库入口
    - 接口层: src/services/vector-backend.ts
    - Qdrant 实现: src/services/qdrant-backend.ts
    - 索引调度: src/services/vector-index-manager.ts
- Embedding 入口: src/services/embedding-service.ts
    - 本地 / Ollama / OpenAI 的 embedding 统一入口
- 概念提取与匹配入口
    - 概念提取: src/services/concept-extractor.ts
    - 概念注入/前置处理: src/services/frontmatter-service.ts
    - 关联引擎: src/services/association-engine.ts
    - 关联视图: src/association-view.ts
- 关联建议 UI 入口
    - 面板组件: src/components/AssociationPanel.tsx
- 索引与内容切分入口
    - 分块/切分: src/services/chunker.ts
    - 段落检测: src/services/paragraph-detector.ts
- 缓存/持久化入口
    - 概念缓存: src/services/concept-cache-service.ts
    - 内存缓存: src/services/memory-cache.ts
    - 持久化队列: src/services/persist-queue.ts
- 搜索/推荐 UI 入口
    - 搜索视图: src/search-view.ts
    - 推荐视图: src/recommendation-view.ts
- 样式入口: styles.css

## License

MIT
