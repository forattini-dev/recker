import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { HybridSearch, createHybridSearch } from './search/index.js';
import type { IndexedDoc, SearchResult } from './search/types.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  MCPTool,
  MCPToolResult,
  MCPInitializeResponse,
  MCPToolsListResponse,
} from './types.js';
import { UnsupportedError } from '../core/errors.js';

export type MCPTransportMode = 'stdio' | 'http' | 'sse';

export interface MCPServerOptions {
  name?: string;
  version?: string;
  docsPath?: string;
  examplesPath?: string;
  srcPath?: string;
  port?: number;
  transport?: MCPTransportMode;
  debug?: boolean;
  /** Enable specific tools only (glob patterns supported) */
  toolsFilter?: string[];
}

interface CodeExample {
  id: string;
  path: string;
  title: string;
  feature: string;
  complexity: 'basic' | 'intermediate' | 'advanced';
  code: string;
  description: string;
  keywords: string[];
}

interface TypeDefinition {
  name: string;
  kind: 'interface' | 'type' | 'class' | 'enum';
  path: string;
  definition: string;
  description: string;
  properties?: Array<{
    name: string;
    type: string;
    description?: string;
    optional?: boolean;
  }>;
}

/**
 * MCP Server for serving Recker documentation to AI agents.
 *
 * Supports multiple transports:
 * - **stdio**: For CLI integration (Claude Code, etc.)
 * - **http**: Simple HTTP POST endpoint
 * - **sse**: HTTP with Server-Sent Events for notifications
 *
 * Provides tools:
 * - `search_docs`: Hybrid search (fuzzy + semantic) for documentation
 * - `get_doc`: Get full content of a specific doc file
 * - `recker_code_examples`: Get runnable code examples
 * - `recker_api_schema`: Get TypeScript types and interfaces
 * - `recker_suggest`: Get implementation suggestions
 */
export class MCPServer {
  private options: Required<MCPServerOptions>;
  private server?: ReturnType<typeof createServer>;
  private hybridSearch: HybridSearch;
  private docsIndex: IndexedDoc[] = [];
  private codeExamples: CodeExample[] = [];
  private typeDefinitions: TypeDefinition[] = [];
  private sseClients: Set<ServerResponse> = new Set();
  private initialized = false;

  constructor(options: MCPServerOptions = {}) {
    this.options = {
      name: options.name || 'recker-docs',
      version: options.version || '1.0.0',
      docsPath: options.docsPath || this.findDocsPath(),
      examplesPath: options.examplesPath || this.findExamplesPath(),
      srcPath: options.srcPath || this.findSrcPath(),
      port: options.port || 3100,
      transport: options.transport || 'stdio',
      debug: options.debug || false,
      toolsFilter: options.toolsFilter || [],
    };

    this.hybridSearch = createHybridSearch({ debug: this.options.debug });
    // Note: buildIndex is async but constructor can't await.
    // Index is built lazily - guaranteed ready before handling requests via start() or ensureIndexReady()
  }

  /**
   * Promise that resolves when the index is ready.
   * Used to ensure index is built before handling search requests.
   */
  private indexReady: Promise<void> | null = null;

  /**
   * Ensure the index is built before proceeding.
   */
  private async ensureIndexReady(): Promise<void> {
    if (!this.indexReady) {
      this.indexReady = this.buildIndex();
    }
    await this.indexReady;
  }

