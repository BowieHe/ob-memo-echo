# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memo Echo is an AI-powered Obsidian plugin that acts as a "Second Brain's Voice". It provides semantic search and real-time recommendations by connecting your thoughts using vector search and semantic understanding. The plugin is privacy-focused and designed to work fully locally with Ollama and Qdrant/LanceDB.

## Development Commands

### Build Commands
- `npm run dev` - Development build with watch mode (esbuild)
- `npm run build` - Production build (TypeScript check + esbuild)
- `npm run version` - Version bump utility (updates manifest.json and versions.json)

### Testing Commands
- `npm test` - Run Jest tests
- `npm run test:watch` - Watch mode for tests
- `npm run test:coverage` - Generate coverage report
- `npm run test:manual` - Manual embedding test (tsx src/test-embedding.ts)

### Installation Commands
- `./install-plugin.sh` - Unix installation script
- `./install-to-windows.sh` - WSL to Windows installation script
- Manual installation: Copy `main.js`, `manifest.json`, `styles.css` to Obsidian plugins directory

## Architecture Overview

### Core Plugin Structure
- **Entry Point**: `src/main.ts` - MemoEchoPlugin class initializes all services and registers views
- **Views**:
  - `search-view.ts` - Semantic search UI (VIEW_TYPE_SEMANTIC_SEARCH)
  - `recommendation-view.ts` - Real-time recommendation UI (VIEW_TYPE_RECOMMENDATION)
  - `settings.ts` - Plugin settings tab with extensive configuration
- **Services** (`src/services/`):
  - `vector-backend.ts` - Abstract interface for vector storage (Qdrant/LanceDB)
  - `embedding-service.ts` - Supports local, Ollama, and OpenAI embeddings
  - `vector-index-manager.ts` - Orchestrates indexing with caching and persistence
  - `chunker.ts` - Splits content into manageable chunks
  - `metadata-extractor.ts` - AI-powered metadata generation
  - `concept-extractor.ts` - Extracts key concepts for graph connections (v0.5.0)
  - `frontmatter-service.ts` - Manages frontmatter injection (v0.5.0)
  - `persist-queue.ts` - Batch processing for vector storage
  - `memory-cache.ts` - In-memory caching layer
  - `paragraph-detector.ts` - Detects typing for real-time recommendations

### Key Architectural Patterns

#### Multi-Backend Vector Storage
- **VectorBackend Interface**: Abstract interface in `vector-backend.ts` with named vectors support
- **Named Vectors**: Three vector types: `content_vec`, `summary_vec`, `title_vec` with RRF fusion
- **Backend Implementations**:
  - `qdrant-backend.ts` - Qdrant with native named vectors support
  - `lancedb-backend.ts` - LanceDB with three-table architecture (embedded, zero-config)

#### Caching and Performance
- **Memory Cache**: `memory-cache.ts` for in-memory caching
- **Persist Queue**: `persist-queue.ts` for batch processing to vector storage
- **Incremental Indexing**: Based on file modification times and `me_indexed_at` frontmatter

#### v0.5.0 Graph Integration Features
- **Concept Extraction**: AI-powered concept extraction for graph connections
- **Frontmatter Injection**: Automatic injection of `me_concepts` and `me_indexed_at` fields
- **Concept Pages**: Auto-creation of `_me/` concept pages for Obsidian graph visualization

### Data Flow
1. **Indexing**: File → Chunker → EmbeddingService → VectorBackend (with metadata)
2. **Search**: Query → EmbeddingService → VectorBackend.searchWithFusion() → Results
3. **Recommendations**: Paragraph detection → Embedding → Search → Real-time display
4. **Graph Integration**: Indexing → Concept extraction → Frontmatter injection → Concept pages

## Development Guidelines

### Test-Driven Development (from .cursorrules)
- **STRICT TDD WORKFLOW**: Red → Green → Refactor
- Write unit tests FIRST before implementation code
- Do not write implementation without existing or accompanying tests

### Safe Command Execution (from .cursorrules)
- **Auto-run allowed**: All `npm` commands (`npm install`, `npm run`, `npm test`)
- **Protected operations**: Do NOT auto-run `rm -rf` or any destructive file system commands
- **Git operations**: Do NOT auto-run any `git` commands (commit, push, checkout, etc.)

### TypeScript Configuration
- Target: ES6, Module: ESNext
- JSX support for React components
- Strict type checking enabled

### Build Configuration
- **Bundler**: esbuild (configured in `esbuild.config.mjs`)
- **Output**: Single `main.js` file for Obsidian plugin
- **Styles**: Separate `styles.css` file

## Prerequisites & Dependencies

### External Services
- **Ollama**: Required for local AI models (embedding and chat)
- **Qdrant**: Vector database (can use Docker: `docker run -p 6333:6333 qdrant/qdrant`)
- **LanceDB**: Alternative embedded vector database (zero-config)

### Key Dependencies
- **Obsidian API**: Plugin framework
- **React**: UI components (with JSX support)
- **@qdrant/js-client-rest**: Qdrant client
- **@xenova/transformers**: Local embeddings
- **Jest**: Testing framework with jsdom environment

## Settings Configuration

The plugin has extensive settings in `src/settings.ts`:
- **Embedding Providers**: local, Ollama, OpenAI
- **AI Generation Providers**: Ollama, OpenAI
- **Vector Database**: Qdrant URL/collection or LanceDB path
- **Concept Extraction**: ollama, openai, or rules-based
- **Frontmatter Injection**: Enable/disable graph integration
- **Incremental Indexing**: Based on file modification times

## Testing Strategy

- **Unit Tests**: `src/__tests__/` directory with Jest
- **Mock External Dependencies**: Ollama, Qdrant, OpenAI APIs mocked
- **Test Coverage**: Aim for comprehensive coverage of services
- **Manual Testing**: `npm run test:manual` for embedding verification

## Versioning

- **Manifest**: `manifest.json` contains plugin version
- **Version Bump**: `npm run version` updates manifest and versions.json
- **PRD Documents**: `PRD/` directory contains version-specific requirements

## Important Notes

- This is an **Obsidian plugin** - output must be compatible with Obsidian's plugin system
- **Privacy-focused**: Default configuration works fully locally
- **Multi-backend**: Support both Qdrant (requires service) and LanceDB (embedded)
- **Graph Integration**: v0.5.0 adds concept extraction and frontmatter injection for Obsidian graph
- **Named Vectors**: Uses three vector types with RRF fusion for improved search quality