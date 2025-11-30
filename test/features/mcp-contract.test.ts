import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  createClient,
  createMCPClient,
  createMCPContract,
  createMCPStream,
  createMCPBatch,
  createMCPSSEStream,
  createValidatedSSEStream,
  openAIExtractor,
  anthropicExtractor,
  MCPContractError,
} from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('MCP Contract', () => {
  let mockTransport: MockTransport;
  let mcp: ReturnType<typeof createMCPClient>;

  beforeEach(async () => {
    mockTransport = new MockTransport();

    // Mock initialize
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

    mcp = createMCPClient({
      endpoint: 'http://localhost:3000/mcp',
      transport: mockTransport as any,
    });

    await mcp.connect();
  });

  describe('createMCPContract', () => {
    it('should create typed contract for tools', async () => {
      // Mock tool response
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"temp": 72, "conditions": "sunny"}' }],
          isError: false,
        },
      });

      const tools = createMCPContract(mcp, {
        getWeather: {
          inputSchema: z.object({ location: z.string() }),
          outputSchema: z.object({ temp: z.number(), conditions: z.string() }),
        },
      });

      const result = await tools.getWeather({ location: 'NYC' });

      expect(result).toEqual({ temp: 72, conditions: 'sunny' });
    });

    it('should validate input schema', async () => {
      const tools = createMCPContract(mcp, {
        getWeather: {
          inputSchema: z.object({ location: z.string() }),
        },
      });

      // @ts-expect-error - testing runtime validation
      await expect(tools.getWeather({ location: 123 })).rejects.toThrow(MCPContractError);
    });

    it('should validate output schema', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"wrong": "format"}' }],
          isError: false,
        },
      });

      const tools = createMCPContract(mcp, {
        getWeather: {
          inputSchema: z.object({ location: z.string() }),
          outputSchema: z.object({ temp: z.number() }),
        },
      });

      await expect(tools.getWeather({ location: 'NYC' })).rejects.toThrow(MCPContractError);
    });

    it('should support streaming tools', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' },
          ],
          isError: false,
        },
      });

      const tools = createMCPContract(mcp, {
        chat: {
          inputSchema: z.object({ message: z.string() }),
          stream: true,
        },
      });

      const chunks: string[] = [];
      for await (const chunk of tools.chat({ message: 'Hi' })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello, ', 'world!']);
    });

    it('should provide list() helper', () => {
      const tools = createMCPContract(mcp, {
        getWeather: {
          inputSchema: z.object({ location: z.string() }),
          description: 'Get weather for a location',
        },
        chat: {
          stream: true,
        },
      });

      const list = tools.list();

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('getWeather');
      expect(list[0].description).toBe('Get weather for a location');
    });

    it('should provide has() helper', () => {
      const tools = createMCPContract(mcp, {
        getWeather: {},
      });

      expect(tools.has('getWeather')).toBe(true);
      expect(tools.has('unknown')).toBe(false);
    });

    it('should provide raw() helper', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: 'raw response' }],
          isError: false,
        },
      });

      const tools = createMCPContract(mcp, {
        getWeather: {
          inputSchema: z.object({ location: z.string() }),
        },
      });

      const result = await tools.raw('getWeather', { location: 'NYC' });

      expect(result.content).toEqual([{ type: 'text', text: 'raw response' }]);
    });
  });

  describe('createMCPStream', () => {
    it('should create simple string-in stream-out function', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [
            { type: 'text', text: 'Token1 ' },
            { type: 'text', text: 'Token2' },
          ],
          isError: false,
        },
      });

      const chat = createMCPStream(mcp, 'chat_completion');

      const chunks: string[] = [];
      for await (const chunk of chat('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Token1 ', 'Token2']);
    });

    it('should provide text() helper to collect all chunks', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' },
          ],
          isError: false,
        },
      });

      const chat = createMCPStream(mcp, 'chat');

      const result = await chat.text('Hi');

      expect(result).toBe('Hello, world!');
    });

    it('should provide json() helper to parse response', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"answer": 42}' }],
          isError: false,
        },
      });

      const query = createMCPStream(mcp, 'query');

      const result = await query.json<{ answer: number }>('What is the meaning of life?');

      expect(result).toEqual({ answer: 42 });
    });

    it('should support custom input param name', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: 'response' }],
          isError: false,
        },
      });

      const search = createMCPStream(mcp, 'search', { inputParam: 'query' });

      await search.text('test query');

      // Verify the call was made (mock transport tracks calls)
      expect(mockTransport.getCallCount('POST', '/mcp/')).toBeGreaterThan(1);
    });

    it('should support extra params', async () => {
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: 'response' }],
          isError: false,
        },
      });

      const chat = createMCPStream(mcp, 'chat', {
        extraParams: { model: 'gpt-5.1', temperature: 0.7 },
      });

      await chat.text('Hello');

      expect(mockTransport.getCallCount('POST', '/mcp/')).toBeGreaterThan(1);
    });
  });

  describe('createMCPBatch', () => {
    it('should execute multiple tool calls in parallel', async () => {
      // Mock multiple responses
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"id": "1", "name": "Alice"}' }],
          isError: false,
        },
      });

      const contract = {
        getUser: {
          inputSchema: z.object({ id: z.string() }),
          outputSchema: z.object({ id: z.string(), name: z.string() }),
        },
      };

      const batch = createMCPBatch(mcp, contract);

      const results = await batch([
        { tool: 'getUser', args: { id: '1' } },
        { tool: 'getUser', args: { id: '2' } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toEqual({ id: '1', name: 'Alice' });
    });

    it('should handle mixed success/failure results', async () => {
      // First call succeeds
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [{ type: 'text', text: '{"id": "1", "name": "Alice"}' }],
          isError: false,
        },
      }, undefined, { times: 1 });

      // Second call fails (error response)
      mockTransport.setMockResponse('POST', '/mcp/', 200, {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32600, message: 'User not found' },
      });

      const contract = {
        getUser: {
          inputSchema: z.object({ id: z.string() }),
          outputSchema: z.object({ id: z.string(), name: z.string() }),
        },
      };

      const batch = createMCPBatch(mcp, contract);

      const results = await batch([
        { tool: 'getUser', args: { id: '1' } },
        { tool: 'getUser', args: { id: '999' } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });
  });
});

