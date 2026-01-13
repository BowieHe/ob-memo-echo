# Obsidian Semantic Search Plugin

AI-powered semantic search plugin for Obsidian, using TypeScript with Ollama embeddings and Qdrant vector database.

## Features

-   🔍 **Semantic Search**: Search your notes by meaning, not just keywords
-   🖼️ **Image Context Search**: Find images by searching their surrounding text (coming soon)
-   🚀 **High Performance**: Powered by Qdrant vector database with Ollama embeddings
-   🔒 **Privacy First**: All processing happens locally on your machine
-   📦 **Pure TypeScript**: No binary dependencies, works on all platforms

## Prerequisites

1. **Ollama**: For generating embeddings

    - Install from: https://ollama.ai
    - Pull the embedding model: `ollama pull qwen3-embedding:4b`

2. **Qdrant**: Vector database
    - Run with Docker: `docker run -p 6333:6333 qdrant/qdrant`
    - Or install locally: https://qdrant.tech/documentation/quick-start/

## Installation

### Development Setup

1. Clone this repository:

    ```bash
    git clone <your-repo-url>
    cd ob-image-vector
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Build the plugin:

    ```bash
    npm run dev
    ```

4. Copy the built files to your Obsidian vault:

    ```bash
    # Create plugin directory in your vault
    mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-image-vector

    # Copy files
    cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsidian-image-vector/
    ```

5. Enable the plugin in Obsidian Settings → Community Plugins

### Starting Required Services

Before using the plugin, make sure both services are running:

1. **Start Qdrant**:

    ```bash
    docker run -p 6333:6333 qdrant/qdrant
    ```

2. **Start Ollama** (if not already running):
    ```bash
    ollama serve
    ```

## Usage

1. **Open Search View**: Click the search icon in the ribbon or use the command palette
2. **Index Files**: Click the "📑" button to index the current file
3. **Search**: Type your query in the search box
4. **View Results**: Click on any result to open the file

## Development

### Watch Mode

```bash
npm run dev
```

This will watch for file changes and rebuild automatically.

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm test
```

## Project Structure

```
ob-image-vector/
├── src/
│   ├── main.ts                      # Plugin entry point
│   ├── search-view.ts               # Search UI component
│   ├── settings.ts                  # Settings tab
│   ├── services/
│   │   ├── embedding-service.ts     # Ollama embedding client
│   │   ├── vector-store.ts          # Qdrant vector database client
│   │   └── chunker.ts               # Markdown chunking logic
│   └── __tests__/                   # Test files
├── styles.css                       # Plugin styles
├── manifest.json                    # Plugin manifest
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
└── esbuild.config.mjs               # Build configuration
```

## Troubleshooting

### Plugin loads but search doesn't work

Make sure both services are running:

1. **Qdrant**:

    ```bash
    docker run -p 6333:6333 qdrant/qdrant
    ```

2. **Ollama**:
    ```bash
    ollama serve
    ```

Check the service status by clicking the refresh button (🔄) in the search view.

### No results found

You need to index your notes first. Click the "📑" button in the search view to index the current file.

### Build errors

Make sure you have the correct Node.js version:

```bash
node --version  # Should be v16 or higher
```

## Roadmap

-   [x] Basic semantic search
-   [x] Manual file indexing
-   [x] Markdown chunking with header context
-   [ ] Automatic vault indexing
-   [ ] Incremental updates on file changes
-   [ ] Image context search
-   [ ] Context-based recommendations
-   [ ] Advanced filtering options
-   [ ] Configurable settings (Ollama URL, model, etc.)

## Architecture

This plugin uses a pure TypeScript architecture:

-   **Embedding Service**: Connects to Ollama API to generate embeddings for text chunks
-   **Vector Store**: Manages Qdrant vector database for storing and searching embeddings
-   **Chunker**: Intelligently splits Markdown documents into semantic chunks with header context
-   **Search View**: Provides the UI for searching and displaying results

## License

MIT
