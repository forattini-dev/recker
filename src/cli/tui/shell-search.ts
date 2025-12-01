/**
 * ShellSearch - Lazy-loaded HybridSearch wrapper for the Recker shell.
 *
 * Features:
 * - Loads embeddings only on first search (lazy loading)
 * - Auto-unloads after idle time to save memory
 * - Provides search, suggest, and example commands
 */

import { HybridSearch, createHybridSearch } from '../../mcp/search/index.js';
import type { IndexedDoc, SearchResult } from '../../mcp/search/types.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
 * Shell search module with lazy loading and auto-unload.
 */
export class ShellSearch {
  private hybridSearch: HybridSearch | null = null;
  private docsIndex: IndexedDoc[] = [];
  private codeExamples: CodeExample[] = [];
  private typeDefinitions: TypeDefinition[] = [];
  private initialized = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private docsPath: string;
  private examplesPath: string;
  private srcPath: string;

  constructor() {
    this.docsPath = this.findDocsPath();
    this.examplesPath = this.findExamplesPath();
    this.srcPath = this.findSrcPath();
  }

  /**
   * Ensure the search engine is initialized (lazy loading).
   */
  private async ensureInitialized(): Promise<void> {
    this.resetIdleTimer();

    if (this.initialized && this.hybridSearch) {
      return;
    }

    this.hybridSearch = createHybridSearch({ debug: false });
    this.buildIndex();
    await this.hybridSearch.initialize(this.docsIndex);
    this.initialized = true;
  }

  /**
   * Reset the idle timer - called on every search operation.
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => this.unload(), IDLE_TIMEOUT_MS);
  }

  /**
   * Unload the search engine to free memory.
   */
  private unload(): void {
    if (this.initialized) {
      this.hybridSearch = null;
      this.docsIndex = [];
      this.codeExamples = [];
      this.typeDefinitions = [];
      this.initialized = false;
    }
  }

  /**
   * Search documentation.
   */
  async search(query: string, options: { limit?: number; category?: string } = {}): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const { limit = 5, category } = options;

    if (!this.hybridSearch) {
      return [];
    }

