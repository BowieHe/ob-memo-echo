# Memo Echo (MemoEcho)

**Your AI Knowledge Assistant.**

Memo Echo is an AI-powered Obsidian plugin that acts as your "Second Brain's Voice". It automatically connects your thoughts and recalls relevant memories (notes) using vector search and semantic understanding.

> "Memo Echo" - The echo of your memories.

## Features

-   🗣️ **Recommendation View ("Deep Recall")**:
    -   As you type, it automatically analyzes your current paragraph.
    -   Instantly recommends relevant past notes based on semantic meaning, not just keywords.
    -   Helps you discover connections you might have forgotten.

-   🔍 **Semantic Search**: 
    -   Search your knowledge base by concept and meaning.
    -   Example: Search "how to build a website" and find notes about "HTML", "CSS", "Deployment" even if they don't contain the exact keywords.

-   🧠 **AI-Powered Metadata**:
    -   Automatically generates summaries, tags, and categories for your notes using LLMs (Ollama or OpenAI).

-   🔒 **Privacy First**: 
    -   Designed to work fully locally with Ollama and Qdrant.
    -   Your data stays on your machine unless you explicitly choose an online provider (like OpenAI).

## Prerequisites

1. **Ollama**: For running local AI models (Embeddings & Chat).
    - Install from: https://ollama.ai
    - Pull an embedding model: `ollama pull qwen3-embedding:4b` (or `bge-m3`)
    - Pull a chat model: `ollama pull qwen2.5` (or `llama3`)

2. **Qdrant**: High-performance Vector Database.
    - Run with Docker: `docker run -p 6333:6333 qdrant/qdrant`
    - Or install locally: https://qdrant.tech

## Installation

### Development Setup

1. **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/memo-echo.git
    cd memo-echo
    ```
    *(Note: The directory name doesn't affect functionality, you can rename `ob-image-vector` to `memo-echo`)*

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

## License

MIT