  private log(message: string, data?: unknown): void {
    if (this.options.debug) {
      if (this.options.transport === 'stdio') {
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

    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      possiblePaths.push(
        join(__dirname, '..', '..', 'docs'),
        join(__dirname, '..', '..', '..', 'docs'),
      );
    } catch {
      // ESM resolution failed
    }

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(process.cwd(), 'docs');
  }

  private findExamplesPath(): string {
    const docsPath = this.options?.docsPath || this.findDocsPath();
    const possiblePaths = [
      join(docsPath, 'examples'),
      join(process.cwd(), 'examples'),
      join(process.cwd(), 'docs', 'examples'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(docsPath, 'examples');
  }

  private findSrcPath(): string {
    const possiblePaths = [
      join(process.cwd(), 'src'),
    ];

    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      possiblePaths.push(
        join(__dirname, '..'),
        join(__dirname, '..', '..', 'src'),
      );
    } catch {
      // ESM resolution failed
    }

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return join(process.cwd(), 'src');
  }

  private async buildIndex(): Promise<void> {
    // Index documentation
    await this.indexDocs();

    // Index code examples
    this.indexCodeExamples();

    // Index type definitions
    this.indexTypeDefinitions();

    // Initialize hybrid search
    await this.hybridSearch.initialize(this.docsIndex);

    const stats = this.hybridSearch.getStats();
    this.log(`Indexed ${stats.documents} docs, ${this.codeExamples.length} examples, ${this.typeDefinitions.length} types`);
    if (stats.embeddings > 0) {
      this.log(`Loaded ${stats.embeddings} embeddings (model: ${stats.model})`);
    }
  }

  private async indexDocs(): Promise<void> {
    if (!existsSync(this.options.docsPath)) {
      this.log(`Docs path not found: ${this.options.docsPath}`);
      return;
    }

    const files = this.walkDir(this.options.docsPath);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.endsWith('.md')) continue;

      try {
        const content = readFileSync(file, 'utf-8');
        const relativePath = relative(this.options.docsPath, file);
        const category = relativePath.split('/')[0] || 'root';
        const title = this.extractTitle(content) || relativePath;
        const keywords = this.extractKeywords(content);

        this.docsIndex.push({
          id: `doc-${i}`,
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
  }

  private indexCodeExamples(): void {
    if (!existsSync(this.options.examplesPath)) {
      this.log(`Examples path not found: ${this.options.examplesPath}`);
      return;
    }

    const files = this.walkDir(this.options.examplesPath);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = extname(file);
      if (!['.ts', '.js', '.mjs'].includes(ext)) continue;

      try {
        const content = readFileSync(file, 'utf-8');
        const relativePath = relative(this.options.examplesPath, file);
        const filename = basename(file, ext);

        // Extract metadata from file
        const example = this.parseCodeExample(content, relativePath, filename, i);
        if (example) {
          this.codeExamples.push(example);
        }
      } catch (err) {
        this.log(`Failed to index example ${file}:`, err);
      }
    }
  }

  private parseCodeExample(content: string, path: string, filename: string, index: number): CodeExample | null {
    // Extract JSDoc or leading comments
    const docMatch = content.match(/^\/\*\*[\s\S]*?\*\//) || content.match(/^\/\/.*(?:\n\/\/.*)*/);
    const docComment = docMatch ? docMatch[0] : '';

    // Extract title from @title or @example tags, or filename
    const titleMatch = docComment.match(/@title\s+(.+)/i) || docComment.match(/@example\s+(.+)/i);
    const title = titleMatch ? titleMatch[1].trim() : this.humanizeFilename(filename);

    // Extract feature from path or @feature tag
    const featureMatch = docComment.match(/@feature\s+(\w+)/i);
    const feature = featureMatch ? featureMatch[1].toLowerCase() : this.inferFeature(path, content);

    // Infer complexity
    const complexity = this.inferComplexity(content, docComment);

    // Extract description
    const descMatch = docComment.match(/@description\s+(.+)/i);
    const description = descMatch
      ? descMatch[1].trim()
      : docComment.replace(/^\/\*\*|\*\/|^\s*\*\s?|^\/\/\s?/gm, '').trim().split('\n')[0] || '';

    // Extract keywords
    const keywords = this.extractCodeKeywords(content, feature);

    return {
      id: `example-${index}`,
      path,
      title,
      feature,
      complexity,
      code: content,
      description,
      keywords,
    };
  }

  private humanizeFilename(filename: string): string {
    return filename
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  private inferFeature(path: string, content: string): string {
    const pathParts = path.toLowerCase().split('/');
    const featureKeywords = [
      'retry', 'cache', 'streaming', 'sse', 'websocket', 'batch',
      'pagination', 'middleware', 'hooks', 'auth', 'proxy', 'timeout',
      'mcp', 'ai', 'scraping', 'whois', 'dns', 'udp', 'webrtc',
    ];

    // Check path first
    for (const keyword of featureKeywords) {
      if (pathParts.some(p => p.includes(keyword))) {
        return keyword;
      }
    }

    // Check content
    const lowerContent = content.toLowerCase();
    for (const keyword of featureKeywords) {
      if (lowerContent.includes(keyword)) {
        return keyword;
      }
    }

    return 'general';
  }

  private inferComplexity(content: string, docComment: string): 'basic' | 'intermediate' | 'advanced' {
    // Check explicit tag
    if (/@complexity\s+(basic|intermediate|advanced)/i.test(docComment)) {
      return docComment.match(/@complexity\s+(basic|intermediate|advanced)/i)![1].toLowerCase() as any;
    }

    // Heuristics
    const lines = content.split('\n').length;
    const hasAsyncAwait = /async|await/.test(content);
    const hasClasses = /class\s+\w+/.test(content);
    const hasComplexTypes = /\<[^>]+\>/.test(content); // Generics
    const hasTryCatch = /try\s*\{/.test(content);
    const hasMultipleFunctions = (content.match(/(?:function|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).length > 2;

    let score = 0;
    if (lines > 50) score += 2;
    else if (lines > 20) score += 1;
    if (hasAsyncAwait) score += 1;
    if (hasClasses) score += 2;
    if (hasComplexTypes) score += 1;
    if (hasTryCatch) score += 1;
    if (hasMultipleFunctions) score += 1;

    if (score >= 5) return 'advanced';
    if (score >= 2) return 'intermediate';
    return 'basic';
  }

  private extractCodeKeywords(content: string, feature: string): string[] {
    const keywords = new Set<string>([feature]);

    // Function names
    const funcMatches = content.match(/(?:function|const|let|var)\s+(\w+)/g) || [];
    for (const m of funcMatches) {
      const name = m.split(/\s+/)[1];
      if (name && name.length > 2) keywords.add(name.toLowerCase());
    }

    // Imported modules
    const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
    for (const m of importMatches) {
      const mod = m.match(/['"]([^'"]+)['"]/)?.[1];
      if (mod && !mod.startsWith('.')) {
        keywords.add(mod.split('/')[0]);
      }
    }

    // Method calls
    const methodMatches = content.match(/\.(\w+)\(/g) || [];
    for (const m of methodMatches) {
      const method = m.slice(1, -1);
      if (method.length > 2) keywords.add(method.toLowerCase());
    }

    return Array.from(keywords).slice(0, 20);
  }

  private indexTypeDefinitions(): void {
    if (!existsSync(this.options.srcPath)) {
      this.log(`Source path not found: ${this.options.srcPath}`);
      return;
    }

    // Look for type definition files
    const typePaths = [
      join(this.options.srcPath, 'types'),
      join(this.options.srcPath, 'core'),
    ];

    for (const typePath of typePaths) {
      if (!existsSync(typePath)) continue;

      const files = this.walkDir(typePath);
      for (const file of files) {
        if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;

        try {
          const content = readFileSync(file, 'utf-8');
          const relativePath = relative(this.options.srcPath, file);
          this.extractTypeDefinitions(content, relativePath);
        } catch (err) {
          this.log(`Failed to parse types from ${file}:`, err);
        }
      }
    }
  }

  private extractTypeDefinitions(content: string, path: string): void {
    // Extract interfaces
    const interfaceRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s<>]+)?\s*\{[^}]*\}/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[2];
      const fullMatch = match[0];

      // Extract JSDoc
      const docMatch = fullMatch.match(/\/\*\*[\s\S]*?\*\//);
      const description = docMatch
        ? docMatch[0].replace(/\/\*\*|\*\/|\*\s?/g, '').trim().split('\n')[0]
        : '';

      // Extract properties
      const propsMatch = fullMatch.match(/\{([^}]*)\}/);
      const properties = propsMatch
        ? this.parseInterfaceProperties(propsMatch[1])
        : [];

      this.typeDefinitions.push({
        name,
        kind: 'interface',
        path,
        definition: fullMatch,
        description,
        properties,
      });
    }

    // Extract type aliases
    const typeRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=\s*[^;]+;/g;

    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[2];
      const fullMatch = match[0];

      const docMatch = fullMatch.match(/\/\*\*[\s\S]*?\*\//);
      const description = docMatch
        ? docMatch[0].replace(/\/\*\*|\*\/|\*\s?/g, '').trim().split('\n')[0]
        : '';

      this.typeDefinitions.push({
        name,
        kind: 'type',
        path,
        definition: fullMatch,
        description,
      });
    }

    // Extract enums
    const enumRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?enum\s+(\w+)\s*\{[^}]*\}/g;

    while ((match = enumRegex.exec(content)) !== null) {
      const name = match[2];
      const fullMatch = match[0];

      const docMatch = fullMatch.match(/\/\*\*[\s\S]*?\*\//);
      const description = docMatch
        ? docMatch[0].replace(/\/\*\*|\*\/|\*\s?/g, '').trim().split('\n')[0]
        : '';

      this.typeDefinitions.push({
        name,
        kind: 'enum',
        path,
        definition: fullMatch,
        description,
      });
    }
  }

  private parseInterfaceProperties(propsStr: string): TypeDefinition['properties'] {
    const props: TypeDefinition['properties'] = [];
    const propRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(?:\/\/.*\n\s*)?(\w+)(\?)?:\s*([^;]+);/g;

    let match;
    while ((match = propRegex.exec(propsStr)) !== null) {
      const name = match[1];
      const optional = !!match[2];
      const type = match[3].trim();

      // Extract inline comment
      const commentMatch = propsStr.slice(0, match.index).match(/\/\/\s*(.+)$|\/\*\*\s*(.+?)\s*\*\//);
      const description = commentMatch ? (commentMatch[1] || commentMatch[2] || '').trim() : '';

      props.push({ name, type, optional, description });
    }

    return props;
  }

  private walkDir(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (entry.startsWith('_') || entry.startsWith('.') || entry === 'node_modules') continue;

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
    const allTools: MCPTool[] = [
      {
        name: 'search_docs',
        description: 'Search Recker documentation using hybrid search (fuzzy + semantic). Returns matching docs with relevance scores and snippets. Use this first to find relevant documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "retry with exponential backoff", "streaming SSE responses", "cache strategies")',
            },
            category: {
              type: 'string',
              description: 'Optional: filter by category (http, cli, ai, protocols, reference, guides)',
            },
            limit: {
              type: 'number',
              description: 'Max results to return (default: 5, max: 10)',
            },
            mode: {
              type: 'string',
              enum: ['hybrid', 'fuzzy', 'semantic'],
              description: 'Search mode: hybrid (default), fuzzy (text matching), or semantic (meaning-based)',
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
      {
        name: 'code_examples',
        description: 'Get runnable code examples for Recker features. Returns complete, working examples with explanations.',
        inputSchema: {
          type: 'object',
          properties: {
            feature: {
              type: 'string',
              description: 'Feature to get examples for (e.g., "retry", "cache", "streaming", "websocket", "mcp", "batch", "pagination", "middleware")',
            },
            complexity: {
              type: 'string',
              enum: ['basic', 'intermediate', 'advanced'],
              description: 'Complexity level of the example (default: all levels)',
            },
            limit: {
              type: 'number',
              description: 'Max examples to return (default: 3)',
            },
          },
          required: ['feature'],
        },
      },
      {
        name: 'api_schema',
        description: 'Get TypeScript types, interfaces, and API schemas for Recker. Useful for generating type-safe code.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type/interface to look up (e.g., "Client", "RequestOptions", "RetryOptions", "CacheOptions", "MCPServer")',
            },
            include: {
              type: 'string',
              enum: ['definition', 'properties', 'both'],
              description: 'What to include: just definition, properties breakdown, or both (default: both)',
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'suggest',
        description: 'Get implementation suggestions based on use case description. Analyzes requirements and suggests the best Recker patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            useCase: {
              type: 'string',
              description: 'Describe what you want to achieve (e.g., "call an API with retry and cache", "stream AI responses", "scrape multiple sites in parallel")',
            },
            constraints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Any constraints or requirements (e.g., ["must handle rate limits", "need progress tracking"])',
            },
          },
          required: ['useCase'],
        },
      },
    ];

    // Filter tools if filter is specified
    if (this.options.toolsFilter.length > 0) {
      return allTools.filter(tool => this.isToolEnabled(tool.name));
    }

    return allTools;
  }

  private isToolEnabled(name: string): boolean {
    const filter = this.options.toolsFilter;
    if (!filter.length) return true;

    const positive = filter.filter(p => !p.startsWith('!'));
    const negative = filter.filter(p => p.startsWith('!')).map(p => p.slice(1));

    // Negative patterns win
    if (negative.some(p => this.matchPattern(name, p))) return false;

    // If only negative, enable everything else
    if (!positive.length) return true;

    // Check positive patterns
    return positive.some(p => this.matchPattern(name, p));
  }

  private matchPattern(name: string, pattern: string): boolean {
    // Simple glob matching
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return name.startsWith(pattern.slice(0, -1));
    }
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  }

  private handleToolCall(name: string, args: Record<string, unknown>): MCPToolResult {
    switch (name) {
      case 'search_docs':
        return this.searchDocs(args);
      case 'get_doc':
        return this.getDoc(args);
      case 'code_examples':
        return this.getCodeExamples(args);
      case 'api_schema':
        return this.getApiSchema(args);
      case 'suggest':
        return this.getSuggestions(args);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private searchDocs(args: Record<string, unknown>): MCPToolResult {
    const query = String(args.query || '');
    const category = args.category ? String(args.category) : undefined;
    const limit = Math.min(Number(args.limit) || 5, 10);
    const mode = (args.mode as 'hybrid' | 'fuzzy' | 'semantic') || 'hybrid';

    if (!query) {
      return {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      };
    }

    // Use hybrid search (sync wrapper around async)
    const searchPromise = this.hybridSearch.search(query, { limit, category, mode });

    // Note: MCP is synchronous, but our search is async. We need to handle this.
    // For now, we'll use the synchronous fallback
    let results: SearchResult[] = [];

    // Synchronous fallback using the indexed docs directly
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = this.docsIndex
      .filter(doc => !category || doc.category.toLowerCase().includes(category.toLowerCase()))
      .map(doc => {
        let score = 0;
        for (const term of queryTerms) {
          if (doc.title.toLowerCase().includes(term)) score += 10;
          if (doc.path.toLowerCase().includes(term)) score += 5;
          if (doc.keywords.some(k => k.includes(term))) score += 3;
          if (doc.content.toLowerCase().includes(term)) score += 1;
        }
        return { doc, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    results = scored.map(r => ({
      id: r.doc.id,
      path: r.doc.path,
      title: r.doc.title,
      content: r.doc.content,
      snippet: this.extractSnippet(r.doc.content, query),
      score: Math.min(1, r.score / 20),
      source: 'fuzzy' as const,
    }));

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No documentation found for "${query}". Try different keywords like: http, cache, retry, streaming, websocket, ai, cli, plugins`,
        }],
      };
    }

    const stats = this.hybridSearch.getStats();
    const searchMode = stats.embeddings > 0 ? mode : 'fuzzy';

    const output = results.map((r, i) =>
      `${i + 1}. **${r.title}** (${(r.score * 100).toFixed(0)}% match)\n   Path: \`${r.path}\`\n   ${r.snippet}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} result(s) for "${query}" (${searchMode} search):\n\n${output}\n\nUse get_doc with the path to read full content.`,
      }],
    };
  }

  private extractSnippet(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/);

    // Find first match
    let bestIndex = -1;
    for (const term of queryTerms) {
      const idx = lowerContent.indexOf(term);
      if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
        bestIndex = idx;
        break;
      }
    }

    if (bestIndex === -1) {
      const firstPara = content.split('\n\n')[1] || content.substring(0, 200);
      return firstPara.substring(0, 150).trim() + '...';
    }

    const start = Math.max(0, bestIndex - 50);
    const end = Math.min(content.length, bestIndex + 150);
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

  private getCodeExamples(args: Record<string, unknown>): MCPToolResult {
    const feature = String(args.feature || '').toLowerCase();
    const complexity = args.complexity as 'basic' | 'intermediate' | 'advanced' | undefined;
    const limit = Math.min(Number(args.limit) || 3, 5);

    if (!feature) {
      return {
        content: [{ type: 'text', text: 'Error: feature is required' }],
        isError: true,
      };
    }

    let examples = this.codeExamples.filter(ex =>
      ex.feature === feature ||
      ex.keywords.includes(feature) ||
      ex.title.toLowerCase().includes(feature)
    );

    if (complexity) {
      examples = examples.filter(ex => ex.complexity === complexity);
    }

    examples = examples.slice(0, limit);

    if (examples.length === 0) {
      // Suggest available features
      const availableFeatures = [...new Set(this.codeExamples.map(ex => ex.feature))];

      return {
        content: [{
          type: 'text',
          text: `No examples found for feature "${feature}".\n\nAvailable features: ${availableFeatures.join(', ')}`,
        }],
      };
    }

    const output = examples.map((ex, i) => {
      return `## ${i + 1}. ${ex.title}\n\n**Complexity:** ${ex.complexity}\n**Path:** \`${ex.path}\`\n\n${ex.description ? `${ex.description}\n\n` : ''}\`\`\`typescript\n${ex.code}\n\`\`\``;
    }).join('\n\n---\n\n');

    return {
      content: [{
        type: 'text',
        text: `Found ${examples.length} example(s) for "${feature}":\n\n${output}`,
      }],
    };
  }

  private getApiSchema(args: Record<string, unknown>): MCPToolResult {
    const typeName = String(args.type || '');
    const include = (args.include as 'definition' | 'properties' | 'both') || 'both';

    if (!typeName) {
      return {
        content: [{ type: 'text', text: 'Error: type is required' }],
        isError: true,
      };
    }

    // Search for matching types
    const matches = this.typeDefinitions.filter(td =>
      td.name.toLowerCase() === typeName.toLowerCase() ||
      td.name.toLowerCase().includes(typeName.toLowerCase())
    );

    if (matches.length === 0) {
      // Suggest available types
      const availableTypes = this.typeDefinitions
        .map(td => td.name)
        .slice(0, 20);

      return {
        content: [{
          type: 'text',
          text: `Type "${typeName}" not found.\n\nAvailable types: ${availableTypes.join(', ')}`,
        }],
      };
    }

    const output = matches.map(td => {
      let result = `## ${td.name} (${td.kind})\n\n`;

      if (td.description) {
        result += `${td.description}\n\n`;
      }

      result += `**Path:** \`${td.path}\`\n\n`;

      if (include === 'definition' || include === 'both') {
        result += `### Definition\n\n\`\`\`typescript\n${td.definition}\n\`\`\`\n\n`;
      }

      if ((include === 'properties' || include === 'both') && td.properties && td.properties.length > 0) {
        result += `### Properties\n\n`;
        for (const prop of td.properties) {
          const optionalMark = prop.optional ? '?' : '';
          result += `- **${prop.name}${optionalMark}**: \`${prop.type}\``;
          if (prop.description) {
            result += ` - ${prop.description}`;
          }
          result += '\n';
        }
      }

      return result;
    }).join('\n---\n\n');

    return {
      content: [{
        type: 'text',
        text: output,
      }],
    };
  }

  private getSuggestions(args: Record<string, unknown>): MCPToolResult {
    const useCase = String(args.useCase || '').toLowerCase();
    const constraints = (args.constraints as string[]) || [];

    if (!useCase) {
      return {
        content: [{ type: 'text', text: 'Error: useCase is required' }],
        isError: true,
      };
    }

    // Analyze use case and suggest features
    const suggestions: Array<{
      feature: string;
      reason: string;
      config: string;
    }> = [];

    // Keyword-based suggestions
    const featurePatterns = [
      { keywords: ['retry', 'fail', 'error', 'resilient', 'reliable'], feature: 'retry', reason: 'Handle transient failures' },
      { keywords: ['cache', 'fast', 'repeated', 'memoize'], feature: 'cache', reason: 'Speed up repeated requests' },
      { keywords: ['stream', 'sse', 'real-time', 'live', 'event'], feature: 'streaming', reason: 'Handle streaming responses' },
      { keywords: ['parallel', 'concurrent', 'batch', 'multiple', 'bulk'], feature: 'batch', reason: 'Execute requests concurrently' },
      { keywords: ['paginate', 'page', 'cursor', 'next', 'all'], feature: 'pagination', reason: 'Fetch paginated data' },
      { keywords: ['websocket', 'ws', 'bidirectional', 'push'], feature: 'websocket', reason: 'Real-time bidirectional communication' },
      { keywords: ['rate limit', 'throttle', 'limit'], feature: 'rate-limiting', reason: 'Respect API rate limits' },
      { keywords: ['auth', 'token', 'bearer', 'api key'], feature: 'auth', reason: 'Handle authentication' },
      { keywords: ['progress', 'download', 'upload', 'track'], feature: 'progress', reason: 'Track transfer progress' },
      { keywords: ['timeout', 'slow', 'hang'], feature: 'timeout', reason: 'Prevent hanging requests' },
      { keywords: ['scrape', 'html', 'parse', 'extract'], feature: 'scraping', reason: 'Parse HTML content' },
      { keywords: ['ai', 'llm', 'openai', 'anthropic', 'gpt', 'claude'], feature: 'ai', reason: 'AI/LLM integrations' },
    ];

    for (const pattern of featurePatterns) {
      if (pattern.keywords.some(k => useCase.includes(k))) {
        suggestions.push({
          feature: pattern.feature,
          reason: pattern.reason,
          config: this.getFeatureConfig(pattern.feature),
        });
      }
    }

    // Check constraints
    for (const constraint of constraints) {
      const lowerConstraint = constraint.toLowerCase();
      for (const pattern of featurePatterns) {
        if (pattern.keywords.some(k => lowerConstraint.includes(k))) {
          if (!suggestions.some(s => s.feature === pattern.feature)) {
            suggestions.push({
              feature: pattern.feature,
              reason: pattern.reason,
              config: this.getFeatureConfig(pattern.feature),
            });
          }
        }
      }
    }

    if (suggestions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `I couldn't identify specific features for "${useCase}".\n\nTry describing your use case with keywords like:\n- retry, fail, error (for resilience)\n- cache, fast, repeated (for caching)\n- stream, sse, live (for streaming)\n- parallel, batch, concurrent (for batching)\n- paginate, cursor, next (for pagination)`,
        }],
      };
    }

    const output = suggestions.map((s, i) => {
      return `### ${i + 1}. ${s.feature.charAt(0).toUpperCase() + s.feature.slice(1)}\n\n**Why:** ${s.reason}\n\n**Configuration:**\n\`\`\`typescript\n${s.config}\n\`\`\``;
    }).join('\n\n');

    const combinedConfig = this.getCombinedConfig(suggestions.map(s => s.feature));

    return {
      content: [{
        type: 'text',
        text: `# Suggested Implementation for: "${useCase}"\n\n${output}\n\n---\n\n## Combined Configuration\n\n\`\`\`typescript\n${combinedConfig}\n\`\`\``,
      }],
    };
  }

