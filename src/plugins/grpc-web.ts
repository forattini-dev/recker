/**
 * gRPC-Web Plugin
 * Implements gRPC-Web protocol for browser/Node.js clients
 * https://github.com/grpc/grpc-web
 */

import type { Client } from '../core/client.js';
import type { RequestOptions, ReckerResponse } from '../types/index.js';

export interface GrpcWebOptions {
  /** Base URL for gRPC service */
  baseUrl: string;
  /** Default metadata (headers) */
  metadata?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
  /** Use text format instead of binary (default: true for better compatibility) */
  textFormat?: boolean;
}

export interface GrpcMetadata {
  [key: string]: string;
}

export interface GrpcCallOptions {
  metadata?: GrpcMetadata;
  timeout?: number;
  signal?: AbortSignal;
}

export interface GrpcStatus {
  code: number;
  message: string;
  details?: unknown;
}

export interface GrpcResponse<T> {
  message: T;
  metadata: GrpcMetadata;
  status: GrpcStatus;
}

export interface UnaryCall<TRequest, TResponse> {
  (request: TRequest, options?: GrpcCallOptions): Promise<GrpcResponse<TResponse>>;
}

export interface ServerStreamCall<TRequest, TResponse> {
  (request: TRequest, options?: GrpcCallOptions): AsyncGenerator<TResponse, void, unknown>;
}

// gRPC status codes
export const GrpcStatusCode = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

export type GrpcStatusCodeType = typeof GrpcStatusCode[keyof typeof GrpcStatusCode];

export class GrpcError extends Error {
  public readonly code: GrpcStatusCodeType;
  public readonly metadata: GrpcMetadata;
  public readonly details?: unknown;

  constructor(status: GrpcStatus, metadata: GrpcMetadata = {}) {
    super(status.message);
    this.name = 'GrpcError';
    this.code = status.code as GrpcStatusCodeType;
    this.metadata = metadata;
    this.details = status.details;
  }

  static fromCode(code: GrpcStatusCodeType, message: string): GrpcError {
    return new GrpcError({ code, message }, {});
  }
}

/**
 * Simple message encoder/decoder for gRPC-Web
 * For production, use protobufjs or google-protobuf
 */
export interface MessageCodec<T> {
  encode(message: T): Uint8Array;
  decode(data: Uint8Array): T;
}

/**
 * JSON codec for simple use cases (not standard gRPC, but useful for testing)
 */
export function jsonCodec<T>(): MessageCodec<T> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    encode(message: T): Uint8Array {
      return encoder.encode(JSON.stringify(message));
    },
    decode(data: Uint8Array): T {
      return JSON.parse(decoder.decode(data)) as T;
    },
  };
}

/**
 * gRPC-Web frame format:
 * - 1 byte: flags (0 = data, 128 = trailers)
 * - 4 bytes: length (big-endian)
 * - N bytes: payload
 */
function encodeGrpcFrame(data: Uint8Array, isTrailers: boolean = false): Uint8Array {
  const frame = new Uint8Array(5 + data.length);
  frame[0] = isTrailers ? 128 : 0;
  const view = new DataView(frame.buffer);
  view.setUint32(1, data.length, false); // big-endian
  frame.set(data, 5);
  return frame;
}

function decodeGrpcFrames(data: Uint8Array): Array<{ isTrailers: boolean; payload: Uint8Array }> {
  const frames: Array<{ isTrailers: boolean; payload: Uint8Array }> = [];
  let offset = 0;

  while (offset < data.length) {
    if (offset + 5 > data.length) break;

    const flags = data[offset];
    const isTrailers = (flags & 128) !== 0;
    const view = new DataView(data.buffer, data.byteOffset + offset + 1, 4);
    const length = view.getUint32(0, false);

    if (offset + 5 + length > data.length) break;

    const payload = data.slice(offset + 5, offset + 5 + length);
    frames.push({ isTrailers, payload });
    offset += 5 + length;
  }

  return frames;
}

