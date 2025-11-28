import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createClient,
  createGrpcWebClient,
  grpcWeb,
  GrpcError,
  GrpcStatusCode,
  jsonCodec
} from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('gRPC-Web Plugin', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    vi.clearAllMocks();
  });

  describe('GrpcError', () => {
    it('should create error from status', () => {
      const error = new GrpcError({
        code: GrpcStatusCode.NOT_FOUND,
        message: 'Resource not found'
      });

      expect(error.code).toBe(GrpcStatusCode.NOT_FOUND);
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('GrpcError');
    });

    it('should create error with metadata', () => {
      const error = new GrpcError(
        { code: GrpcStatusCode.PERMISSION_DENIED, message: 'Access denied' },
        { 'x-debug': 'info' }
      );

      expect(error.metadata).toEqual({ 'x-debug': 'info' });
    });

    it('should create error from code helper', () => {
      const error = GrpcError.fromCode(GrpcStatusCode.INTERNAL, 'Server error');

      expect(error.code).toBe(GrpcStatusCode.INTERNAL);
      expect(error.message).toBe('Server error');
    });
  });

  describe('jsonCodec', () => {
    it('should encode and decode JSON', () => {
      const codec = jsonCodec<{ name: string; value: number }>();
      const original = { name: 'test', value: 42 };

      const encoded = codec.encode(original);
      const decoded = codec.decode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should handle arrays', () => {
      const codec = jsonCodec<number[]>();
      const original = [1, 2, 3, 4, 5];

      const encoded = codec.encode(original);
      const decoded = codec.decode(encoded);

      expect(decoded).toEqual(original);
    });
  });

  describe('GrpcStatusCode', () => {
    it('should have all standard codes', () => {
      expect(GrpcStatusCode.OK).toBe(0);
      expect(GrpcStatusCode.CANCELLED).toBe(1);
      expect(GrpcStatusCode.UNKNOWN).toBe(2);
      expect(GrpcStatusCode.INVALID_ARGUMENT).toBe(3);
      expect(GrpcStatusCode.DEADLINE_EXCEEDED).toBe(4);
      expect(GrpcStatusCode.NOT_FOUND).toBe(5);
      expect(GrpcStatusCode.ALREADY_EXISTS).toBe(6);
      expect(GrpcStatusCode.PERMISSION_DENIED).toBe(7);
      expect(GrpcStatusCode.RESOURCE_EXHAUSTED).toBe(8);
      expect(GrpcStatusCode.FAILED_PRECONDITION).toBe(9);
      expect(GrpcStatusCode.ABORTED).toBe(10);
      expect(GrpcStatusCode.OUT_OF_RANGE).toBe(11);
      expect(GrpcStatusCode.UNIMPLEMENTED).toBe(12);
      expect(GrpcStatusCode.INTERNAL).toBe(13);
      expect(GrpcStatusCode.UNAVAILABLE).toBe(14);
      expect(GrpcStatusCode.DATA_LOSS).toBe(15);
      expect(GrpcStatusCode.UNAUTHENTICATED).toBe(16);
    });
  });

  describe('GrpcWebClient', () => {
    it('should be created with options', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com'
      });

      expect(grpcClient).toBeDefined();
    });

    it('should create service client', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com'
      });

      const service = grpcClient.service('helloworld.Greeter', {
        sayHello: {},
        sayHelloAgain: {}
      });

      expect(service.sayHello).toBeDefined();
      expect(service.sayHelloAgain).toBeDefined();
    });
  });

  describe('grpcWeb plugin', () => {
    it('should add grpcWeb method to client', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [grpcWeb()]
      });

      const grpcClient = client.grpcWeb();

      expect(grpcClient).toBeDefined();
    });

    it('should use client baseUrl by default', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [grpcWeb()]
      });

      // Should not throw - baseUrl is picked from client
      const grpcClient = client.grpcWeb();
      expect(grpcClient).toBeDefined();
    });

    it('should allow override baseUrl', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [grpcWeb()]
      });

      const grpcClient = client.grpcWeb({
        baseUrl: 'https://grpc.example.com'
      });

      expect(grpcClient).toBeDefined();
    });
  });

  describe('GrpcWebClient options', () => {
    it('should support text format option', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true
      });

      expect(grpcClient).toBeDefined();
    });

    it('should support metadata option', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        metadata: {
          'authorization': 'Bearer token123'
        }
      });

      expect(grpcClient).toBeDefined();
    });

    it('should support timeout option', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        timeout: 60000
      });

      expect(grpcClient).toBeDefined();
    });
  });

  // Note: Full integration tests for gRPC-Web require a real gRPC-Web server
  // or complex mocking of the binary protocol. These tests verify the API surface.

  describe('integration scenarios', () => {
    it('should handle typical unary call flow', async () => {
      // This test documents the expected usage pattern
      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        plugins: [grpcWeb()]
      });

      const grpcClient = client.grpcWeb({
        baseUrl: 'https://grpc.example.com'
      });

      // Define codec
      interface HelloRequest { name: string }
      interface HelloReply { message: string }

      const requestCodec = jsonCodec<HelloRequest>();
      const replyCodec = jsonCodec<HelloReply>();

      // The actual call would be:
      // const response = await grpcClient.unary(
      //   'helloworld.Greeter',
      //   'SayHello',
      //   { name: 'World' },
      //   { ...requestCodec, ...replyCodec }
      // );

      // For now, just verify the client is set up correctly
      expect(grpcClient).toBeDefined();
    });
  });

  describe('unary call with mock server', () => {
    // Helper to create gRPC-Web frame
    function encodeGrpcFrame(data: Uint8Array, isTrailers: boolean = false): Uint8Array {
      const frame = new Uint8Array(5 + data.length);
      frame[0] = isTrailers ? 128 : 0;
      const view = new DataView(frame.buffer);
      view.setUint32(1, data.length, false);
      frame.set(data, 5);
      return frame;
    }

    it('should make unary call with text format', async () => {
      const encoder = new TextEncoder();
      const response = { message: 'Hello' };
      const messageData = encoder.encode(JSON.stringify(response));
      const messageFrame = encodeGrpcFrame(messageData);

      const trailerData = encoder.encode('grpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const fullResponse = new Uint8Array(messageFrame.length + trailerFrame.length);
      fullResponse.set(messageFrame);
      fullResponse.set(trailerFrame, messageFrame.length);

      const base64 = Buffer.from(fullResponse).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/Echo', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
        'grpc-status': '0',
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true
      });

      const codec = jsonCodec<{ name: string }>();
      const result = await grpcClient.unary('test.Service', 'Echo', { name: 'World' }, codec);

      expect(result.message).toEqual({ message: 'Hello' });
      expect(result.status.code).toBe(GrpcStatusCode.OK);
    });

    it('should throw GrpcError on non-OK status', async () => {
      const encoder = new TextEncoder();
      const trailerData = encoder.encode('grpc-status:5\r\ngrpc-message:Not Found\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const base64 = Buffer.from(trailerFrame).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/NotFound', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
        'grpc-status': '5',
        'grpc-message': 'Not Found',
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true
      });

      const codec = jsonCodec<{ name: string }>();

      await expect(
        grpcClient.unary('test.Service', 'NotFound', { name: 'test' }, codec)
      ).rejects.toThrow(GrpcError);
    });

    it('should throw on empty response', async () => {
      const encoder = new TextEncoder();
      const trailerData = encoder.encode('grpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const base64 = Buffer.from(trailerFrame).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/Empty', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true
      });

      const codec = jsonCodec<{ name: string }>();

      await expect(
        grpcClient.unary('test.Service', 'Empty', { name: 'test' }, codec)
      ).rejects.toThrow('No message in response');
    });

    it('should pass call options', async () => {
      const encoder = new TextEncoder();
      const response = { message: 'Hello' };
      const messageData = encoder.encode(JSON.stringify(response));
      const messageFrame = encodeGrpcFrame(messageData);

      const trailerData = encoder.encode('grpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const fullResponse = new Uint8Array(messageFrame.length + trailerFrame.length);
      fullResponse.set(messageFrame);
      fullResponse.set(trailerFrame, messageFrame.length);

      const base64 = Buffer.from(fullResponse).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/Echo', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
        'grpc-status': '0',
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true,
        metadata: { 'x-default': 'header' }
      });

      const codec = jsonCodec<{ name: string }>();
      const result = await grpcClient.unary(
        'test.Service',
        'Echo',
        { name: 'World' },
        codec,
        { metadata: { 'x-custom': 'value' }, timeout: 5000 }
      );

      expect(result.status.code).toBe(GrpcStatusCode.OK);
    });

    it('should call service method', async () => {
      const encoder = new TextEncoder();
      const response = { result: 'success' };
      const messageData = encoder.encode(JSON.stringify(response));
      const messageFrame = encodeGrpcFrame(messageData);

      const trailerData = encoder.encode('grpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const fullResponse = new Uint8Array(messageFrame.length + trailerFrame.length);
      fullResponse.set(messageFrame);
      fullResponse.set(trailerFrame, messageFrame.length);

      const base64 = Buffer.from(fullResponse).toString('base64');

      mockTransport.setMockResponse('POST', '/MyService/DoSomething', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
        'grpc-status': '0',
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const grpcClient = createGrpcWebClient(client, {
        baseUrl: 'https://api.example.com',
        textFormat: true
      });

      const service = grpcClient.service('MyService', {
        DoSomething: {}
      }) as any;

      const result = await service.DoSomething({ input: 'test' });

      expect(result.status.code).toBe(GrpcStatusCode.OK);
    });
  });
});
