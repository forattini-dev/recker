/**
 * JSON-RPC 2.0 Plugin
 * Implements the JSON-RPC 2.0 specification (https://www.jsonrpc.org/specification)
 */

import type { Client } from '../core/client.js';
import type { RequestOptions } from '../types/index.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[] | Record<string, unknown>;
  id?: string | number | null;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcBatchResponse<T = unknown> {
  responses: JsonRpcResponse<T>[];
  errors: JsonRpcError[];
  hasErrors: boolean;
}

// Standard JSON-RPC 2.0 error codes
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Server errors: -32000 to -32099
  SERVER_ERROR: -32000,
} as const;

export class JsonRpcException extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(error: JsonRpcError) {
    super(error.message);
    this.name = 'JsonRpcException';
    this.code = error.code;
    this.data = error.data;
  }

  static isParseError(error: JsonRpcException): boolean {
    return error.code === JsonRpcErrorCodes.PARSE_ERROR;
  }

  static isInvalidRequest(error: JsonRpcException): boolean {
    return error.code === JsonRpcErrorCodes.INVALID_REQUEST;
  }

  static isMethodNotFound(error: JsonRpcException): boolean {
    return error.code === JsonRpcErrorCodes.METHOD_NOT_FOUND;
  }

  static isInvalidParams(error: JsonRpcException): boolean {
    return error.code === JsonRpcErrorCodes.INVALID_PARAMS;
  }

  static isInternalError(error: JsonRpcException): boolean {
    return error.code === JsonRpcErrorCodes.INTERNAL_ERROR;
  }

  static isServerError(error: JsonRpcException): boolean {
    return error.code >= -32099 && error.code <= -32000;
  }
}

export interface JsonRpcClientOptions {
  /** The endpoint URL for JSON-RPC requests */
  endpoint: string;
  /** Default request options */
  requestOptions?: RequestOptions;
  /** Auto-generate request IDs (default: true) */
  autoId?: boolean;
  /** ID generator function */
  idGenerator?: () => string | number;
  /** Throw on RPC errors (default: true) */
  throwOnError?: boolean;
}

/**
 * JSON-RPC 2.0 Client
 *
 * @example
 * ```typescript
 * const rpc = createJsonRpcClient(client, {
 *   endpoint: '/api/jsonrpc'
 * });
 *
 * // Simple call
 * const result = await rpc.call('add', [1, 2]);
 *
 * // Named parameters
 * const user = await rpc.call('getUser', { id: 123 });
 *
 * // Notification (no response expected)
 * await rpc.notify('log', ['User logged in']);
 *
 * // Batch requests
 * const results = await rpc.batch([
 *   { method: 'getUser', params: { id: 1 } },
 *   { method: 'getUser', params: { id: 2 } },
 *   { method: 'getPosts', params: { userId: 1 } }
 * ]);
 * ```
 */
export class JsonRpcClient {
  private client: Client;
  private options: Required<JsonRpcClientOptions>;
  private idCounter: number = 0;

  constructor(client: Client, options: JsonRpcClientOptions) {
    this.client = client;
    this.options = {
      endpoint: options.endpoint,
      requestOptions: options.requestOptions ?? {},
      autoId: options.autoId ?? true,
      idGenerator: options.idGenerator ?? (() => ++this.idCounter),
      throwOnError: options.throwOnError ?? true,
    };
  }

  /**
   * Make a JSON-RPC call and wait for response
   */
  async call<T = unknown>(
    method: string,
    params?: unknown[] | Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    const id = this.options.autoId ? this.options.idGenerator() : null;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      id,
    };

    if (params !== undefined) {
      request.params = params;
    }

    const response = await this.sendRequest<T>(request, options);

    if (response.error) {
      if (this.options.throwOnError) {
        throw new JsonRpcException(response.error);
      }
      return undefined as T;
    }

