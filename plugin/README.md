# Obsidian Semantic Search Plugin

AI-powered semantic search plugin for Obsidian, using a local Rust backend with Ollama embeddings.

## Features

-   🔍 **Semantic Search**: Search your notes by meaning, not just keywords
-   🖼️ **Image Context Search**: Find images by searching their surrounding text
-   🚀 **High Performance**: Powered by Rust backend with 2560-dim embeddings
-   🔒 **Privacy First**: All processing happens locally on your machine

## Prerequisites

1. **Rust Backend**: The core search engine (see `../core/`)
2. **Ollama**: For generating embeddings
3. **Qdrant**: Vector database

## Installation

### Development Setup

1. Clone this repository
2. Navigate to the plugin directory:

    ```bash
    cd plugin
    ```

3. Install dependencies:

    ```bash
    npm install
    ```

4. Build the plugin:

    ```bash
    npm run dev
    ```

5. Copy the built files to your Obsidian vault:

    ```bash
    # Create plugin directory in your vault
    mkdir -p /path/to/your/vault/.obsidian/plugins/obsidian-semantic-search

    # Copy files
    cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/obsidian-semantic-search/
    ```

6. Enable the plugin in Obsidian Settings → Community Plugins

### Starting the Backend

Before using the plugin, start the Rust backend:

```bash
cd ../core
cargo run --release
```

The backend will run on `http://localhost:37337`

## Usage

1. **Open Search View**: Click the search icon in the ribbon or use the command palette
2. **Search**: Type your query in the search box
3. **View Results**: Click on any result to open the file

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

## Project Structure

```
plugin/
├── src/
│   ├── main.ts          # Plugin entry point
│   ├── api-client.ts    # Rust API client
│   └── search-view.ts   # Search UI component
├── styles.css           # Plugin styles
├── manifest.json        # Plugin manifest
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript config
```

## Troubleshooting

### Plugin loads but search doesn't work

Make sure the Rust backend is running:

```bash
cd ../core
cargo run --release
```

Check the service status using the command: "检查搜索服务状态"

### No results found

You need to index your notes first. The indexing feature will be added in a future update. For now, you can manually index using the API:

```bash
curl -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/your/note.md",
    "content": "Your note content...",
    "point_type": "text"
  }'
```

## Roadmap

-   [ ] Automatic vault indexing
-   [ ] Incremental updates on file changes
-   [ ] Context-based recommendations
-   [ ] Advanced filtering options
-   [ ] Settings page

## License

MIT
