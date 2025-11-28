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

  // Note: Binary format tests are skipped as MockTransport doesn't properly handle Blob responses
  // for binary gRPC-Web format. The text format tests below cover the core functionality.

  describe('GrpcError details', () => {
    it('should store details from status', () => {
      const error = new GrpcError(
        { code: GrpcStatusCode.INVALID_ARGUMENT, message: 'Bad request', details: { field: 'name' } },
        { 'x-debug': 'value' }
      );

      expect(error.details).toEqual({ field: 'name' });
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

    it('should handle error status from header', async () => {
      const encoder = new TextEncoder();
      const trailerData = encoder.encode('grpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      // Message to make it not empty
      const response = { message: 'Hello' };
      const messageData = encoder.encode(JSON.stringify(response));
      const messageFrame = encodeGrpcFrame(messageData);

      const fullResponse = new Uint8Array(messageFrame.length + trailerFrame.length);
      fullResponse.set(messageFrame);
      fullResponse.set(trailerFrame, messageFrame.length);

      const base64 = Buffer.from(fullResponse).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/HeaderError', 200, base64, {
        'Content-Type': 'application/grpc-web-text',
        'grpc-status': '13',  // INTERNAL error from header
        'grpc-message': 'Internal Server Error',
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
        grpcClient.unary('test.Service', 'HeaderError', { name: 'test' }, codec)
      ).rejects.toThrow(GrpcError);
    });

    it('should handle incomplete frames gracefully', async () => {
      // Only partial frame data (less than 5 bytes header)
      const incomplete = new Uint8Array([0, 0, 0]);
      const base64 = Buffer.from(incomplete).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/Incomplete', 200, base64, {
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

      // Should throw because no message
      await expect(
        grpcClient.unary('test.Service', 'Incomplete', { name: 'test' }, codec)
      ).rejects.toThrow('No message in response');
    });

    it('should handle frame with payload exceeding buffer', async () => {
      // Frame header says 1000 bytes but only 5 bytes follow
      const frame = new Uint8Array(10);
      frame[0] = 0; // data frame
      const view = new DataView(frame.buffer);
      view.setUint32(1, 1000, false); // claims 1000 bytes
      // Only 5 more bytes available

      const base64 = Buffer.from(frame).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/BadFrame', 200, base64, {
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

      // Should throw because no message could be parsed
      await expect(
        grpcClient.unary('test.Service', 'BadFrame', { name: 'test' }, codec)
      ).rejects.toThrow('No message in response');
    });

    it('should handle trailer without colon', async () => {
      const encoder = new TextEncoder();
      // Trailer line without colon - should be skipped
      const trailerData = encoder.encode('invalid-line-no-colon\r\ngrpc-status:0\r\ngrpc-message:\r\n');
      const trailerFrame = encodeGrpcFrame(trailerData, true);

      const response = { message: 'Hello' };
      const messageData = encoder.encode(JSON.stringify(response));
      const messageFrame = encodeGrpcFrame(messageData);

      const fullResponse = new Uint8Array(messageFrame.length + trailerFrame.length);
      fullResponse.set(messageFrame);
      fullResponse.set(trailerFrame, messageFrame.length);

      const base64 = Buffer.from(fullResponse).toString('base64');

      mockTransport.setMockResponse('POST', '/test.Service/BadTrailer', 200, base64, {
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
      const result = await grpcClient.unary('test.Service', 'BadTrailer', { name: 'World' }, codec);

      expect(result.message).toEqual({ message: 'Hello' });
    });
  });

  describe('server streaming', () => {
    function encodeGrpcFrame(data: Uint8Array, isTrailers: boolean = false): Uint8Array {
      const frame = new Uint8Array(5 + data.length);
      frame[0] = isTrailers ? 128 : 0;
      const view = new DataView(frame.buffer);
      view.setUint32(1, data.length, false);
      frame.set(data, 5);
      return frame;
    }

    it('should throw when no response body for streaming', async () => {
      mockTransport.setMockResponse('POST', '/test.Service/NoBodyStream', 204, null, {
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

      const stream = grpcClient.serverStream('test.Service', 'NoBodyStream', { name: 'test' }, codec);

      await expect(async () => {
        for await (const _ of stream) {
          // Should throw
        }
      }).rejects.toThrow('No response body');
    });

    // Note: Additional server streaming tests would require integration-level testing
    // with a real gRPC-Web server, as MockTransport doesn't properly preserve
    // ReadableStream bodies through the transport layer.
  });
});