    return this.hybridSearch.search(query, { limit, category, mode: 'hybrid' });
  }

  /**
   * Get implementation suggestions based on use case.
   */
  async suggest(useCase: string): Promise<string> {
    await this.ensureInitialized();

    // Find relevant documentation
    const results = await this.search(useCase, { limit: 3 });

    if (results.length === 0) {
      return `No suggestions found for: "${useCase}"\n\nTry searching for specific features like:\n  - retry\n  - cache\n  - streaming\n  - websocket\n  - pagination`;
    }

    // Analyze use case and build suggestion
    const useCaseLower = useCase.toLowerCase();
    const suggestions: string[] = [];

    // Configuration suggestions based on keywords
    if (useCaseLower.includes('retry') || useCaseLower.includes('fail') || useCaseLower.includes('error')) {
      suggestions.push(`\n**Retry Configuration:**
\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    attempts: 3,
    backoff: 'exponential',
    jitter: true,
    retryOn: [429, 500, 502, 503, 504]
  }
});
\`\`\``);
    }

    if (useCaseLower.includes('cache') || useCaseLower.includes('storage')) {
      suggestions.push(`\n**Cache Configuration:**
\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    storage: 'memory', // or 'file'
    ttl: 300000, // 5 minutes
    strategy: 'stale-while-revalidate'
  }
});
\`\`\``);
    }

    if (useCaseLower.includes('stream') || useCaseLower.includes('sse') || useCaseLower.includes('ai') || useCaseLower.includes('openai')) {
      suggestions.push(`\n**Streaming Configuration:**
\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.openai.com' });

// SSE streaming
for await (const event of client.post('/v1/chat/completions', { body, stream: true }).sse()) {
  console.log(event.data);
}
\`\`\``);
    }

    if (useCaseLower.includes('parallel') || useCaseLower.includes('batch') || useCaseLower.includes('concurrent')) {
      suggestions.push(`\n**Batch/Parallel Requests:**
\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: { max: 10 }
});

const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], { mapResponse: r => r.json() });
\`\`\``);
    }

    // Add relevant documentation
    let output = `**Suggestion for: "${useCase}"**\n`;

    if (suggestions.length > 0) {
      output += suggestions.join('\n');
    }

    output += `\n\n**Related Documentation:**\n`;
    for (const result of results) {
      output += `  - ${result.title} (${result.path})\n`;
      if (result.snippet) {
        output += `    ${result.snippet.slice(0, 100)}...\n`;
      }
    }

    return output;
  }

  /**
   * Get code examples for a feature.
   */
  async getExamples(feature: string, options: { limit?: number; complexity?: string } = {}): Promise<string> {
    await this.ensureInitialized();

    const { limit = 3, complexity } = options;
    const featureLower = feature.toLowerCase();

    // Filter examples
    let examples = this.codeExamples.filter(ex => {
      const matchesFeature =
        ex.feature.toLowerCase().includes(featureLower) ||
        ex.keywords.some(k => k.toLowerCase().includes(featureLower)) ||
        ex.title.toLowerCase().includes(featureLower);

      const matchesComplexity = !complexity || ex.complexity === complexity;

      return matchesFeature && matchesComplexity;
    });

    if (examples.length === 0) {
      // Try searching docs for examples
      const searchResults = await this.search(`${feature} example`, { limit: 3 });

      if (searchResults.length === 0) {
        return `No examples found for: "${feature}"\n\nAvailable features:\n  - retry, cache, streaming, websocket\n  - pagination, middleware, batch\n  - scraping, load-testing, whois`;
      }

      let output = `**Examples for "${feature}" (from docs):**\n\n`;
      for (const result of searchResults) {
        output += `### ${result.title}\n`;
        // Extract code blocks from content
        const codeBlocks = result.content.match(/```[\s\S]*?```/g) || [];
        if (codeBlocks.length > 0) {
          output += codeBlocks.slice(0, 2).join('\n\n') + '\n\n';
        } else if (result.snippet) {
          output += result.snippet + '\n\n';
        }
      }
      return output;
    }

    // Format examples
    examples = examples.slice(0, limit);

    let output = `**Code Examples for "${feature}":**\n\n`;
    for (const ex of examples) {
      output += `### ${ex.title} (${ex.complexity})\n`;
      output += `${ex.description}\n\n`;
      output += `\`\`\`typescript\n${ex.code}\n\`\`\`\n\n`;
    }

    return output;
  }

  /**
   * Get stats about the search index.
   */
  getStats(): { documents: number; examples: number; types: number; loaded: boolean } {
    return {
      documents: this.docsIndex.length,
      examples: this.codeExamples.length,
      types: this.typeDefinitions.length,
      loaded: this.initialized,
    };
  }

  // ============ Path Finding ============

  private findDocsPath(): string {
    const candidates = [
      join(process.cwd(), 'docs'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../docs'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../../docs'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  private findExamplesPath(): string {
    const candidates = [
      join(process.cwd(), 'examples'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../examples'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  private findSrcPath(): string {
    const candidates = [
      join(process.cwd(), 'src'),
      join(dirname(fileURLToPath(import.meta.url)), '../../'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return candidates[0];
  }

  // ============ Indexing ============

  private buildIndex(): void {
    this.indexDocs();
    this.indexExamples();
    this.indexTypes();
  }

  private indexDocs(): void {
    if (!existsSync(this.docsPath)) return;

    const walkDir = (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (extname(entry) === '.md') {
          const content = readFileSync(fullPath, 'utf-8');
          const relPath = relative(this.docsPath, fullPath);
          const parts = relPath.split('/');
          const category = parts.length > 1 ? parts[0] : 'general';

          // Extract title from first heading
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1] : basename(entry, '.md');

          // Extract keywords from headings and code references
          const keywords = this.extractKeywords(content);

          this.docsIndex.push({
            id: relPath,
            path: relPath,
            title,
            content,
            category,
            keywords,
          });
        }
      }
    };

    walkDir(this.docsPath);
  }

  private indexExamples(): void {
    if (!existsSync(this.examplesPath)) return;

    const walkDir = (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (['.ts', '.js', '.mjs'].includes(extname(entry))) {
          const code = readFileSync(fullPath, 'utf-8');
          const relPath = relative(this.examplesPath, fullPath);

          // Parse example metadata from comments
          const meta = this.parseExampleMeta(code);
          const filename = basename(entry, extname(entry));

          this.codeExamples.push({
            id: relPath,
            path: relPath,
            title: meta.title || filename,
            feature: meta.feature || this.inferFeature(filename, code),
            complexity: meta.complexity || 'basic',
            code: this.extractMainCode(code),
            description: meta.description || '',
            keywords: meta.keywords || this.extractKeywords(code),
          });
        }
      }
    };

    walkDir(this.examplesPath);
  }

  private indexTypes(): void {
    if (!existsSync(this.srcPath)) return;

    const typeFiles = ['types.ts', 'types/index.ts', 'core/types.ts'];

    for (const tf of typeFiles) {
      const fullPath = join(this.srcPath, tf);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, 'utf-8');
      this.parseTypeDefinitions(content, tf);
    }

    // Also check main export files
    const mainFiles = ['index.ts', 'core/client.ts', 'mcp/server.ts'];
    for (const mf of mainFiles) {
      const fullPath = join(this.srcPath, mf);
      if (!existsSync(fullPath)) continue;

      const content = readFileSync(fullPath, 'utf-8');
      this.parseTypeDefinitions(content, mf);
    }
  }

  private extractKeywords(content: string): string[] {
    const keywords: Set<string> = new Set();

    // Headings
    const headings = content.match(/^#+\s+(.+)$/gm) || [];
    for (const h of headings) {
      const text = h.replace(/^#+\s+/, '');
      text.split(/\s+/).forEach(w => {
        if (w.length > 3) keywords.add(w.toLowerCase());
      });
    }

    // Code identifiers
    const identifiers = content.match(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g) || [];
    for (const id of identifiers) {
      keywords.add(id.replace(/`/g, '').toLowerCase());
    }

    // Common HTTP/API terms
    const terms = ['retry', 'cache', 'timeout', 'streaming', 'sse', 'websocket',
                   'middleware', 'plugin', 'hook', 'batch', 'pagination', 'http'];
    for (const term of terms) {
      if (content.toLowerCase().includes(term)) {
        keywords.add(term);
      }
    }

    return Array.from(keywords);
  }

  private parseExampleMeta(code: string): {
    title?: string;
    feature?: string;
    complexity?: 'basic' | 'intermediate' | 'advanced';
    description?: string;
    keywords?: string[];
  } {
    const meta: any = {};

    // Parse JSDoc-style comments
    const docMatch = code.match(/\/\*\*[\s\S]*?\*\//);
    if (docMatch) {
      const doc = docMatch[0];

      const titleMatch = doc.match(/@title\s+(.+)/);
      if (titleMatch) meta.title = titleMatch[1].trim();

      const featureMatch = doc.match(/@feature\s+(.+)/);
      if (featureMatch) meta.feature = featureMatch[1].trim();

      const complexityMatch = doc.match(/@complexity\s+(basic|intermediate|advanced)/);
      if (complexityMatch) meta.complexity = complexityMatch[1] as any;

      const descMatch = doc.match(/\*\s+([^@*\n].+)/);
      if (descMatch) meta.description = descMatch[1].trim();
    }

    return meta;
  }

  private inferFeature(filename: string, code: string): string {
    const nameLower = filename.toLowerCase();
    const codeLower = code.toLowerCase();

    if (nameLower.includes('retry') || codeLower.includes('retry:')) return 'retry';
    if (nameLower.includes('cache') || codeLower.includes('cache:')) return 'cache';
    if (nameLower.includes('stream') || codeLower.includes('.sse(')) return 'streaming';
    if (nameLower.includes('ws') || codeLower.includes('websocket')) return 'websocket';
    if (nameLower.includes('batch') || codeLower.includes('.batch(')) return 'batch';
    if (nameLower.includes('pagin') || codeLower.includes('.paginate(')) return 'pagination';

    return 'general';
  }

  private extractMainCode(code: string): string {
    // Remove leading comments and imports, keep the main code
    const lines = code.split('\n');
    let startIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
          line.startsWith('import') || line.startsWith('export') || line === '') {
        startIndex = i + 1;
      } else {
        break;
      }
    }

    return lines.slice(startIndex).join('\n').trim() || code;
  }

  private parseTypeDefinitions(content: string, path: string): void {
    // Interface definitions
    const interfaceRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?interface\s+(\w+)(?:<[^>]+>)?\s*(?:extends\s+[^{]+)?\{[\s\S]*?\n\}/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const name = match[2];
      const definition = match[0];

      // Extract description from JSDoc
      const docMatch = definition.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
      const description = docMatch
        ? docMatch[1].replace(/\s*\*\s*/g, ' ').trim()
        : '';

      this.typeDefinitions.push({
        name,
        kind: 'interface',
        path,
        definition: definition.replace(/\/\*\*[\s\S]*?\*\/\s*/, '').trim(),
        description,
      });
    }

    // Type aliases
    const typeRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=\s*[^;]+;/g;
    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[2];
      const definition = match[0];

      const docMatch = definition.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
      const description = docMatch
        ? docMatch[1].replace(/\s*\*\s*/g, ' ').trim()
        : '';

      this.typeDefinitions.push({
        name,
        kind: 'type',
        path,
        definition: definition.replace(/\/\*\*[\s\S]*?\*\/\s*/, '').trim(),
        description,
      });
    }
  }
}

// Singleton instance for shell
let shellSearchInstance: ShellSearch | null = null;

export function getShellSearch(): ShellSearch {
  if (!shellSearchInstance) {
    shellSearchInstance = new ShellSearch();
  }
  return shellSearchInstance;
}
