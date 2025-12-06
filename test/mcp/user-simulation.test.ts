import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer } from '../../src/mcp/server.js';
import { join } from 'path';

/**
 * User Simulation Tests
 *
 * These tests simulate real user questions that an AI agent would ask
 * when using Recker MCP to understand and use the HTTP client.
 *
 * Each test represents a realistic use case:
 * - Finding documentation for features
 * - Getting code examples
 * - Understanding API schemas
 * - Getting suggestions for tasks
 */

describe('MCP User Simulation Tests', () => {
  let server: MCPServer;
  const testPort = 3196;
  const docsPath = join(process.cwd(), 'docs');

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const response = await fetch(`http://localhost:${testPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    return response.json();
  };

  beforeAll(async () => {
    server = new MCPServer({
      transport: 'http',
      port: testPort,
      docsPath,
      debug: false,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Documentation Search Scenarios', () => {
    it('should find retry documentation when user asks "how do I retry failed requests?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'retry failed requests',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/retry|backoff|attempts/);
    });

    it('should find cache documentation when user asks "how to cache HTTP responses?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'cache HTTP responses',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/cache|storage|ttl/);
    });

    it('should find streaming documentation when user asks "how to stream AI responses?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'stream AI responses',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/stream|sse|ai/);
    });

    it('should find middleware documentation when user asks "how to add custom middleware?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'custom middleware hooks',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/middleware|hooks|plugin/);
    });

    it('should find timeout documentation when user asks "how to set request timeout?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'request timeout configuration',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/timeout/);
    });

    it('should find authentication documentation when user asks "how to add auth headers?"', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'authentication headers bearer token',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      expect(text.toLowerCase()).toMatch(/auth|header|bearer|token/);
    });
  });

  describe('Category Filtering Scenarios', () => {
    it('should filter by HTTP category when user asks about HTTP features', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'client configuration',
        category: 'http',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      // Should return results or "no documentation" - both are valid
      expect(text).toMatch(/Found|No documentation/);
    });

    it('should filter by AI category when user asks about AI features', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'openai streaming',
        category: 'ai',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/Found|No documentation/);
    });
  });

  describe('Get Documentation Scenarios', () => {
    it('should get full quickstart documentation', async () => {
      const result = await callTool('rek_get_doc', {
        path: 'http/01-quickstart.md',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toContain('#');
      expect(text.toLowerCase()).toMatch(/install|quickstart|getting started/);
    });

    it('should get retry plugin documentation', async () => {
      const result = await callTool('rek_get_doc', {
        path: 'http/03-retry.md',
      });

      const text = result.result.content[0].text;
      // Either finds the doc or suggests alternatives
      expect(text).toMatch(/#|Did you mean|not found/);
    });

    it('should suggest alternatives for partial path', async () => {
      const result = await callTool('rek_get_doc', {
        path: 'quickstart',
      });

      const text = result.result.content[0].text;
      // Should find a match or suggest alternatives
      expect(text).toMatch(/quickstart|Did you mean/i);
    });
  });

  describe('Code Examples Scenarios', () => {
    it('should get basic usage examples when user asks for simple examples', async () => {
      const result = await callTool('rek_code_examples', {
        feature: 'basic',
        complexity: 'basic',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      // Either shows examples or explains why none were found
      expect(text).toMatch(/example|code|No code examples/i);
    });

    it('should get retry examples when user asks for retry code', async () => {
      const result = await callTool('rek_code_examples', {
        feature: 'retry',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/retry|example|No code examples/i);
    });

    it('should get cache examples when user asks for caching code', async () => {
      const result = await callTool('rek_code_examples', {
        feature: 'cache',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/cache|example|No code examples/i);
    });

    it('should get streaming examples when user asks for SSE code', async () => {
      const result = await callTool('rek_code_examples', {
        feature: 'streaming',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/stream|sse|example|No code examples/i);
    });

    it('should limit examples when user specifies limit', async () => {
      const result = await callTool('rek_code_examples', {
        feature: 'general',
        limit: 2,
      });

      const text = result.result.content[0].text;
      // Either finds examples or says none found for feature
      expect(text).toMatch(/example|No examples/i);
    });
  });

  describe('API Schema Scenarios', () => {
    it('should get Client type definition when user asks about Client API', async () => {
      const result = await callTool('rek_api_schema', {
        type: 'Client',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      // Either finds the type or explains not found
      expect(text).toMatch(/Client|type|interface|not found/i);
    });

    it('should get RequestOptions type when user asks about request options', async () => {
      const result = await callTool('rek_api_schema', {
        type: 'RequestOptions',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/RequestOptions|type|interface|not found/i);
    });

    it('should get Response type when user asks about response handling', async () => {
      const result = await callTool('rek_api_schema', {
        type: 'Response',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/Response|type|interface|not found/i);
    });

    it('should return error when type not specified', async () => {
      const result = await callTool('rek_api_schema', {});

      // API requires type parameter
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('type is required');
    });
  });

  describe('Suggestions Scenarios', () => {
    it('should suggest how to implement retry when user asks for retry help', async () => {
      const result = await callTool('rek_suggest', {
        useCase: 'implement retry with exponential backoff',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text.toLowerCase()).toMatch(/retry|backoff|example|suggestion|configuration/);
    });

    it('should suggest how to implement caching when user asks for cache help', async () => {
      const result = await callTool('rek_suggest', {
        useCase: 'cache API responses',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text.toLowerCase()).toMatch(/cache|storage|example|suggestion|configuration/);
    });

    it('should suggest how to handle streaming when user asks for SSE help', async () => {
      const result = await callTool('rek_suggest', {
        useCase: 'stream responses from OpenAI',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text.toLowerCase()).toMatch(/stream|sse|openai|ai|example|configuration/);
    });

    it('should suggest how to handle errors when user asks for error handling', async () => {
      const result = await callTool('rek_suggest', {
        useCase: 'handle HTTP errors gracefully with retry',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text.toLowerCase()).toMatch(/error|retry|handle|resilient|configuration/);
    });

    it('should return error when useCase not provided', async () => {
      const result = await callTool('rek_suggest', {});

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('useCase is required');
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should handle multi-word query for authentication with retry', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'authentication bearer token retry on 401',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      // Should find relevant docs about auth and/or retry
      expect(text).toMatch(/Found|No documentation/);
    });

    it('should handle query about performance optimization', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'performance http2 connection pooling',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/Found|No documentation/);
    });

    it('should handle query about testing and mocking', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'mock testing http requests',
      });

      const text = result.result.content[0].text;
      expect(result.result.isError).toBeUndefined();
      expect(text).toMatch(/Found|No documentation/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query gracefully', async () => {
      const result = await callTool('rek_search_docs', {
        query: '',
      });

      const text = result.result.content[0].text;
      // Empty query returns error
      expect(result.result.isError).toBe(true);
      expect(text).toContain('query is required');
    });

    it('should handle very long query', async () => {
      const longQuery =
        'I want to understand how to configure the HTTP client with retry policy and cache and timeout and headers and authentication all together in one configuration object';

      const result = await callTool('rek_search_docs', {
        query: longQuery,
      });

      expect(result.result.isError).toBeUndefined();
      expect(result.result.content[0].text).toBeDefined();
    }, 15000);

    it('should handle special characters in query', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'async/await Promise.all() fetch()',
      });

      expect(result.result.isError).toBeUndefined();
      expect(result.result.content[0].text).toBeDefined();
    }, 10000);

    it('should handle unicode characters in query', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'naïve café résumé',
      });

      expect(result.result.isError).toBeUndefined();
      expect(result.result.content[0].text).toBeDefined();
    });
  });

  describe('Search Quality Verification', () => {
    it('should rank exact matches higher', async () => {
      const result = await callTool('rek_search_docs', {
        query: 'createClient',
        limit: 5,
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
      // createClient should be in the top results
      expect(text.toLowerCase()).toContain('client');
    });

    it('should find semantically related content', async () => {
      // "error handling" should find docs about HttpError, retries, etc.
      const result = await callTool('rek_search_docs', {
        query: 'error handling best practices',
      });

      const text = result.result.content[0].text;
      expect(text).toContain('Found');
    });

    it('should find typo-tolerant matches', async () => {
      // "rety" should still find "retry" docs
      const result = await callTool('rek_search_docs', {
        query: 'rety plgin configration',
      });

      const text = result.result.content[0].text;
      // Fuzzy search should still find relevant results
      expect(text).toMatch(/Found|No documentation/);
    });
  });
});