describe('SSE Streaming', () => {
  // Helper to create an SSE mock transport
  function createSSEMockTransport(sseData: string) {
    return {
      async dispatch() {
        const response = new Response(sseData, {
          headers: { 'content-type': 'text/event-stream' },
        });
        return {
          ok: true,
          status: 200,
          headers: response.headers,
          raw: response,
          // Implement sse() method that parses SSE data
          async *sse() {
            const lines = sseData.split('\n');
            let currentEvent: any = { data: '' };

            for (const line of lines) {
              if (line === '') {
                if (currentEvent.data || currentEvent.event || currentEvent.id) {
                  if (currentEvent.data.endsWith('\n')) {
                    currentEvent.data = currentEvent.data.slice(0, -1);
                  }
                  yield currentEvent;
                  currentEvent = { data: '' };
                }
                continue;
              }

              const colonIdx = line.indexOf(':');
              if (colonIdx === -1) continue;

              const field = line.slice(0, colonIdx);
              let value = line.slice(colonIdx + 1);
              if (value.startsWith(' ')) value = value.slice(1);

              if (field === 'data') currentEvent.data += value + '\n';
              else if (field === 'event') currentEvent.event = value;
              else if (field === 'id') currentEvent.id = value;
            }
          },
        };
      },
    };
  }

  describe('createMCPSSEStream', () => {
    it('should stream SSE events as text chunks', async () => {
      const sseData = 'data: Hello\n\ndata: World\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream');
      const chunks: string[] = [];

      for await (const chunk of stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', 'World']);
    });

    it('should provide text() helper', async () => {
      const sseData = 'data: Hello \n\ndata: World\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream');
      const result = await stream.text('test');

      expect(result).toBe('Hello World');
    });

    it('should skip [DONE] markers', async () => {
      const sseData = 'data: Hello\n\ndata: [DONE]\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream');
      const chunks: string[] = [];

      for await (const chunk of stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello']);
    });

    it('should filter by event type', async () => {
      const sseData = 'event: delta\ndata: chunk1\n\nevent: other\ndata: ignored\n\nevent: delta\ndata: chunk2\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream', { eventType: 'delta' });
      const chunks: string[] = [];

      for await (const chunk of stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk1', 'chunk2']);
    });

    it('should support multiple event types', async () => {
      const sseData = 'event: delta\ndata: A\n\nevent: chunk\ndata: B\n\nevent: other\ndata: X\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream', { eventType: ['delta', 'chunk'] });
      const chunks: string[] = [];

      for await (const chunk of stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['A', 'B']);
    });

    it('should provide events() for raw SSE access', async () => {
      const sseData = 'id: 1\nevent: msg\ndata: test\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createMCPSSEStream(client, '/stream');
      const events: any[] = [];

      for await (const event of stream.events('test')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('1');
      expect(events[0].event).toBe('msg');
      expect(events[0].data).toBe('test');
    });
  });

  describe('createValidatedSSEStream', () => {
    it('should validate input schema', async () => {
      const sseData = 'data: response\n\n';
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: createSSEMockTransport(sseData) as any,
      });

      const stream = createValidatedSSEStream(client, '/stream', {
        inputSchema: z.object({
          prompt: z.string().min(1),
          temperature: z.number().optional(),
        }),
      });

      // Valid input should work
      const result = await stream.text({ prompt: 'hello', temperature: 0.7 });
      expect(result).toBe('response');
    });

    it('should throw on invalid input', async () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: { dispatch: vi.fn() } as any,
      });

      const stream = createValidatedSSEStream(client, '/stream', {
        inputSchema: z.object({
          prompt: z.string().min(5),
        }),
      });

      // Invalid input (too short) should throw
      await expect(stream.text({ prompt: 'hi' })).rejects.toThrow();
    });
  });

  describe('Extractors', () => {
    describe('openAIExtractor', () => {
      it('should extract content from chat completion delta', () => {
        const event = {
          data: JSON.stringify({
            choices: [{ delta: { content: 'Hello' } }],
          }),
        };

        expect(openAIExtractor(event as any)).toBe('Hello');
      });

      it('should extract text from legacy format', () => {
        const event = {
          data: JSON.stringify({
            choices: [{ text: 'Hello' }],
          }),
        };

        expect(openAIExtractor(event as any)).toBe('Hello');
      });

      it('should return null for [DONE]', () => {
        expect(openAIExtractor({ data: '[DONE]' } as any)).toBeNull();
      });

      it('should return null for invalid JSON', () => {
        expect(openAIExtractor({ data: 'not json' } as any)).toBeNull();
      });
    });

    describe('anthropicExtractor', () => {
      it('should extract text from content_block_delta', () => {
        const event = {
          data: JSON.stringify({
            delta: { text: 'Hello' },
          }),
        };

        expect(anthropicExtractor(event as any)).toBe('Hello');
      });

      it('should return null for message_delta', () => {
        const event = {
          data: JSON.stringify({
            type: 'message_delta',
            stop_reason: 'end',
          }),
        };

        expect(anthropicExtractor(event as any)).toBeNull();
      });

      it('should return null for [DONE]', () => {
        expect(anthropicExtractor({ data: '[DONE]' } as any)).toBeNull();
      });
    });
  });
});
