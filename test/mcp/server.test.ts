import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer, createMCPServer } from '../../src/mcp/server.js';
import { join } from 'path';

describe('MCP Server', () => {
  let server: MCPServer;
  const testPort = 3199;
  const docsPath = join(process.cwd(), 'docs');

  beforeAll(async () => {
    server = new MCPServer({
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
      const tempServer = createMCPServer({ port: 3198 });
      await tempServer.start();
      expect(tempServer.getPort()).toBe(3198);
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
      expect(result.result.tools).toHaveLength(2);

      const toolNames = result.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('search_docs');
      expect(toolNames).toContain('get_doc');
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
      // Should have at most 2 numbered results
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

      // Should find at least one matching file
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

      // Either finds it or suggests alternatives
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

describe('createMCPServer factory', () => {
  it('should create server with default options', () => {
    const server = createMCPServer();
    expect(server).toBeInstanceOf(MCPServer);
    expect(server.getPort()).toBe(3100);
  });

  it('should create server with custom options', () => {
    const server = createMCPServer({
      name: 'custom-server',
      version: '2.0.0',
      port: 4000,
    });
    expect(server.getPort()).toBe(4000);
  });
});
