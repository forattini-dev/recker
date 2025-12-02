import { EventEmitter } from 'events';
import { createClient, Client } from '../core/client.js';
import { StateError, ProtocolError } from '../core/errors.js';
import { Logger, consoleLogger } from '../types/logger.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPServerInfo,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptMessage,
  MCPInitializeRequest,
  MCPInitializeResponse,
  MCPToolsListResponse,
  MCPResourcesListResponse,
  MCPResourcesReadRequest,
  MCPResourcesReadResponse,
  MCPPromptsListResponse,
  MCPPromptsGetRequest,
  MCPPromptsGetResponse,
  MCPProgressNotification,
  MCPTransportOptions,
} from './types.js';

export interface MCPClientOptions {
  endpoint: string;
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  transport?: any;
}

interface ResolvedMCPClientOptions {
  endpoint: string;
  clientName: string;
  clientVersion: string;
  protocolVersion: string;
  headers: Record<string, string>;
  timeout: number;
  retries: number;
  debug: boolean;
}

/**
 * MCP (Model Context Protocol) Client for interacting with MCP servers.
 *
 * @example
 * ```typescript
 * const mcp = new MCPClient({
 *   endpoint: 'http://localhost:3000/mcp',
 *   clientName: 'my-app',
 *   clientVersion: '1.0.0'
 * });
 *
 * await mcp.connect();
 *
 * // List available tools
 * const tools = await mcp.tools.list();
 *
 * // Call a tool
 * const result = await mcp.tools.call('get_weather', {
 *   location: 'San Francisco'
 * });
 *
 * // Read a resource
 * const content = await mcp.resources.read('file://data.json');
 * ```
 */
export class MCPClient extends EventEmitter {
  private client: Client;
  private endpoint: string;
  private requestId = 0;
  private serverInfo?: MCPServerInfo;
  private initialized = false;
  private sseConnection?: AbortController;

  public readonly options: ResolvedMCPClientOptions;

  constructor(options: MCPClientOptions) {
    super();

    this.options = {
      endpoint: options.endpoint,
      clientName: options.clientName || 'recker-mcp-client',
      clientVersion: options.clientVersion || '1.0.0',
      protocolVersion: options.protocolVersion || '2024-11-05',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      debug: options.debug || false,
    };

    this.endpoint = this.options.endpoint;
    this.client = createClient({
      baseUrl: this.endpoint,
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
      retry: {
        maxAttempts: this.options.retries,
        backoff: 'exponential',
      },
      transport: options.transport,
    });

    if (this.options.debug) {
      const logger = consoleLogger;
      this.on('request', (req) => logger.debug({ type: 'mcp-request', data: req }, `[MCP Request] ${JSON.stringify(req)}`));
      this.on('response', (res) => logger.debug({ type: 'mcp-response', data: res }, `[MCP Response] ${JSON.stringify(res)}`));
      this.on('notification', (notif) => logger.debug({ type: 'mcp-notification', data: notif }, `[MCP Notification] ${JSON.stringify(notif)}`));
    }
  }

  async connect(): Promise<MCPServerInfo> {
    const response = await this.request<MCPInitializeResponse>('initialize', {
      protocolVersion: this.options.protocolVersion,
      capabilities: {
        tools: {},
        resources: { subscribe: true },
        prompts: {},
      },
      clientInfo: {
        name: this.options.clientName,
        version: this.options.clientVersion,
      },
    } as MCPInitializeRequest);

    this.serverInfo = response.serverInfo;
    this.initialized = true;

    await this.connectSSE();

    this.emit('connected', this.serverInfo);
    return this.serverInfo;
  }

  async disconnect(): Promise<void> {
    if (this.sseConnection) {
      this.sseConnection.abort();
      this.sseConnection = undefined;
    }
    this.initialized = false;
    this.emit('disconnected');
  }

  public readonly tools = {
    list: async (): Promise<MCPTool[]> => {
      const response = await this.request<MCPToolsListResponse>('tools/list');
      return response.tools;
    },

    call: async (name: string, args?: Record<string, unknown>): Promise<MCPToolResult> => {
      const response = await this.request<MCPToolResult>('tools/call', {
        name,
        arguments: args,
      });
      return response;
    },

    get: async (name: string): Promise<MCPTool | undefined> => {
      const tools = await this.tools.list();
      return tools.find(t => t.name === name);
    },
  };

  public readonly resources = {
    list: async (): Promise<MCPResource[]> => {
      const response = await this.request<MCPResourcesListResponse>('resources/list');
      return response.resources;
    },

    read: async (uri: string): Promise<MCPResourceContent[]> => {
      const response = await this.request<MCPResourcesReadResponse>('resources/read', {
        uri,
      } as MCPResourcesReadRequest);
      return response.contents;
    },

    subscribe: async (uri: string): Promise<void> => {
      await this.request('resources/subscribe', { uri });
    },

    unsubscribe: async (uri: string): Promise<void> => {
      await this.request('resources/unsubscribe', { uri });
    },
  };

  public readonly prompts = {
    list: async (): Promise<MCPPrompt[]> => {
      const response = await this.request<MCPPromptsListResponse>('prompts/list');
      return response.prompts;
    },

    get: async (name: string, args?: Record<string, unknown>): Promise<MCPPromptMessage[]> => {
      const response = await this.request<MCPPromptsGetResponse>('prompts/get', {
        name,
        arguments: args,
      } as MCPPromptsGetRequest);
      return response.messages;
    },
  };

  async ping(): Promise<void> {
    await this.request('ping');
  }

  getServerInfo(): MCPServerInfo | undefined {
    return this.serverInfo;
  }

  isConnected(): boolean {
    return this.initialized;
  }

  private async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.initialized && method !== 'initialize') {
      throw new StateError(
        'MCP client not initialized. Call connect() first.',
        {
          expectedState: 'connected',
          actualState: 'disconnected',
        }
      );
    }

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params: params as Record<string, unknown>,
    };

    this.emit('request', request);

    const response = await this.client
      .post('/', { json: request })
      .json<JsonRpcResponse<T>>();

    this.emit('response', response);

    if (response.error) {
      const error = new ProtocolError(
        response.error.message,
        {
          protocol: 'mcp',
          code: response.error.code,
          retriable: false,
        }
      );
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      throw error;
    }

    return response.result as T;
  }

  private async connectSSE(): Promise<void> {
    this.sseConnection = new AbortController();

    try {
      const response = await this.client.get('/sse', {
        signal: this.sseConnection.signal,
      });

      for await (const event of response.sse()) {
        this.handleSSEEvent(event);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this.emit('error', error);
      }
    }
  }

  private handleSSEEvent(event: any): void {
    try {
      const data = JSON.parse(event.data);

      switch (data.method) {
        case 'notifications/progress':
          this.emit('progress', data.params as MCPProgressNotification);
          break;

        case 'notifications/resources/updated':
          this.emit('resource:updated', data.params);
          break;

        case 'notifications/resources/list_changed':
          this.emit('resources:changed');
          break;

        case 'notifications/tools/list_changed':
          this.emit('tools:changed');
          break;

        case 'notifications/prompts/list_changed':
          this.emit('prompts:changed');
          break;

        default:
          this.emit('notification', data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
}

/**
 * Creates a new MCP client instance.
 *
 * @example
 * ```typescript
 * const mcp = createMCPClient({
 *   endpoint: 'http://localhost:3000/mcp'
 * });
 * ```
 */
export function createMCPClient(options: MCPClientOptions): MCPClient {
  return new MCPClient(options);
}