    return response.result as T;
  }

  /**
   * Send a notification (no response expected)
   */
  async notify(
    method: string,
    params?: unknown[] | Record<string, unknown>,
    options?: RequestOptions
  ): Promise<void> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      // No id for notifications
    };

    if (params !== undefined) {
      request.params = params;
    }

    // Use { json: request } to avoid conflict with params heuristic in requestWithBody
    await this.client.post(this.options.endpoint, {
      ...this.options.requestOptions,
      ...options,
      json: request,
    });
  }

  /**
   * Send batch requests
   */
  async batch<T = unknown>(
    requests: Array<{ method: string; params?: unknown[] | Record<string, unknown>; id?: string | number }>,
    options?: RequestOptions
  ): Promise<JsonRpcBatchResponse<T>> {
    const batchRequests: JsonRpcRequest[] = requests.map((req, index) => ({
      jsonrpc: '2.0' as const,
      method: req.method,
      params: req.params,
      id: req.id ?? (this.options.autoId ? this.options.idGenerator() : index),
    }));

    // Use { json: batchRequests } to ensure it's sent as JSON body
    const response = await this.client.post(this.options.endpoint, {
      ...this.options.requestOptions,
      ...options,
      json: batchRequests,
    });

    const responses = await response.json<JsonRpcResponse<T>[]>();

    const errors = responses
      .filter((r): r is JsonRpcResponse<T> & { error: JsonRpcError } => !!r.error)
      .map((r) => r.error);

    return {
      responses,
      errors,
      hasErrors: errors.length > 0,
    };
  }

  /**
   * Get response for a specific ID from batch results
   */
  getFromBatch<T>(batch: JsonRpcBatchResponse<T>, id: string | number): T | undefined {
    const response = batch.responses.find((r) => r.id === id);
    if (response?.error && this.options.throwOnError) {
      throw new JsonRpcException(response.error);
    }
    return response?.result as T | undefined;
  }

  /**
   * Create a proxy object for calling methods directly
   *
   * @example
   * ```typescript
   * const api = rpc.proxy<{
   *   add(a: number, b: number): number;
   *   getUser(id: number): User;
   * }>();
   *
   * const sum = await api.add(1, 2);
   * const user = await api.getUser(123);
   * ```
   */
  proxy<T extends Record<string, (...args: unknown[]) => unknown>>(): {
    [K in keyof T]: (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>;
  } {
    return new Proxy({} as Record<string, unknown>, {
      get: (_, method: string) => {
        return (...args: unknown[]) => {
          // If single object argument, use as named params
          if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
            return this.call(method, args[0] as Record<string, unknown>);
          }
          // Otherwise use positional params
          return this.call(method, args);
        };
      },
    }) as {
      [K in keyof T]: (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>;
    };
  }

  private async sendRequest<T>(
    request: JsonRpcRequest,
    options?: RequestOptions
  ): Promise<JsonRpcResponse<T>> {
    // Use { json: request } to avoid conflict with params heuristic in requestWithBody
    const response = await this.client.post(this.options.endpoint, {
      ...this.options.requestOptions,
      ...options,
      json: request,
    });

    return response.json<JsonRpcResponse<T>>();
  }
}

/**
 * Create a JSON-RPC 2.0 client
 */
export function createJsonRpcClient(client: Client, options: JsonRpcClientOptions): JsonRpcClient {
  return new JsonRpcClient(client, options);
}

/**
 * JSON-RPC plugin that adds jsonrpc() method to client
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   plugins: [jsonrpc()]
 * });
 *
 * const rpc = client.jsonrpc('/api/rpc');
 * const result = await rpc.call('method', [params]);
 * ```
 */
export function jsonrpc() {
  return (client: Client) => {
    // Extend client with jsonrpc method
    (client as Client & { jsonrpc: (endpoint: string, options?: Omit<JsonRpcClientOptions, 'endpoint'>) => JsonRpcClient }).jsonrpc = (
      endpoint: string,
      options?: Omit<JsonRpcClientOptions, 'endpoint'>
    ) => {
      return createJsonRpcClient(client, { endpoint, ...options });
    };
  };
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    jsonrpc(endpoint: string, options?: Omit<JsonRpcClientOptions, 'endpoint'>): JsonRpcClient;
  }
}
