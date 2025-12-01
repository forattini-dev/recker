import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { createInterface } from 'readline';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  MCPTool,
  MCPToolResult,
  MCPInitializeResponse,
  MCPToolsListResponse,
} from './types.js';

export type MCPTransportMode = 'stdio' | 'http' | 'sse';

export interface MCPServerOptions {
  name?: string;
  version?: string;
  docsPath?: string;
  port?: number;
  transport?: MCPTransportMode;
  debug?: boolean;
}

interface DocIndex {
  path: string;
  title: string;
  category: string;
  content: string;
  keywords: string[];
}

/**
 * MCP Server for serving Recker documentation to AI agents.
 *
 * Supports multiple transports:
 * - **stdio**: For CLI integration (Claude Code, etc.)
 * - **http**: Simple HTTP POST endpoint
 * - **sse**: HTTP with Server-Sent Events for notifications
 *
 * Provides 2 focused tools:
 * - `search_docs`: Search documentation by keyword
 * - `get_doc`: Get full content of a specific doc file
 */
export class MCPServer {
  private options: Required<MCPServerOptions>;
  private server?: ReturnType<typeof createServer>;
  private docsIndex: DocIndex[] = [];
  private sseClients: Set<ServerResponse> = new Set();
  private initialized = false;

  constructor(options: MCPServerOptions = {}) {
    this.options = {
      name: options.name || 'recker-docs',
      version: options.version || '1.0.0',
      docsPath: options.docsPath || this.findDocsPath(),
      port: options.port || 3100,
      transport: options.transport || 'stdio',
      debug: options.debug || false,
    };

    this.buildIndex();
  }

  private log(message: string, data?: unknown): void {
    if (this.options.debug) {
      if (this.options.transport === 'stdio') {
        // In stdio mode, debug goes to stderr to not interfere with protocol
        console.error(`[MCP] ${message}`, data ? JSON.stringify(data) : '');
      } else {
        console.log(`[MCP] ${message}`, data ? JSON.stringify(data) : '');
      }
    }
  }

  private findDocsPath(): string {
    const possiblePaths = [
      join(process.cwd(), 'docs'),
      join(process.cwd(), '..', 'docs'),
    ];

    // Handle both compiled and source paths
    if (typeof __dirname !== 'undefined') {
      possiblePaths.push(
        join(__dirname, '..', '..', 'docs'),
        join(__dirname, '..', '..', '..', 'docs'),
      );
    }

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(process.cwd(), 'docs');
  }

  private buildIndex(): void {
    if (!existsSync(this.options.docsPath)) {
      this.log(`Docs path not found: ${this.options.docsPath}`);
      return;
    }

    const files = this.walkDir(this.options.docsPath);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      try {
        const content = readFileSync(file, 'utf-8');
        const relativePath = relative(this.options.docsPath, file);
        const category = relativePath.split('/')[0] || 'root';
        const title = this.extractTitle(content) || relativePath;
        const keywords = this.extractKeywords(content);

        this.docsIndex.push({
          path: relativePath,
          title,
          category,
          content,
          keywords,
        });
      } catch (err) {
        this.log(`Failed to index ${file}:`, err);
      }
    }

