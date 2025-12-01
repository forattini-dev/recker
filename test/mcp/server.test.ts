import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MCPServer, createMCPServer } from '../../src/mcp/server.js';
import { join } from 'path';

describe('MCP Server', () => {
  const docsPath = join(process.cwd(), 'docs');

  describe('HTTP Transport', () => {
    let server: MCPServer;
    const testPort = 3199;

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

    describe('Server Lifecycle', () => {
      it('should start and stop', async () => {
        const tempServer = createMCPServer({ transport: 'http', port: 3198 });
        await tempServer.start();
        expect(tempServer.getPort()).toBe(3198);
        expect(tempServer.getTransport()).toBe('http');
        await tempServer.stop();
      });

      it('should index documentation files', () => {
        expect(server.getDocsCount()).toBeGreaterThan(0);
      });
    });

    describe('JSON-RPC Protocol', () => {
      const sendRequest = async (method: string, params?: unknown) => {
        const response = await fetch(`http://localhost:${testPort}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
          }),
        });
        return response.json();
      };

      it('should handle initialize', async () => {
        const result = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        });

        expect(result.result).toBeDefined();
        expect(result.result.protocolVersion).toBe('2024-11-05');
        expect(result.result.serverInfo.name).toBe('recker-docs');
        expect(result.result.capabilities.tools).toBeDefined();
      });

      it('should handle ping', async () => {
        const result = await sendRequest('ping');
        expect(result.result).toBeDefined();
        expect(result.error).toBeUndefined();
      });

      it('should list tools', async () => {
        const result = await sendRequest('tools/list');

        expect(result.result.tools).toBeDefined();
        expect(result.result.tools).toHaveLength(5);

        const toolNames = result.result.tools.map((t: any) => t.name);
        expect(toolNames).toContain('search_docs');
        expect(toolNames).toContain('get_doc');
        expect(toolNames).toContain('code_examples');
        expect(toolNames).toContain('api_schema');
        expect(toolNames).toContain('suggest');
      });

      it('should handle resources/list', async () => {
        const result = await sendRequest('resources/list');
        expect(result.result.resources).toEqual([]);
      });

      it('should handle prompts/list', async () => {
        const result = await sendRequest('prompts/list');
        expect(result.result.prompts).toEqual([]);
      });

      it('should return error for unknown method', async () => {
        const result = await sendRequest('unknown/method');
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe(-32601);
      });
    });

    describe('search_docs Tool', () => {
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

      it('should search for "http" and find results', async () => {
        const result = await callTool('search_docs', { query: 'http' });

        expect(result.result).toBeDefined();
        expect(result.result.content).toHaveLength(1);
        expect(result.result.content[0].type).toBe('text');
        expect(result.result.content[0].text).toContain('Found');
      });

      it('should search for "cache" and find results', async () => {
        const result = await callTool('search_docs', { query: 'cache' });

        expect(result.result.content[0].text).toContain('Found');
        expect(result.result.content[0].text).toContain('cache');
      });

      it('should filter by category', async () => {
        const result = await callTool('search_docs', {
          query: 'streaming',
          category: 'ai',
        });

        expect(result.result.content[0].text).toMatch(/Found|No documentation/);
      });

      it('should limit results', async () => {
        const result = await callTool('search_docs', {
          query: 'http',
          limit: 2,
        });

        const text = result.result.content[0].text;
        const matches = text.match(/^\d+\./gm) || [];
        expect(matches.length).toBeLessThanOrEqual(2);
      });

      it('should return helpful message for no results', async () => {
        const result = await callTool('search_docs', {
          query: 'xyznonexistent123',
        });

        expect(result.result.content[0].text).toContain('No documentation found');
        expect(result.result.content[0].text).toContain('Try different keywords');
      });

      it('should return error without query', async () => {
        const result = await callTool('search_docs', {});

        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('query is required');
      });
    });

    describe('get_doc Tool', () => {
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

      it('should get doc by full path', async () => {
        const result = await callTool('get_doc', {
          path: 'http/01-quickstart.md',
        });

        expect(result.result.isError).toBeUndefined();
        expect(result.result.content[0].text).toContain('#');
      });

      it('should get doc by partial path', async () => {
        const result = await callTool('get_doc', {
          path: '01-quickstart.md',
        });

        expect(result.result.content[0].text).toMatch(/#|Documentation not found/);
      });

      it('should return error for non-existent doc', async () => {
        const result = await callTool('get_doc', {
          path: 'nonexistent/file.md',
        });

        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('Documentation not found');
      });

      it('should suggest alternatives for partial matches', async () => {
        const result = await callTool('get_doc', {
          path: 'quickstart',
        });

        expect(result.result.content[0].text).toMatch(/quickstart|Did you mean/i);
      });

      it('should return error without path', async () => {
        const result = await callTool('get_doc', {});

        expect(result.result.isError).toBe(true);
        expect(result.result.content[0].text).toContain('path is required');
      });
    });

    describe('HTTP Protocol', () => {
      it('should handle CORS preflight', async () => {
        const response = await fetch(`http://localhost:${testPort}`, {
          method: 'OPTIONS',
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      });

      it('should reject non-POST methods', async () => {
        const response = await fetch(`http://localhost:${testPort}`, {
          method: 'GET',
        });

        expect(response.status).toBe(405);
      });

      it('should handle invalid JSON', async () => {
        const response = await fetch(`http://localhost:${testPort}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json{',
        });

        const result = await response.json();
        expect(result.error.code).toBe(-32700);
        expect(result.error.message).toBe('Parse error');
      });
    });
  });

  describe('SSE Transport', () => {
    let server: MCPServer;
    const testPort = 3197;

    beforeAll(async () => {
      server = new MCPServer({
        transport: 'sse',
        port: testPort,
        docsPath,
        debug: false,
      });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('should have correct transport', () => {
      expect(server.getTransport()).toBe('sse');
    });

    it('should handle health check endpoint', async () => {
      const response = await fetch(`http://localhost:${testPort}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.name).toBe('recker-docs');
      expect(data.docsCount).toBeGreaterThan(0);
    });

    it('should handle JSON-RPC POST', async () => {
      const response = await fetch(`http://localhost:${testPort}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });

      const result = await response.json();
      expect(result.result.tools).toHaveLength(5);
    });

    it('should establish SSE connection', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);

      try {
        const response = await fetch(`http://localhost:${testPort}/sse`, {
          signal: controller.signal,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/event-stream');

        // Read first event
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);

        expect(text).toContain('data:');
        expect(text).toContain('connected');

        reader.cancel();
      } catch (err: any) {
        if (err.name !== 'AbortError') throw err;
      } finally {
        clearTimeout(timeout);
      }
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${testPort}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('handleRequest method', () => {
    let server: MCPServer;

    beforeEach(() => {
      server = new MCPServer({
        transport: 'http',
        docsPath,
        debug: false,
      });
    });

    it('should handle notifications/initialized', () => {
      const response = server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'notifications/initialized',
      });

      expect(response.result).toEqual({});
    });

    it('should handle unknown tool call', () => {
      const response = server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'unknown_tool', arguments: {} },
      });

      expect(response.result).toBeDefined();
      expect((response.result as any).isError).toBe(true);
      expect((response.result as any).content[0].text).toContain('Unknown tool');
    });
  });
});

describe('createMCPServer factory', () => {
  it('should create server with default options', () => {
    const server = createMCPServer();
    expect(server).toBeInstanceOf(MCPServer);
    expect(server.getPort()).toBe(3100);
    expect(server.getTransport()).toBe('stdio');
  });

  it('should create server with custom options', () => {
    const server = createMCPServer({
      name: 'custom-server',
      version: '2.0.0',
      port: 4000,
      transport: 'http',
    });
    expect(server.getPort()).toBe(4000);
    expect(server.getTransport()).toBe('http');
  });

  it('should create server with sse transport', () => {
    const server = createMCPServer({
      transport: 'sse',
      port: 5000,
    });
    expect(server.getTransport()).toBe('sse');
  });
});