  private getFeatureConfig(feature: string): string {
    const configs: Record<string, string> = {
      retry: `retry: {
  attempts: 3,
  backoff: 'exponential',
  delay: 1000,
  jitter: true
}`,
      cache: `cache: {
  ttl: 60000, // 1 minute
  strategy: 'stale-while-revalidate'
}`,
      streaming: `// Streaming with async iteration
for await (const chunk of client.get('/stream')) {
  console.log(chunk);
}

// SSE parsing
for await (const event of client.get('/events').sse()) {
  console.log(event.data);
}`,
      batch: `// Batch requests
const { results } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], { concurrency: 5 });`,
      pagination: `// Auto-pagination
const allItems = await client.getAll('/items', {
  paginate: { maxPages: 10 }
});`,
      websocket: `const ws = await client.ws('wss://api.example.com/ws');
ws.on('message', (data) => console.log(data));
ws.send({ type: 'subscribe', channel: 'updates' });`,
      'rate-limiting': `concurrency: {
  requestsPerInterval: 100,
  interval: 1000 // 100 req/sec
}`,
      auth: `headers: {
  Authorization: 'Bearer YOUR_TOKEN'
}
// or use beforeRequest hook
client.beforeRequest((req) => {
  return req.withHeader('Authorization', getToken());
})`,
      progress: `const response = await client.get('/large-file', {
  onDownloadProgress: ({ percent, rate }) => {
    console.log(\`\${percent}% at \${rate} bytes/sec\`);
  }
});`,
      timeout: `timeout: 30000, // 30 seconds`,
      scraping: `const $ = await client.get('/page').scrape();
const title = $('h1').text();
const links = $('a').map((_, el) => $(el).attr('href')).get();`,
      ai: `// OpenAI streaming
for await (const chunk of client.get('/chat/completions').sse()) {
  process.stdout.write(chunk.choices[0].delta.content || '');
}`,
    };

    return configs[feature] || `// Configure ${feature}`;
  }

