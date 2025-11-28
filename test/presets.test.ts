import { describe, it, expect } from 'vitest';
import { presets } from '../src/index.js';

describe('Presets', () => {
    it('OpenAI: should configure defaults', () => {
        const config = presets.openai({ apiKey: 'sk-123', organization: 'org-1' });
        
        expect(config.baseUrl).toBe('https://api.openai.com/v1');
        expect((config.headers as any)['Authorization']).toBe('Bearer sk-123');
        expect((config.headers as any)['OpenAI-Organization']).toBe('org-1');
        expect(config.timeout).toBe(600000);
        expect(config.retry?.maxAttempts).toBe(5);
    });

    it('Anthropic: should configure defaults', () => {
        const config = presets.anthropic({ apiKey: 'sk-ant-123' });
        
        expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
        expect((config.headers as any)['x-api-key']).toBe('sk-ant-123');
        expect((config.headers as any)['anthropic-version']).toBe('2023-06-01');
        expect(config.timeout).toBe(600000);
    });
});
