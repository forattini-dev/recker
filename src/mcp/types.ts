/**
 * Model Context Protocol (MCP) Types
 * @see https://modelcontextprotocol.io
 */

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// MCP Protocol Types
export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion?: string;
  capabilities?: MCPCapabilities;
}

export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

// Tools
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

// Resources
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64
}

// Prompts
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPContent;
}

// Content Types
export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent;

export interface MCPTextContent {
  type: 'text';
  text: string;
}

export interface MCPImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
}

// MCP Methods
export type MCPMethod =
  | 'initialize'
  | 'ping'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'resources/subscribe'
  | 'resources/unsubscribe'
  | 'prompts/list'
  | 'prompts/get'
  | 'sampling/createMessage'
  | 'logging/setLevel';

// Request/Response Types for Each Method
export interface MCPInitializeRequest {
  protocolVersion: string;
  capabilities: Partial<MCPCapabilities>;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface MCPInitializeResponse {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPServerInfo;
}

export interface MCPToolsListResponse {
  tools: MCPTool[];
}

export interface MCPToolsCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPResourcesListResponse {
  resources: MCPResource[];
}

export interface MCPResourcesReadRequest {
  uri: string;
}

export interface MCPResourcesReadResponse {
  contents: MCPResourceContent[];
}

export interface MCPPromptsListResponse {
  prompts: MCPPrompt[];
}

export interface MCPPromptsGetRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPPromptsGetResponse {
  description?: string;
  messages: MCPPromptMessage[];
}

// Notifications
export type MCPNotification =
  | 'notifications/initialized'
  | 'notifications/progress'
  | 'notifications/message'
  | 'notifications/resources/updated'
  | 'notifications/resources/list_changed'
  | 'notifications/tools/list_changed'
  | 'notifications/prompts/list_changed';

export interface MCPProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
}

// Transport
export interface MCPTransportOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  transport?: any; // Custom transport for testing
}
