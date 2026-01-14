
import { MetadataExtractor } from '../services/metadata-extractor';

// Mock fetch
global.fetch = jest.fn();

describe('MetadataExtractor Config (v0.2.1)', () => {
    let extractor: MetadataExtractor;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should use Ollama API when provider is set to ollama', async () => {
        // Init with Ollama config
        extractor = new MetadataExtractor({
            enableAi: true,
            provider: 'ollama',
            ollamaUrl: 'http://custom-ollama:11434',
            ollamaModel: 'qwen3',
        });

        const mockResponse = {
            summary: 'Ollama Summary',
            tags: ['ollama'],
            category: '技术笔记',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ response: JSON.stringify(mockResponse) }),
        });

        await extractor.extract('Test content');

        expect(global.fetch).toHaveBeenCalledWith(
            'http://custom-ollama:11434/api/generate',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"model":"qwen3"'),
            })
        );
    });

    it('should use OpenAI API when provider is set to openai', async () => {
        // Init with OpenAI config
        extractor = new MetadataExtractor({
            enableAi: true,
            provider: 'openai',
            openaiUrl: 'https://api.deepseek.com/v1', // Custom OpenAI-compatible URL
            openaiApiKey: 'sk-test-key',
            openaiModel: 'deepseek-chat',
        });

        const mockResponse = {
            choices: [{
                message: {
                    content: JSON.stringify({
                        summary: 'OpenAI Summary',
                        tags: ['openai'],
                        category: '技术笔记',
                    })
                }
            }]
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        await extractor.extract('Test content');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.deepseek.com/v1/chat/completions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer sk-test-key',
                    'Content-Type': 'application/json'
                }),
                body: expect.stringContaining('"model":"deepseek-chat"'),
            })
        );
    });

    it('should allow dynamic config update', async () => {
        // Start with defaults
        extractor = new MetadataExtractor();

        // Update to OpenAI
        extractor.updateConfig({
            provider: 'openai',
            openaiUrl: 'https://api.openai.com/v1',
            openaiApiKey: 'sk-new-key',
            openaiModel: 'gpt-4o',
        });

        const mockResponse = {
            choices: [{ message: { content: JSON.stringify({ summary: 'GPT', tags: [], category: '技术笔记' }) } }]
        };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        await extractor.extract('test');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/chat/completions',
            expect.objectContaining({
                headers: expect.objectContaining({ 'Authorization': 'Bearer sk-new-key' })
            })
        );
    });
});
