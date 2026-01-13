/**
 * Manual test script for EmbeddingService
 * Run with: npm run test:manual
 */

import { EmbeddingService } from './services/embedding-service';

async function testLocalEmbedding() {
    console.log('🧪 Testing Local Embedding (Transformers.js)...\n');

    const service = new EmbeddingService({
        provider: 'local',
    });

    try {
        console.log('📥 Generating embedding for "Hello, world!"...');
        const start = Date.now();

        const embedding = await service.embed('Hello, world!');

        const duration = Date.now() - start;

        console.log(`✅ Success! Generated embedding in ${duration}ms`);
        console.log(`📊 Embedding dimensions: ${embedding.length}`);
        console.log(`📈 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

        // Test batch
        console.log('\n📥 Testing batch embeddings...');
        const texts = ['Text 1', 'Text 2', 'Text 3'];
        const batchStart = Date.now();

        const embeddings = await service.embedBatch(texts);

        const batchDuration = Date.now() - batchStart;
        console.log(`✅ Batch success! Generated ${(embeddings as number[][]).length} embeddings in ${batchDuration}ms`);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

async function testOllamaEmbedding() {
    console.log('\n🧪 Testing Ollama Embedding...\n');

    // Try bge-m3 first (user has this)
    const service = new EmbeddingService({
        provider: 'ollama',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'bge-m3',
    });

    try {
        console.log('📥 Testing with bge-m3 model...');
        const start = Date.now();
        const embedding = await service.embed('Test text for Ollama');
        const duration = Date.now() - start;

        console.log(`✅ Ollama connected!`);
        console.log(`📊 Embedding dimensions: ${embedding.length}`);
        console.log(`⚡ Generation time: ${duration}ms`);
        console.log(`📈 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    } catch (error) {
        console.log('⚠️  Ollama connection failed');
        console.log('   Error:', (error as Error).message);
        console.log('   Make sure Ollama is running: ollama serve');
    }
}

async function main() {
    console.log('🚀 EmbeddingService Manual Test\n');
    console.log('='.repeat(50));

    await testLocalEmbedding();
    await testOllamaEmbedding();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed!\n');
}

main().catch(console.error);
