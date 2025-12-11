import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptRegistry } from '../../src/mcp/prompts/index.js';

describe('PromptRegistry', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    registry = new PromptRegistry();
  });

  it('should register built-in prompts on initialization', () => {
    const prompts = registry.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.some(p => p.name === 'recker-expert')).toBe(true);
    expect(prompts.some(p => p.name === 'generate-http-client')).toBe(true);
    expect(prompts.some(p => p.name === 'seo-audit')).toBe(true);
  });

  it('should retrieve the recker-expert prompt', async () => {
    const messages = await registry.getPrompt('recker-expert');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect((messages[0].content as any).text).toContain('You are an expert in Recker');
  });

  it('should retrieve the generate-http-client prompt with arguments', async () => {
    const args = {
      apiName: 'GitHub',
      baseUrl: 'https://api.github.com',
      authType: 'bearer'
    };
    const messages = await registry.getPrompt('generate-http-client', args);
    expect(messages).toHaveLength(1);
    const text = (messages[0].content as any).text;
    expect(text).toContain('Generate a production-ready Recker client configuration for the GitHub');
    expect(text).toContain('https://api.github.com');
    expect(text).toContain('bearer');
  });

  it('should retrieve the seo-audit prompt with arguments', async () => {
    const args = { url: 'https://example.com' };
    const messages = await registry.getPrompt('seo-audit', args);
    expect(messages).toHaveLength(1);
    const text = (messages[0].content as any).text;
    expect(text).toContain('SEO audit for https://example.com');
    expect(text).toContain('rek_seo_analyze');
  });

  it('should throw error for unknown prompt', async () => {
    await expect(registry.getPrompt('unknown-prompt')).rejects.toThrow('Prompt not found');
  });
});
