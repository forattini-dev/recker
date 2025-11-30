import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  MCPTool,
  MCPToolResult,
  MCPServerInfo,
  MCPCapabilities,
  MCPInitializeResponse,
  MCPToolsListResponse,
} from './types.js';

export interface MCPServerOptions {
  name?: string;
  version?: string;
  docsPath?: string;
  port?: number;
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
 * Provides 2 focused tools:
 * - `search_docs`: Search documentation by keyword
 * - `get_doc`: Get full content of a specific doc file
 */
export class MCPServer {
  private options: Required<MCPServerOptions>;
  private server?: ReturnType<typeof createServer>;
  private docsIndex: DocIndex[] = [];

  constructor(options: MCPServerOptions = {}) {
    this.options = {
      name: options.name || 'recker-docs',
      version: options.version || '1.0.0',
      docsPath: options.docsPath || this.findDocsPath(),
      port: options.port || 3100,
      debug: options.debug || false,
    };

    this.buildIndex();
  }

  private findDocsPath(): string {
    // Try to find docs folder relative to common locations
    const possiblePaths = [
      join(process.cwd(), 'docs'),
      join(process.cwd(), '..', 'docs'),
      join(__dirname, '..', '..', 'docs'),
      join(__dirname, '..', '..', '..', 'docs'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(process.cwd(), 'docs');
  }

  private buildIndex(): void {
    if (!existsSync(this.options.docsPath)) {
      if (this.options.debug) {
        console.log(`[MCP] Docs path not found: ${this.options.docsPath}`);
      }
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
        if (this.options.debug) {
          console.log(`[MCP] Failed to index ${file}:`, err);
        }
      }
    }

    if (this.options.debug) {
      console.log(`[MCP] Indexed ${this.docsIndex.length} documentation files`);
    }
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
    // Extract headings, code identifiers, and important terms
    const keywords = new Set<string>();

    // Headings
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) || [];
    for (const h of headings) {
      keywords.add(h.replace(/^#+\s+/, '').toLowerCase());
    }

    // Code blocks with function/class names
    const codePatterns = content.match(/`([a-zA-Z_][a-zA-Z0-9_]*(?:\(\))?)`/g) || [];
    for (const c of codePatterns) {
      keywords.add(c.replace(/`/g, '').toLowerCase());
    }

    // Important terms (capitalized words, likely API names)
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

      // Score based on matches
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
      // Return first paragraph
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

  private handleRequest(req: JsonRpcRequest): JsonRpcResponse {
    const { method, params, id } = req;

    try {
      switch (method) {
        case 'initialize': {
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

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

            if (this.options.debug) {
              console.log('[MCP] Request:', JSON.stringify(request, null, 2));
            }

            const response = this.handleRequest(request);

            if (this.options.debug) {
              console.log('[MCP] Response:', JSON.stringify(response, null, 2));
            }

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
        if (this.options.debug) {
          console.log(`[MCP] Server listening on http://localhost:${this.options.port}`);
          console.log(`[MCP] Docs path: ${this.options.docsPath}`);
          console.log(`[MCP] Indexed ${this.docsIndex.length} files`);
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
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
}

/**
 * Creates and starts an MCP server for Recker documentation.
 */
export function createMCPServer(options?: MCPServerOptions): MCPServer {
  return new MCPServer(options);
}