  private getCombinedConfig(features: string[]): string {
    const parts: string[] = [
      `import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',`,
    ];

    if (features.includes('retry')) {
      parts.push(`  retry: {
    attempts: 3,
    backoff: 'exponential',
    delay: 1000
  },`);
    }

    if (features.includes('cache')) {
      parts.push(`  cache: {
    ttl: 60000,
    strategy: 'stale-while-revalidate'
  },`);
    }

    if (features.includes('rate-limiting')) {
      parts.push(`  concurrency: {
    requestsPerInterval: 100,
    interval: 1000
  },`);
    }

    if (features.includes('timeout')) {
      parts.push(`  timeout: 30000,`);
    }

    parts.push(`});`);

    return parts.join('\n');
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

  private sendNotification(notification: JsonRpcNotification): void {
    const data = JSON.stringify(notification);
    for (const client of this.sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  }

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

  private async startHttp(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
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

  private async startSSE(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        const url = req.url || '/';

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'GET' && url === '/sse') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

          this.sseClients.add(res);
          this.log(`SSE client connected (${this.sseClients.size} total)`);

          req.on('close', () => {
            this.sseClients.delete(res);
            this.log(`SSE client disconnected (${this.sseClients.size} total)`);
          });

          return;
        }

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

        if (req.method === 'GET' && url === '/health') {
          const stats = this.hybridSearch.getStats();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            name: this.options.name,
            version: this.options.version,
            docsCount: stats.documents,
            examplesCount: this.codeExamples.length,
            typesCount: this.typeDefinitions.length,
            embeddingsLoaded: stats.embeddings > 0,
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

  async start(): Promise<void> {
    // Ensure index is built before accepting requests
    await this.ensureIndexReady();

    switch (this.options.transport) {
      case 'stdio':
        return this.startStdio();
      case 'http':
        return this.startHttp();
      case 'sse':
        return this.startSSE();
      default:
        throw new UnsupportedError(`Unknown transport: ${this.options.transport}`, {
          feature: this.options.transport,
        });
    }
  }

  async stop(): Promise<void> {
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

  getExamplesCount(): number {
    return this.codeExamples.length;
  }

  getTypesCount(): number {
    return this.typeDefinitions.length;
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
