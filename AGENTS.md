# AGENTS.md - Memo Echo Plugin

This file provides essential information for AI agents working on the Memo Echo Obsidian plugin.

## Project Overview

Memo Echo is an AI-powered Obsidian plugin that provides semantic search and real-time recommendations. It's privacy-focused and works fully locally with Ollama and Qdrant/LanceDB.

## Build & Development Commands

### Build Commands
- `npm run dev` - Development build with watch mode (esbuild)
- `npm run build` - Production build (TypeScript check + esbuild)
- `npm run version` - Version bump utility (updates manifest.json and versions.json)

### Testing Commands
- `npm test` - Run all Jest tests
- `npm run test:watch` - Watch mode for tests
- `npm run test:coverage` - Generate coverage report
- `npm run test:manual` - Manual embedding test (tsx src/test-embedding.ts)
- `npx jest src/path/to/test.test.ts` - Run single test file
- `npx jest --testNamePattern="test name"` - Run specific test by name

### Installation Commands
- `./install-plugin.sh` - Unix installation script
- `./install-to-windows.sh` - WSL to Windows installation script

## Development Guidelines

### Test-Driven Development (TDD)
**STRICT TDD WORKFLOW REQUIRED:**
1. **Red**: Write unit test FIRST before implementation
2. **Green**: Write minimal business logic to pass test
3. **Refactor**: Optimize code while keeping tests passing

**DO NOT** write implementation code without existing or accompanying tests.

### Safe Command Execution
- **Auto-run allowed**: All `npm` commands (`npm install`, `npm run`, `npm test`)
- **Protected operations**: Do NOT auto-run `rm -rf` or any destructive file system commands
- **Git operations**: Do NOT auto-run any `git` commands (commit, push, checkout, etc.)

## TypeScript Configuration

- **Target**: ES6
- **Module**: ESNext
- **JSX**: React support enabled
- **Strict mode**: Enabled (strictNullChecks, noImplicitAny)
- **Module resolution**: Node
- **Source maps**: Inline source maps enabled

## Code Style Guidelines

### Imports
```typescript
// External dependencies first
import { Plugin, MarkdownView } from 'obsidian';
import { useState, useEffect } from 'react';

// Internal imports grouped by type
import { SemanticSearchView } from './search-view';
import { EmbeddingService } from './services/embedding-service';
import { VectorBackend } from './services/vector-backend';
```

### Naming Conventions
- **Classes**: PascalCase (`EmbeddingService`, `VectorIndexManager`)
- **Interfaces/Types**: PascalCase (`EmbeddingConfig`, `SearchResult`)
- **Variables/Functions**: camelCase (`embeddingService`, `getEmbeddings`)
- **Constants**: UPPER_SNAKE_CASE (`VECTOR_NAMES`, `DEFAULT_SETTINGS`)
- **Private members**: camelCase with underscore prefix optional (`private _config`, `private isInitialized`)

### TypeScript Best Practices
- Use explicit return types for public methods
- Use interfaces over type aliases for object shapes
- Prefer `readonly` for immutable properties
- Use `Record<string, any>` for flexible metadata objects
- Use `as const` for literal type assertions

### Error Handling
- Use try/catch for async operations
- Throw specific error types when appropriate
- Log errors with context using `console.error`
- Return structured error results for batch operations

### File Organization
- **Services**: `src/services/` - Business logic and data access
- **Views**: `src/*-view.ts` - UI components (React + Obsidian)
- **Tests**: `src/__tests__/` - Unit tests with Jest
- **Mocks**: `src/__mocks__/` - External dependency mocks

### React Components (JSX)
- Use functional components with hooks
- Type props with TypeScript interfaces
- Keep components focused and composable
- Use Obsidian's React integration properly

## Architecture Patterns

### Multi-Backend Vector Storage
- **VectorBackend Interface**: Abstract interface in `vector-backend.ts`
- **Named Vectors**: Three vector types: `content_vec`, `summary_vec`, `title_vec` with RRF fusion
- **Backend Implementations**: `qdrant-backend.ts` and `lancedb-backend.ts`

### Caching and Performance
- **Memory Cache**: `memory-cache.ts` for in-memory caching
- **Persist Queue**: `persist-queue.ts` for batch processing
- **Incremental Indexing**: Based on file modification times

### v0.5.0 Graph Integration
- **Concept Extraction**: AI-powered concept extraction for graph connections
- **Frontmatter Injection**: Automatic injection of `me_concepts` and `me_indexed_at` fields
- **Concept Pages**: Auto-creation of `_me/` concept pages

## Testing Strategy

### Jest Configuration
- **Environment**: jsdom for React components
- **Test matching**: `**/__tests__/**/*.test.{ts,tsx}`
- **Coverage**: Collected from `src/**/*.{ts,tsx}` excluding tests and type definitions
- **Mocks**: External dependencies mocked in `src/__mocks__/`

### Test Structure
```typescript
describe('ClassName', () => {
    beforeEach(() => {
        // Setup
    });

    afterEach(() => {
        // Cleanup
    });

    it('should do something', () => {
        // Arrange
        // Act
        // Assert
    });

    describe('specific behavior', () => {
        it('should handle edge case', () => {
            // Test
        });
    });
});
```

### Mocking Guidelines
- Mock external APIs (Ollama, Qdrant, OpenAI)
- Mock Obsidian API for plugin testing
- Use Jest's mocking capabilities appropriately

## Important Notes

### Obsidian Plugin Constraints
- Output must be compatible with Obsidian's plugin system
- Single `main.js` file output via esbuild
- Separate `styles.css` for styling
- Follow Obsidian's plugin manifest format

### Privacy Focus
- Default configuration works fully locally
- Support both Qdrant (requires service) and LanceDB (embedded)
- Local embedding generation with Transformers.js

### Version Compatibility
- Check `manifest.json` for plugin version
- Review PRD documents in `PRD/` directory for version-specific features
- Use `npm run version` for version bumps

## External Dependencies

### Required Services
- **Ollama**: Local AI models (embedding and chat)
- **Qdrant**: Vector database (Docker: `docker run -p 6333:6333 qdrant/qdrant`)
- **LanceDB**: Alternative embedded vector database

### Key Dependencies
- **Obsidian API**: Plugin framework
- **React**: UI components
- **@qdrant/js-client-rest**: Qdrant client
- **@xenova/transformers**: Local embeddings
- **Jest**: Testing framework

## Quality Assurance

### Before Committing
1. Run `npm test` to ensure all tests pass
2. Run `npm run build` to verify TypeScript compilation
3. Check test coverage with `npm run test:coverage`

### Code Review Checklist
- [ ] TDD workflow followed (tests written first)
- [ ] TypeScript types are correct and strict
- [ ] Error handling is appropriate
- [ ] No console.log statements in production code
- [ ] Code follows established patterns
- [ ] Tests cover edge cases
- [ ] Documentation is updated if needed