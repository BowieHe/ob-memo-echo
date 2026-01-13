// Test Qwen embedding dimension
const fetch = require('node-fetch');

async function testQwen() {
    const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen2.5:0.5b',
            prompt: 'test'
        })
    });
    
    const data = await response.json();
    console.log('Embedding dimension:', data.embedding.length);
    console.log('First 5 values:', data.embedding.slice(0, 5));
}

testQwen().catch(console.error);
