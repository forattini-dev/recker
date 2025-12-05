import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMCPClient, MCPClient } from '../../src/mcp/client.js';
import { MockTransport } from '../helpers/mock-transport.js';
import type {
  JsonRpcResponse,
  MCPInitializeResponse,
  MCPToolsListResponse,
  MCPResourcesListResponse,
  MCPResourcesReadResponse,
  MCPPromptsListResponse,
  MCPPromptsGetResponse,
  MCPToolResult,
} from '../../src/mcp/types.js';

describe('MCP Client', () => {
  let mcp: MCPClient;
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
  });

  afterEach(async () => {
    if (mcp?.isConnected()) {
      await mcp.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect and initialize', async () => {
      // Path is /mcp/ because baseUrl is http://localhost:3000/mcp and post('/')
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
        } as MCPInitializeResponse,
      }, undefined, { times: 1 });

      // Mock SSE endpoint
      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        clientName: 'test-client',
        transport: mockTransport as any,
      } as any);

      const serverInfo = await mcp.connect();

      expect(serverInfo.name).toBe('test-server');
      expect(serverInfo.version).toBe('1.0.0');
      expect(mcp.isConnected()).toBe(true);
    });

    it('should emit connected event', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      let connected = false;
      mcp.on('connected', () => {
        connected = true;
      });

      await mcp.connect();

      expect(connected).toBe(true);
    });

    it('should disconnect', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();
      expect(mcp.isConnected()).toBe(true);

      await mcp.disconnect();
      expect(mcp.isConnected()).toBe(false);
    });
  });

  describe('Tools API', () => {
    beforeEach(async () => {
      // Initialize
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();
    });

    it('should list tools', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather data',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        },
      });

      const tools = await mcp.tools.list();

      expect(tools).toBeDefined();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get_weather');
    });

    it('should call a tool', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '72°F' }],
          isError: false,
        } as MCPToolResult,
      });

      const result = await mcp.tools.call('get_weather', {
        location: 'San Francisco',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('72°F');
    });

    it('should get a specific tool', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [
            { name: 'tool1', inputSchema: { type: 'object' } },
            { name: 'tool2', inputSchema: { type: 'object' } },
          ],
        },
      });

      const tool = await mcp.tools.get('tool1');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('tool1');
    });
  });

  describe('Resources API', () => {
    beforeEach(async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();
    });

    it('should list resources', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          resources: [
            {
              uri: 'file://data.json',
              name: 'Data File',
              description: 'JSON data',
            },
          ],
        } as MCPResourcesListResponse,
      });

      const resources = await mcp.resources.list();

      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('file://data.json');
    });

    it('should read a resource', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          contents: [
            {
              uri: 'file://data.json',
              mimeType: 'application/json',
              text: '{"key":"value"}',
            },
          ],
        } as MCPResourcesReadResponse,
      });

      const contents = await mcp.resources.read('file://data.json');

      expect(contents).toHaveLength(1);
      expect(contents[0].text).toBe('{"key":"value"}');
    });

    it('should subscribe to a resource', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {},
      });

      await mcp.resources.subscribe('file://data.json');

      // Should not throw
      expect(true).toBe(true);
    });

    it('should unsubscribe from a resource', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {},
      });

      await mcp.resources.unsubscribe('file://data.json');

      expect(true).toBe(true);
    });
  });

  describe('Prompts API', () => {
    beforeEach(async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();
    });

    it('should list prompts', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          prompts: [
            {
              name: 'code_review',
              description: 'Code review template',
            },
          ],
        } as MCPPromptsListResponse,
      });

      const prompts = await mcp.prompts.list();

      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('code_review');
    });

    it('should get a prompt', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: 'Review this code' },
            },
          ],
        } as MCPPromptsGetResponse,
      });

      const messages = await mcp.prompts.get('code_review', {
        language: 'typescript',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });
  });

  describe('Utilities', () => {
    beforeEach(async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();
    });

    it('should ping the server', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {},
      });

      await mcp.ping();

      expect(true).toBe(true);
    });

    it('should get server info', async () => {
      const info = mcp.getServerInfo();

      expect(info).toBeDefined();
      expect(info?.name).toBe('test');
    });

    it('should check if connected', () => {
      expect(mcp.isConnected()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when calling before initialized', async () => {
      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await expect(mcp.tools.list()).rejects.toThrow(
        'MCP client not initialized'
      );
    });

    it('should handle JSON-RPC errors', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      }, undefined, { times: 1 });

      mockTransport.setMockResponse('GET', '/mcp/sse', 200, '', undefined, { times: 1 });

      mcp = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        transport: mockTransport as any,
      } as any);

      await mcp.connect();

      // Error response
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32601,
          message: 'Method not found',
          data: { method: 'unknown' },
        },
      });

      await expect(mcp.tools.list()).rejects.toThrow('Method not found');
    });
  });

  describe('createMCPClient helper', () => {
    it('should create an MCP client', () => {
      const client = createMCPClient({
        endpoint: 'http://localhost:3000/mcp',
      });

      expect(client).toBeInstanceOf(MCPClient);
    });
  });

  describe('Options', () => {
    it('should use custom options', () => {
      const client = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
        clientName: 'custom-client',
        clientVersion: '2.0.0',
        protocolVersion: '2024-11-05',
        timeout: 60000,
        retries: 5,
        debug: true,
      });

      expect(client.options.clientName).toBe('custom-client');
      expect(client.options.clientVersion).toBe('2.0.0');
      expect(client.options.timeout).toBe(60000);
      expect(client.options.retries).toBe(5);
      expect(client.options.debug).toBe(true);
    });

    it('should use default options', () => {
      const client = new MCPClient({
        endpoint: 'http://localhost:3000/mcp',
      });

      expect(client.options.clientName).toBe('recker-mcp-client');
      expect(client.options.clientVersion).toBe('1.0.0');
      expect(client.options.timeout).toBe(30000);
      expect(client.options.retries).toBe(3);
      expect(client.options.debug).toBe(false);
    });
  });
});
