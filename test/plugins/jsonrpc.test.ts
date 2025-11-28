import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, createJsonRpcClient, jsonrpc, JsonRpcException, JsonRpcErrorCodes } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('JSON-RPC 2.0 Plugin', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('JsonRpcClient', () => {
    it('should make a JSON-RPC call', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, {
        jsonrpc: '2.0',
        result: 42,
        id: 1
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });
      const result = await rpc.call<number>('add', [1, 2]);

      expect(result).toBe(42);
    });

    it('should support named parameters', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, {
        jsonrpc: '2.0',
        result: { id: 123, name: 'John' },
        id: 1
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });
      const result = await rpc.call('getUser', { id: 123 });

      expect(result).toEqual({ id: 123, name: 'John' });
    });

    it('should send notifications without waiting for response', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 204, null);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });
      await rpc.notify('log', ['User logged in']);

      expect(mockTransport.getCallCount('POST', '/rpc')).toBe(1);
    });

    it('should handle JSON-RPC errors', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, {
        jsonrpc: '2.0',
        error: {
          code: JsonRpcErrorCodes.METHOD_NOT_FOUND,
          message: 'Method not found'
        },
        id: 1
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });

      await expect(rpc.call('unknownMethod')).rejects.toThrow(JsonRpcException);
    });

    it('should support batch requests', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, [
        { jsonrpc: '2.0', result: 'user1', id: 1 },
        { jsonrpc: '2.0', result: 'user2', id: 2 },
        { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid' }, id: 3 }
      ]);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });
      const batch = await rpc.batch([
        { method: 'getUser', params: { id: 1 } },
        { method: 'getUser', params: { id: 2 } },
        { method: 'invalid' }
      ]);

      expect(batch.responses).toHaveLength(3);
      expect(batch.hasErrors).toBe(true);
      expect(batch.errors).toHaveLength(1);
    });

    it('should get result from batch by ID', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, [
        { jsonrpc: '2.0', result: 'found', id: 'my-id' }
      ]);

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });
      const batch = await rpc.batch([
        { method: 'find', params: { q: 'test' }, id: 'my-id' }
      ]);

      const result = rpc.getFromBatch(batch, 'my-id');
      expect(result).toBe('found');
    });

    it('should create typed proxy', async () => {
      mockTransport.setMockResponse('POST', '/rpc', 200, {
        jsonrpc: '2.0',
        result: 5,
        id: 1
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, { endpoint: '/rpc' });

      interface MathApi {
        add(a: number, b: number): number;
      }

      const api = rpc.proxy<MathApi>();
      const result = await api.add(2, 3);

      expect(result).toBe(5);
    });

    it('should use custom ID generator', async () => {
      let customId = 100;
      mockTransport.setMockResponse('POST', '/rpc', 200, {
        jsonrpc: '2.0',
        result: 'ok',
        id: 101
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const rpc = createJsonRpcClient(client, {
        endpoint: '/rpc',
        idGenerator: () => ++customId
      });

      await rpc.call('test');
      expect(customId).toBe(101);
    });
  });

  describe('jsonrpc plugin', () => {
    it('should add jsonrpc method to client', async () => {
      mockTransport.setMockResponse('POST', '/api/rpc', 200, {
        jsonrpc: '2.0',
        result: 'hello',
        id: 1
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [jsonrpc()]
      });

      const rpc = client.jsonrpc('/api/rpc');
      const result = await rpc.call('greet');

      expect(result).toBe('hello');
    });
  });

  describe('JsonRpcException', () => {
    it('should detect error types', () => {
      const parseError = new JsonRpcException({
        code: JsonRpcErrorCodes.PARSE_ERROR,
        message: 'Parse error'
      });

      expect(JsonRpcException.isParseError(parseError)).toBe(true);
      expect(JsonRpcException.isMethodNotFound(parseError)).toBe(false);

      const methodNotFound = new JsonRpcException({
        code: JsonRpcErrorCodes.METHOD_NOT_FOUND,
        message: 'Method not found'
      });

      expect(JsonRpcException.isMethodNotFound(methodNotFound)).toBe(true);

      const serverError = new JsonRpcException({
        code: -32050,
        message: 'Server error'
      });

      expect(JsonRpcException.isServerError(serverError)).toBe(true);
    });
  });
});