function parseTrailers(data: Uint8Array): GrpcMetadata {
  const decoder = new TextDecoder();
  const text = decoder.decode(data);
  const metadata: GrpcMetadata = {};

  for (const line of text.split('\r\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return metadata;
}

/**
 * gRPC-Web Client
 *
 * @example
 * ```typescript
 * const grpc = createGrpcWebClient(client, {
 *   baseUrl: 'https://api.example.com'
 * });
 *
 * // Define service
 * const greeter = grpc.service('helloworld.Greeter', {
 *   sayHello: grpc.unary<HelloRequest, HelloReply>(),
 *   sayHelloStream: grpc.serverStream<HelloRequest, HelloReply>()
 * });
 *
 * // Make calls
 * const reply = await greeter.sayHello({ name: 'World' });
 * console.log(reply.message);
 *
 * // Server streaming
 * for await (const reply of greeter.sayHelloStream({ name: 'World' })) {
 *   console.log(reply.message);
 * }
 * ```
 */
export class GrpcWebClient {
  private client: Client;
  private options: Required<GrpcWebOptions>;

  constructor(client: Client, options: GrpcWebOptions) {
    this.client = client;
    this.options = {
      baseUrl: options.baseUrl,
      metadata: options.metadata ?? {},
      timeout: options.timeout ?? 30000,
      textFormat: options.textFormat ?? true,
    };
  }

  /**
   * Make a unary (request-response) call
   */
  async unary<TRequest, TResponse>(
    service: string,
    method: string,
    request: TRequest,
    codec: MessageCodec<TRequest> & MessageCodec<TResponse>,
    options?: GrpcCallOptions
  ): Promise<GrpcResponse<TResponse>> {
    const url = `${this.options.baseUrl}/${service}/${method}`;
    const encoded = codec.encode(request);
    const frame = encodeGrpcFrame(encoded);

    const contentType = this.options.textFormat
      ? 'application/grpc-web-text'
      : 'application/grpc-web+proto';

    const body = this.options.textFormat
      ? btoa(String.fromCharCode(...frame))
      : frame;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Accept': contentType,
      'X-Grpc-Web': '1',
      ...this.options.metadata,
      ...options?.metadata,
    };

    const requestOptions: RequestOptions = {
      headers,
      timeout: options?.timeout ?? this.options.timeout,
      signal: options?.signal,
    };

    const response = await this.client.post(url, body, requestOptions);
    return this.parseUnaryResponse<TResponse>(response, codec as MessageCodec<TResponse>);
  }

  /**
   * Make a server streaming call
   */
  async *serverStream<TRequest, TResponse>(
    service: string,
    method: string,
    request: TRequest,
    codec: MessageCodec<TRequest> & MessageCodec<TResponse>,
    options?: GrpcCallOptions
  ): AsyncGenerator<TResponse, void, unknown> {
    const url = `${this.options.baseUrl}/${service}/${method}`;
    const encoded = codec.encode(request);
    const frame = encodeGrpcFrame(encoded);

    const contentType = this.options.textFormat
      ? 'application/grpc-web-text'
      : 'application/grpc-web+proto';

    const body = this.options.textFormat
      ? btoa(String.fromCharCode(...frame))
      : frame;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Accept': contentType,
      'X-Grpc-Web': '1',
      ...this.options.metadata,
      ...options?.metadata,
    };

    const response = await this.client.post(url, body, {
      headers,
      timeout: options?.timeout ?? this.options.timeout,
      signal: options?.signal,
    });

    // Stream the response
    const stream = response.read();
    if (!stream) {
      throw new GrpcError({ code: GrpcStatusCode.INTERNAL, message: 'No response body' }, {});
    }

    const reader = stream.getReader();
    let buffer = new Uint8Array(0);

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          // Decode if text format
          let chunk = value;
          if (this.options.textFormat) {
            const text = new TextDecoder().decode(value);
            const decoded = atob(text);
            chunk = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
              chunk[i] = decoded.charCodeAt(i);
            }
          }

          // Append to buffer
          const newBuffer = new Uint8Array(buffer.length + chunk.length);
          newBuffer.set(buffer);
          newBuffer.set(chunk, buffer.length);
          buffer = newBuffer;

          // Parse frames
          const frames = decodeGrpcFrames(buffer);
          let consumedBytes = 0;

          for (const frame of frames) {
            consumedBytes += 5 + frame.payload.length;

            if (frame.isTrailers) {
              const trailers = parseTrailers(frame.payload);
              const status = parseInt(trailers['grpc-status'] ?? '0', 10);
              const message = trailers['grpc-message'] ?? '';

              if (status !== GrpcStatusCode.OK) {
                throw new GrpcError({ code: status, message }, trailers);
              }
            } else {
              yield (codec as MessageCodec<TResponse>).decode(frame.payload);
            }
          }

          // Remove consumed bytes from buffer
          if (consumedBytes > 0) {
            buffer = buffer.slice(consumedBytes);
          }
        }

        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create a typed service client
   */
  service<T extends Record<string, unknown>>(
    serviceName: string,
    methods: T
  ): T {
    const service = {} as Record<string, unknown>;

    for (const [methodName, _config] of Object.entries(methods)) {
      service[methodName] = async (request: unknown, options?: GrpcCallOptions) => {
        // Use JSON codec by default for simplicity
        const codec = jsonCodec<unknown>();
        return this.unary(serviceName, methodName, request, codec, options);
      };
    }

    return service as T;
  }

  private async parseUnaryResponse<T>(
    response: ReckerResponse,
    codec: MessageCodec<T>
  ): Promise<GrpcResponse<T>> {
    let data: Uint8Array;

    if (this.options.textFormat) {
      const text = await response.text();
      const decoded = atob(text);
      data = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        data[i] = decoded.charCodeAt(i);
      }
    } else {
      const blob = await response.blob();
      data = new Uint8Array(await blob.arrayBuffer());
    }

    const frames = decodeGrpcFrames(data);
    let message: T | undefined;
    let metadata: GrpcMetadata = {};
    let status: GrpcStatus = { code: GrpcStatusCode.OK, message: '' };

    for (const frame of frames) {
      if (frame.isTrailers) {
        metadata = parseTrailers(frame.payload);
        status = {
          code: parseInt(metadata['grpc-status'] ?? '0', 10),
          message: metadata['grpc-message'] ?? '',
        };
      } else {
        message = codec.decode(frame.payload);
      }
    }

    // Also check response headers for status
    const headerStatus = response.headers.get('grpc-status');
    if (headerStatus) {
      status.code = parseInt(headerStatus, 10);
      status.message = response.headers.get('grpc-message') ?? '';
    }

    if (status.code !== GrpcStatusCode.OK) {
      throw new GrpcError(status, metadata);
    }

    if (message === undefined) {
      throw new GrpcError({ code: GrpcStatusCode.INTERNAL, message: 'No message in response' }, metadata);
    }

    return { message, metadata, status };
  }
}

/**
 * Create a gRPC-Web client
 */
export function createGrpcWebClient(client: Client, options: GrpcWebOptions): GrpcWebClient {
  return new GrpcWebClient(client, options);
}

/**
 * gRPC-Web plugin that adds grpcWeb() method to client
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   plugins: [grpcWeb()]
 * });
 *
 * const grpc = client.grpcWeb();
 * const response = await grpc.unary('Service', 'Method', request, codec);
 * ```
 */
export function grpcWeb() {
  return (client: Client) => {
    (client as Client & { grpcWeb: (options?: Partial<GrpcWebOptions>) => GrpcWebClient }).grpcWeb = (
      options?: Partial<GrpcWebOptions>
    ) => {
      const baseUrl = options?.baseUrl ?? (client as unknown as { config: { baseUrl?: string } }).config?.baseUrl ?? '';
      return createGrpcWebClient(client, { baseUrl, ...options });
    };
  };
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    grpcWeb(options?: Partial<GrpcWebOptions>): GrpcWebClient;
  }
}
