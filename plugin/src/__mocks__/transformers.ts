/**
 * Mock for @xenova/transformers
 * Used in tests to avoid downloading models
 */

export const pipeline = jest.fn().mockImplementation(async (task: string, model: string) => {
    // Return a mock embedder function
    return jest.fn().mockImplementation(async (text: string, options: any) => {
        // Generate a fake embedding (384 dimensions for all-MiniLM-L6-v2)
        const embedding = new Array(384).fill(0).map(() => Math.random());

        return {
            data: new Float32Array(embedding),
        };
    });
});
