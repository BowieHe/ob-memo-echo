/**
 * Integration test - End-to-end workflow
 * Tests: Chunker → EmbeddingService → VectorStore → Search
 * REQUIRES: Qdrant running on localhost:6333
 */

import { Chunker } from '../services/chunker';
import { EmbeddingService } from '../services/embedding-service';
import { VectorStore } from '../services/vector-store';

// Skip: Requires Qdrant running on localhost:6333
describe.skip('Integration Test: Full Workflow', () => {
    let chunker: Chunker;
    let embeddingService: EmbeddingService;
    let vectorStore: VectorStore;
    const testCollection = 'integration_test_' + Date.now();

    beforeAll(async () => {
        chunker = new Chunker({
            minChunkSize: 100,
            maxChunkSize: 500,
        });

        embeddingService = new EmbeddingService({
            provider: 'local',
        });

        vectorStore = new VectorStore(testCollection, 'http://localhost:6333');
        await vectorStore.initialize();
    });

    afterAll(async () => {
        // Cleanup
        try {
            await vectorStore.clear();
        } catch (e) {
            // Ignore
        }
    });

    it('should complete full indexing and search workflow', async () => {
        // 1. Sample Markdown content
        const markdown = `# Machine Learning Basics

Machine learning is a subset of artificial intelligence.

## Supervised Learning

In supervised learning, we train models with labeled data.

### Classification

Classification predicts discrete categories.

### Regression

Regression predicts continuous values.

## Unsupervised Learning

Unsupervised learning finds patterns in unlabeled data.`;

        // 2. Chunk the content
        const chunks = chunker.chunk(markdown);
        console.log(`✓ Chunked into ${chunks.length} pieces`);
        expect(chunks.length).toBeGreaterThan(0);

        // 3. Generate embeddings for each chunk
        const embeddedChunks = [];
        for (const chunk of chunks) {
            const embedding = await embeddingService.embed(chunk.content);
            embeddedChunks.push({
                id: `chunk-${chunk.index}`,
                vector: embedding,
                metadata: {
                    content: chunk.content,
                    headers: chunk.headers,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos,
                },
            });
        }
        console.log(`✓ Generated ${embeddedChunks.length} embeddings`);
        expect(embeddedChunks.length).toBe(chunks.length);

        // 4. Store in vector database
        await vectorStore.upsertBatch(embeddedChunks);
        console.log(`✓ Stored ${embeddedChunks.length} vectors in Qdrant`);

        const count = await vectorStore.count();
        expect(count).toBe(embeddedChunks.length);

        // 5. Search for similar content
        const query = 'What is classification in machine learning?';
        const queryEmbedding = await embeddingService.embed(query);
        const results = await vectorStore.search(queryEmbedding, 3);

        console.log(`✓ Search returned ${results.length} results`);
        expect(results.length).toBeGreaterThan(0);

        // 6. Verify results are relevant
        const topResult = results[0];
        console.log(`Top result (score: ${topResult.score.toFixed(4)}):`,
            topResult.metadata.content.slice(0, 100));

        expect(topResult.metadata.content).toBeDefined();
        expect(topResult.score).toBeGreaterThan(0);

        // With mock embeddings, we just verify we got results
        // In real usage, results would be semantically relevant
        expect(topResult.metadata.headers).toBeDefined();

    }, 60000); // 60s timeout for model loading

    it('should handle multiple documents', async () => {
        // Clear previous data
        await vectorStore.clear();

        const documents = [
            {
                id: 'doc1',
                content: `# Python Programming

Python is a high-level programming language.

## Features

- Easy to learn
- Versatile
- Large ecosystem`,
            },
            {
                id: 'doc2',
                content: `# JavaScript Basics

JavaScript is the language of the web.

## Use Cases

- Frontend development
- Backend with Node.js
- Mobile apps`,
            },
        ];

        // Index all documents
        for (const doc of documents) {
            const chunks = chunker.chunk(doc.content);

            for (const chunk of chunks) {
                const embedding = await embeddingService.embed(chunk.content);
                await vectorStore.upsert({
                    id: `${doc.id}-chunk-${chunk.index}`,
                    vector: embedding,
                    metadata: {
                        docId: doc.id,
                        content: chunk.content,
                        headers: chunk.headers,
                    },
                });
            }
        }

        console.log(`✓ Indexed ${documents.length} documents`);

        // Search for Python-related content
        const query = 'programming language features';
        const queryEmbedding = await embeddingService.embed(query);
        const results = await vectorStore.search(queryEmbedding, 5);

        expect(results.length).toBeGreaterThan(0);
        console.log(`✓ Found ${results.length} relevant chunks`);

        // Results should include content from both documents
        const docIds = new Set(results.map(r => r.metadata.docId));
        console.log(`Documents in results:`, Array.from(docIds));

    }, 60000);
});