    this.log(`Indexed ${this.docsIndex.length} documentation files`);
  }

  private walkDir(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.')) continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...this.walkDir(fullPath));
        } else if (stat.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }

    return files;
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : '';
  }

  private extractKeywords(content: string): string[] {
    const keywords = new Set<string>();

    const headings = content.match(/^#{1,3}\s+(.+)$/gm) || [];
    for (const h of headings) {
      keywords.add(h.replace(/^#+\s+/, '').toLowerCase());
    }

    const codePatterns = content.match(/`([a-zA-Z_][a-zA-Z0-9_]*(?:\(\))?)`/g) || [];
    for (const c of codePatterns) {
      keywords.add(c.replace(/`/g, '').toLowerCase());
    }

    const terms = content.match(/\b[A-Z][a-zA-Z]+(?:Client|Server|Error|Response|Request|Plugin|Transport)\b/g) || [];
    for (const t of terms) {
      keywords.add(t.toLowerCase());
    }

    return Array.from(keywords).slice(0, 50);
  }

  private getTools(): MCPTool[] {
    return [
      {
        name: 'search_docs',
        description: 'Search Recker documentation by keyword. Returns matching doc files with titles and snippets. Use this first to find relevant documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "retry", "cache", "streaming", "websocket")',
            },
            category: {
              type: 'string',
              description: 'Optional: filter by category (http, cli, ai, protocols, reference, guides)',
            },
            limit: {
              type: 'number',
              description: 'Max results to return (default: 5)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_doc',
        description: 'Get the full content of a specific documentation file. Use the path from search_docs results.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Documentation file path (e.g., "http/07-resilience.md", "cli/01-overview.md")',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  private handleToolCall(name: string, args: Record<string, unknown>): MCPToolResult {
    switch (name) {
      case 'search_docs':
        return this.searchDocs(args);
      case 'get_doc':
        return this.getDoc(args);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private searchDocs(args: Record<string, unknown>): MCPToolResult {
    const query = String(args.query || '').toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : null;
    const limit = Math.min(Number(args.limit) || 5, 10);

    if (!query) {
      return {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      };
    }

    const results: Array<{ doc: DocIndex; score: number; snippet: string }> = [];

    for (const doc of this.docsIndex) {
      if (category && !doc.category.toLowerCase().includes(category)) {
        continue;
      }

      let score = 0;
      const queryTerms = query.split(/\s+/);

      for (const term of queryTerms) {
        if (doc.title.toLowerCase().includes(term)) score += 10;
        if (doc.path.toLowerCase().includes(term)) score += 5;
        if (doc.keywords.some(k => k.includes(term))) score += 3;
        if (doc.content.toLowerCase().includes(term)) score += 1;
      }

      if (score > 0) {
        const snippet = this.extractSnippet(doc.content, query);
        results.push({ doc, score, snippet });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    if (topResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No documentation found for "${query}". Try different keywords like: http, cache, retry, streaming, websocket, ai, cli, plugins`,
        }],
      };
    }

    const output = topResults.map((r, i) =>
      `${i + 1}. **${r.doc.title}**\n   Path: \`${r.doc.path}\`\n   Category: ${r.doc.category}\n   ${r.snippet}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${topResults.length} result(s) for "${query}":\n\n${output}\n\nUse get_doc with the path to read full content.`,
      }],
    };
  }

  private extractSnippet(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const index = lowerContent.indexOf(query.split(/\s+/)[0]);

    if (index === -1) {
      const firstPara = content.split('\n\n')[1] || content.substring(0, 200);
      return firstPara.substring(0, 150).trim() + '...';
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + 150);
    let snippet = content.substring(start, end).trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet.replace(/\n/g, ' ');
  }

  private getDoc(args: Record<string, unknown>): MCPToolResult {
    const path = String(args.path || '');

    if (!path) {
      return {
        content: [{ type: 'text', text: 'Error: path is required' }],
        isError: true,
      };
    }

    const doc = this.docsIndex.find(d => d.path === path || d.path.endsWith(path));

    if (!doc) {
      const suggestions = this.docsIndex
        .filter(d => d.path.includes(path.split('/').pop() || ''))
        .slice(0, 3)
        .map(d => d.path);

      return {
        content: [{
          type: 'text',
          text: `Documentation not found: ${path}${suggestions.length ? `\n\nDid you mean:\n${suggestions.map(s => `- ${s}`).join('\n')}` : ''}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text',
        text: `# ${doc.title}\n\nPath: ${doc.path}\nCategory: ${doc.category}\n\n---\n\n${doc.content}`,
      }],
    };
  }

  handleRequest(req: JsonRpcRequest): JsonRpcResponse {
    const { method, params, id } = req;

    this.log(`Request: ${method}`, params);

    try {
      switch (method) {
        case 'initialize': {
          this.initialized = true;
          const response: MCPInitializeResponse = {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: this.options.name,
              version: this.options.version,
            },
          };
          return { jsonrpc: '2.0', id: id!, result: response };
        }

        case 'notifications/initialized': {
          // Client acknowledged initialization
          return { jsonrpc: '2.0', id: id!, result: {} };
        }

        case 'ping':
          return { jsonrpc: '2.0', id: id!, result: {} };

        case 'tools/list': {
          const response: MCPToolsListResponse = { tools: this.getTools() };
          return { jsonrpc: '2.0', id: id!, result: response };
        }

        case 'tools/call': {
          const { name, arguments: args } = params as { name: string; arguments?: Record<string, unknown> };
          const result = this.handleToolCall(name, args || {});
          return { jsonrpc: '2.0', id: id!, result };
        }

        case 'resources/list':
          return { jsonrpc: '2.0', id: id!, result: { resources: [] } };

        case 'prompts/list':
          return { jsonrpc: '2.0', id: id!, result: { prompts: [] } };

        default:
          return {
            jsonrpc: '2.0',
            id: id!,
            error: { code: -32601, message: `Method not found: ${method}` },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: id!,
        error: { code: -32603, message: String(err) },
      };
    }
  }

  /**
   * Send a notification to all SSE clients
   */
  private sendNotification(notification: JsonRpcNotification): void {
    const data = JSON.stringify(notification);
    for (const client of this.sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  }

  /**
   * Start the server in stdio mode (for CLI integration)
   */
  private async startStdio(): Promise<void> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.log('Starting in stdio mode');

    rl.on('line', (line) => {
      if (!line.trim()) return;

      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = this.handleRequest(request);

        // Write response to stdout
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (err) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 0,
          error: { code: -32700, message: 'Parse error' },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    rl.on('close', () => {
      this.log('stdin closed, exiting');
      process.exit(0);
    });
  }

  /**
   * Start the server in HTTP mode (simple POST endpoint)
   */
  private async startHttp(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const request = JSON.parse(body) as JsonRpcRequest;
            const response = this.handleRequest(request);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error' },
            }));
          }
        });
      });

      this.server.listen(this.options.port, () => {
        this.log(`HTTP server listening on http://localhost:${this.options.port}`);
        resolve();
      });
    });
  }

  /**
   * Start the server in SSE mode (HTTP + Server-Sent Events)
   */
  private async startSSE(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        const url = req.url || '/';

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // SSE endpoint for real-time notifications
        if (req.method === 'GET' && url === '/sse') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          // Send initial connection event
          res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

          this.sseClients.add(res);
          this.log(`SSE client connected (${this.sseClients.size} total)`);

          req.on('close', () => {
            this.sseClients.delete(res);
            this.log(`SSE client disconnected (${this.sseClients.size} total)`);
          });

          return;
        }

        // JSON-RPC endpoint
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const request = JSON.parse(body) as JsonRpcRequest;
              const response = this.handleRequest(request);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
              }));
            }
          });
          return;
        }

        // Health check
        if (req.method === 'GET' && url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            name: this.options.name,
            version: this.options.version,
            docsCount: this.docsIndex.length,
            sseClients: this.sseClients.size,
          }));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.server.listen(this.options.port, () => {
        this.log(`SSE server listening on http://localhost:${this.options.port}`);
        this.log(`  POST /        - JSON-RPC endpoint`);
        this.log(`  GET  /sse     - Server-Sent Events`);
        this.log(`  GET  /health  - Health check`);
        resolve();
      });
    });
  }

  /**
   * Start the MCP server with the configured transport
   */
  async start(): Promise<void> {
    switch (this.options.transport) {
      case 'stdio':
        return this.startStdio();
      case 'http':
        return this.startHttp();
      case 'sse':
        return this.startSSE();
      default:
        throw new Error(`Unknown transport: ${this.options.transport}`);
    }
  }

  async stop(): Promise<void> {
    // Close all SSE clients
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.options.port;
  }

  getDocsCount(): number {
    return this.docsIndex.length;
  }

  getTransport(): MCPTransportMode {
    return this.options.transport;
  }
}

/**
 * Creates an MCP server for Recker documentation.
 *
 * @example
 * ```typescript
 * // stdio mode (for Claude Code)
 * const server = createMCPServer({ transport: 'stdio' });
 * await server.start();
 *
 * // HTTP mode
 * const server = createMCPServer({ transport: 'http', port: 3100 });
 * await server.start();
 *
 * // SSE mode (HTTP + Server-Sent Events)
 * const server = createMCPServer({ transport: 'sse', port: 3100 });
 * await server.start();
 * ```
 */
export function createMCPServer(options?: MCPServerOptions): MCPServer {
  return new MCPServer(options);
}
