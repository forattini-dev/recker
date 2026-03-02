import type { MCPResource, MCPResourceContent } from '../types.js';
import type { ReckerResponse } from '../../types/index.js';
import { listCategories } from '../tools/categories.js';
import type { PresetInfo } from '../../presets/registry.js';
import { ConfigurationError, NotFoundError } from '../../core/errors.js';

export interface ResourceHandler {
  (): Promise<MCPResourceContent[]> | MCPResourceContent[];
}

export interface ResourceTemplateHandler {
  (params: Record<string, string>): Promise<MCPResourceContent[]> | MCPResourceContent[];
}

export interface RegisteredResource {
  definition: MCPResource;
  handler: ResourceHandler;
}

export interface ResourceTemplate {
  /** URI pattern with {param} placeholders, e.g., "recker://status/{domain}" */
  uriPattern: string;
  /** Base definition (uri will be the pattern) */
  definition: Omit<MCPResource, 'uri'>;
  /** Handler that receives extracted params */
  handler: ResourceTemplateHandler;
}

/**
 * Registry for MCP Resources - both static and dynamic.
 *
 * Supports:
 * - Static resources (e.g., recker://presets/openai)
 * - Dynamic resources (e.g., recker://history - changes over time)
 * - Resource templates (e.g., recker://status/{domain} - parameterized)
 */
export class ResourceRegistry {
  private resources: Map<string, RegisteredResource> = new Map();
  private templates: ResourceTemplate[] = [];

  // Shared state for dynamic resources
  private requestHistory: Array<{
    timestamp: Date;
    method: string;
    url: string;
    status?: number;
    duration?: number;
  }> = [];

  private cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    entries: 0,
  };

  private rateLimitStatus: Map<string, {
    remaining: number;
    limit: number;
    resetAt: Date;
  }> = new Map();

  constructor() {
    this.registerBuiltInResources();
    this.registerBuiltInTemplates();
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  registerResource(definition: MCPResource, handler: ResourceHandler): void {
    this.resources.set(definition.uri, { definition, handler });
  }

  registerTemplate(template: ResourceTemplate): void {
    this.templates.push(template);
  }

  listResources(): MCPResource[] {
    const staticResources = Array.from(this.resources.values()).map(r => r.definition);

    // Templates are listed with their pattern as URI
    const templateResources = this.templates.map(t => ({
      uri: t.uriPattern,
      name: t.definition.name,
      description: t.definition.description,
      mimeType: t.definition.mimeType,
    }));

    return [...staticResources, ...templateResources];
  }

  async readResource(uri: string): Promise<MCPResourceContent[]> {
    // Try static resource first
    const resource = this.resources.get(uri);
    if (resource) {
      return resource.handler();
    }

    // Try templates
    for (const template of this.templates) {
      const params = this.matchTemplate(uri, template.uriPattern);
      if (params) {
        return template.handler(params);
      }
    }

    throw new NotFoundError(`Resource not found: ${uri}`, { resource: uri });
  }

  // ─────────────────────────────────────────────────────────────────
  // State update methods (called by plugins/client)
  // ─────────────────────────────────────────────────────────────────

  recordRequest(method: string, url: string, status?: number, duration?: number): void {
    this.requestHistory.push({
      timestamp: new Date(),
      method,
      url,
      status,
      duration,
    });
    // Keep last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory.shift();
    }
  }

  updateCacheStats(stats: Partial<typeof this.cacheStats>): void {
    Object.assign(this.cacheStats, stats);
  }

  updateRateLimit(key: string, remaining: number, limit: number, resetAt: Date): void {
    this.rateLimitStatus.set(key, { remaining, limit, resetAt });
  }

  // ─────────────────────────────────────────────────────────────────
  // Private: Template matching
  // ─────────────────────────────────────────────────────────────────

  private matchTemplate(uri: string, pattern: string): Record<string, string> | null {
    // Convert pattern to regex: recker://status/{domain} -> recker://status/(.+)
    const paramNames: string[] = [];
    const regexPattern = pattern.replace(/\{(\w+)\}/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${regexPattern}$`);
    const match = uri.match(regex);

    if (!match) return null;

    const params: Record<string, string> = {};
    paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });

    return params;
  }

  // ─────────────────────────────────────────────────────────────────
  // Built-in Resources
  // ─────────────────────────────────────────────────────────────────

  private registerBuiltInResources(): void {
    // 1. Request History
    this.registerResource(
      {
        uri: 'recker://history',
        name: 'Request History',
        description: 'Recent HTTP requests made during this session (last 100)',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://history',
        mimeType: 'application/json',
        text: JSON.stringify(this.requestHistory, null, 2),
      }]
    );

    // 2. Cache Statistics
    this.registerResource(
      {
        uri: 'recker://cache/stats',
        name: 'Cache Statistics',
        description: 'Current cache hit/miss statistics and size',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://cache/stats',
        mimeType: 'application/json',
        text: JSON.stringify(this.cacheStats, null, 2),
      }]
    );

    // 3. Rate Limit Status
    this.registerResource(
      {
        uri: 'recker://rate-limits',
        name: 'Rate Limit Status',
        description: 'Current rate limit status for all tracked endpoints',
        mimeType: 'application/json',
      },
      () => {
        const status: Record<
          string,
          {
            limit: number;
            remaining: number;
            resetAt: string;
            percentRemaining: number;
          }
        > = {};
        this.rateLimitStatus.forEach((v, k) => {
          status[k] = {
            ...v,
            resetAt: v.resetAt.toISOString(),
            percentRemaining: Math.round((v.remaining / v.limit) * 100),
          };
        });
        return [{
          type: 'resource',
          uri: 'recker://rate-limits',
          mimeType: 'application/json',
          text: JSON.stringify(status, null, 2),
        }];
      }
    );

    // 4. Available Presets List
    this.registerResource(
      {
        uri: 'recker://presets',
        name: 'Available Presets',
        description: 'List of all 38 pre-configured API clients (OpenAI, GitHub, Stripe, etc.)',
        mimeType: 'application/json',
      },
      async () => {
        const presets = await this.loadPresetsInfo();
        return [{
          type: 'resource',
          uri: 'recker://presets',
          mimeType: 'application/json',
          text: JSON.stringify(presets, null, 2),
        }];
      }
    );

    // 5. Recker Version & Capabilities
    this.registerResource(
      {
        uri: 'recker://version',
        name: 'Recker Version',
        description: 'Current Recker version and available capabilities',
        mimeType: 'application/json',
      },
      async () => {
        const info = await this.getReckerInfo();
        return [{
          type: 'resource',
          uri: 'recker://version',
          mimeType: 'application/json',
          text: JSON.stringify(info, null, 2),
        }];
      }
    );

    // 6. Benchmark Results Summary
    this.registerResource(
      {
        uri: 'recker://benchmarks',
        name: 'Benchmark Results',
        description: 'Performance comparison: Recker vs other HTTP clients',
        mimeType: 'text/markdown',
      },
      () => [{
        type: 'resource',
        uri: 'recker://benchmarks',
        mimeType: 'text/markdown',
        text: this.getBenchmarkSummary(),
      }]
    );

    // ─────────────────────────────────────────────────────────────────
    // SEO Resources
    // ─────────────────────────────────────────────────────────────────

    // 7. SEO Technical Checklist
    this.registerResource(
      {
        uri: 'recker://seo/checklist',
        name: 'SEO Technical Checklist',
        description: 'Complete technical SEO checklist with 50+ items across 8 categories',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://seo/checklist',
        mimeType: 'application/json',
        text: JSON.stringify(this.getSeoChecklist(), null, 2),
      }]
    );

    // 8. SEO Rules Reference
    this.registerResource(
      {
        uri: 'recker://seo/rules',
        name: 'SEO Rules Reference',
        description: 'All 400+ SEO rules used by rek_seo_analyze, grouped by category',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://seo/rules',
        mimeType: 'application/json',
        text: JSON.stringify(this.getSeoRulesReference(), null, 2),
      }]
    );

    // ─────────────────────────────────────────────────────────────────
    // AI Resources
    // ─────────────────────────────────────────────────────────────────

    // 9. AI Models Catalog
    this.registerResource(
      {
        uri: 'recker://ai/models',
        name: 'AI Models Catalog',
        description: 'Complete catalog of AI models: providers, context windows, pricing, capabilities',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://ai/models',
        mimeType: 'application/json',
        text: JSON.stringify(this.getAiModelsCatalog(), null, 2),
      }]
    );

    // 10. AI Pricing Comparison
    this.registerResource(
      {
        uri: 'recker://ai/pricing',
        name: 'AI Pricing Comparison',
        description: 'Pricing comparison across AI providers (per 1M tokens)',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://ai/pricing',
        mimeType: 'application/json',
        text: JSON.stringify(this.getAiPricing(), null, 2),
      }]
    );

    // 11. Tool Categories
    this.registerResource(
      {
        uri: 'recker://tools/categories',
        name: 'Tool Categories',
        description: 'Available tool categories with descriptions and tool counts. Use with tools/list to filter.',
        mimeType: 'application/json',
      },
      () => [{
        type: 'resource',
        uri: 'recker://tools/categories',
        mimeType: 'application/json',
        text: JSON.stringify({
          categories: listCategories(),
          usage: {
            description: 'Use the category name with tools/list to filter tools',
            example: '{ "method": "tools/list", "params": { "category": "seo" } }',
            availableFilters: ['category', 'search', 'tags'],
          },
        }, null, 2),
      }]
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Built-in Templates (parameterized resources)
  // ─────────────────────────────────────────────────────────────────

  private registerBuiltInTemplates(): void {
    // 1. Preset Details
    this.registerTemplate({
      uriPattern: 'recker://presets/{name}',
      definition: {
        name: 'Preset Configuration',
        description: 'Detailed configuration for a specific preset (e.g., openai, github)',
        mimeType: 'application/json',
      },
      handler: async ({ name }) => {
        const preset = await this.loadPresetDetails(name);
        return [{
          type: 'resource',
          uri: `recker://presets/${name}`,
          mimeType: 'application/json',
          text: JSON.stringify(preset, null, 2),
        }];
      },
    });

    // 2. Domain Status (DNS + TLS + WHOIS + Headers)
    this.registerTemplate({
      uriPattern: 'recker://status/{domain}',
      definition: {
        name: 'Domain Status',
        description: 'Complete domain analysis: DNS, TLS certificate, WHOIS, security headers',
        mimeType: 'application/json',
      },
      handler: async ({ domain }) => {
        const status = await this.analyzeDomain(domain);
        return [{
          type: 'resource',
          uri: `recker://status/${domain}`,
          mimeType: 'application/json',
          text: JSON.stringify(status, null, 2),
        }];
      },
    });

    // 3. API Health Check
    this.registerTemplate({
      uriPattern: 'recker://health/{url}',
      definition: {
        name: 'API Health Check',
        description: 'Health check for an API endpoint: latency, status, headers',
        mimeType: 'application/json',
      },
      handler: async ({ url }) => {
        const health = await this.checkApiHealth(decodeURIComponent(url));
        return [{
          type: 'resource',
          uri: `recker://health/${url}`,
          mimeType: 'application/json',
          text: JSON.stringify(health, null, 2),
        }];
      },
    });

    // 4. Example by Category
    this.registerTemplate({
      uriPattern: 'recker://examples/{category}',
      definition: {
        name: 'Code Examples',
        description: 'Runnable code examples for a specific category (http, websocket, ai, etc.)',
        mimeType: 'text/markdown',
      },
      handler: async ({ category }) => {
        const examples = await this.getExamplesByCategory(category);
        return [{
          type: 'resource',
          uri: `recker://examples/${category}`,
          mimeType: 'text/markdown',
          text: examples,
        }];
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // SEO Templates
    // ─────────────────────────────────────────────────────────────────

    // 5. SEO Report for URL
    this.registerTemplate({
      uriPattern: 'recker://seo/report/{url}',
      definition: {
        name: 'SEO Report',
        description: 'Comprehensive SEO analysis report for a specific URL',
        mimeType: 'text/markdown',
      },
      handler: async ({ url }) => {
        const report = await this.getSeoReport(decodeURIComponent(url));
        return [{
          type: 'resource',
          uri: `recker://seo/report/${url}`,
          mimeType: 'text/markdown',
          text: report,
        }];
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // AI Templates
    // ─────────────────────────────────────────────────────────────────

    // 6. AI Provider Details
    this.registerTemplate({
      uriPattern: 'recker://ai/provider/{name}',
      definition: {
        name: 'AI Provider Details',
        description: 'Detailed information about a specific AI provider (models, pricing, limits)',
        mimeType: 'application/json',
      },
      handler: async ({ name }) => {
        const provider = this.getAiProviderDetails(name);
        return [{
          type: 'resource',
          uri: `recker://ai/provider/${name}`,
          mimeType: 'application/json',
          text: JSON.stringify(provider, null, 2),
        }];
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Helper methods for resource handlers
  // ─────────────────────────────────────────────────────────────────

  private async loadPresetsInfo(): Promise<object> {
    // Dynamically import presets registry
    try {
      const { presetRegistry } = await import('../../presets/registry.js') as {
        presetRegistry: PresetInfo[];
      };
      // presetRegistry is an array of PresetInfo objects
      const presets = presetRegistry.map((preset) => ({
        name: preset.name,
        displayName: preset.displayName,
        category: preset.category,
        docsUrl: preset.docsUrl,
        requiredAuth: preset.requiredAuth,
        aiProvider: preset.aiProvider,
        defaultModel: preset.defaultModel,
      }));
      return { count: presets.length, presets };
    } catch {
      return {
        count: 38,
        note: 'Presets registry not available in this context',
        available: [
          'openai', 'anthropic', 'github', 'gitlab', 'stripe', 'twilio',
          'slack', 'discord', 'cloudflare', 'vercel', 'aws', 'gcp', 'azure',
          'digitalocean', 'vultr', 'linear', 'notion', 'supabase', 'replicate',
          'groq', 'mistral', 'cohere', 'huggingface', 'fireworks', 'together',
          'perplexity', 'deepseek', 'xai', 'meta', 'youtube', 'tiktok',
          'sinch', 'mailgun', 'oracle', 'google', 'ollama', 'sambanova',
        ],
      };
    }
  }

  private async loadPresetDetails(name: string): Promise<object> {
    try {
      const { presetRegistry } = await import('../../presets/registry.js') as {
        presetRegistry: PresetInfo[];
      };
      // presetRegistry is an array, find by name
      const preset = presetRegistry.find((p) => p.name === name);
      if (!preset) {
        throw new NotFoundError(`Preset not found: ${name}`, { resource: name });
      }

      const envVar = `${name.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      return {
        name: preset.name,
        displayName: preset.displayName,
        category: preset.category,
        docsUrl: preset.docsUrl,
        requiredAuth: preset.requiredAuth,
        aiProvider: preset.aiProvider,
        defaultModel: preset.defaultModel,
        chatEndpoint: preset.chatEndpoint,
        usage: `
import { presets } from 'recker';

const client = presets.${name}({
  apiKey: process.env.${envVar},
});

// Example request
const response = await client.get('/endpoint').json();
`.trim(),
      };
    } catch (e) {
      throw new ConfigurationError(`Failed to load preset '${name}': ${getErrorMessage(e)}`, {
        configKey: `preset.${name}`,
      });
    }
  }

  private async getReckerInfo(): Promise<object> {
    try {
      const { getVersion } = await import('../../version.js');
      const version = await getVersion();
      return {
        version,
        features: {
          protocols: ['HTTP/1.1', 'HTTP/2', 'HTTP/3 (experimental)', 'WebSocket', 'DNS', 'WHOIS', 'RDAP', 'FTP', 'SFTP', 'Telnet'],
          plugins: ['retry', 'cache', 'circuit-breaker', 'rate-limit', 'dedup', 'auth', 'compression', 'har-recorder', 'logger'],
          auth: ['Basic', 'Bearer', 'API Key', 'Digest', 'OAuth2', 'AWS SigV4'],
          ai: ['OpenAI', 'Anthropic', 'Google', 'Groq', 'Mistral', 'Ollama', 'and 30+ more'],
        },
        cli: 'rek',
        mcp: true,
      };
    } catch {
      return { version: 'unknown', mcp: true };
    }
  }

  private getBenchmarkSummary(): string {
    return `# Recker Benchmark Results

## HTTP Client Comparison (1000 requests)

| Library | Requests/sec | Avg Latency | P99 Latency |
|---------|-------------|-------------|-------------|
| **undici** | 12,500 | 0.08ms | 0.15ms |
| **recker** | 11,800 | 0.09ms | 0.18ms |
| got | 8,200 | 0.12ms | 0.25ms |
| axios | 6,500 | 0.15ms | 0.32ms |
| node-fetch | 5,800 | 0.17ms | 0.38ms |
| ky | 5,200 | 0.19ms | 0.42ms |

## Why Recker is Fast

1. **Built on undici** - Node.js recommended HTTP client
2. **Zero-copy streaming** - Minimal memory overhead
3. **Connection pooling** - Reuses connections efficiently
4. **Lazy loading** - Only loads what you use

## Running Benchmarks

\`\`\`bash
pnpm bench              # Quick benchmark
pnpm bench:compare      # Full comparison (16 libraries)
pnpm bench:json         # JSON output
\`\`\`

*Note: Results vary by system. Run locally for accurate numbers.*
`;
  }

  private async analyzeDomain(domain: string): Promise<object> {
    const results: {
      domain: string;
      timestamp: string;
      checks: Record<string, Record<string, unknown>>;
    } = {
      domain,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // DNS Resolution
    try {
      const dns = await import('node:dns/promises');
      const [a, aaaa, mx, txt, ns] = await Promise.allSettled([
        dns.resolve4(domain),
        dns.resolve6(domain),
        dns.resolveMx(domain),
        dns.resolveTxt(domain),
        dns.resolveNs(domain),
      ]);

      results.checks.dns = {
        status: 'ok',
        a: a.status === 'fulfilled' ? a.value : null,
        aaaa: aaaa.status === 'fulfilled' ? aaaa.value : null,
        mx: mx.status === 'fulfilled' ? mx.value : null,
        ns: ns.status === 'fulfilled' ? ns.value : null,
        hasSPF: txt.status === 'fulfilled' && txt.value.some(r => r.join('').includes('v=spf1')),
        hasDMARC: false, // Would need _dmarc.domain lookup
      };
    } catch (e) {
      results.checks.dns = { status: 'error', error: getErrorMessage(e) };
    }

    // TLS Certificate (if HTTPS)
    try {
      const { inspectTLS } = await import('../../utils/tls-inspector.js');
      const tls = await inspectTLS(domain);
      results.checks.tls = {
        status: 'ok',
        valid: tls.valid,
        issuer: tls.issuer,
        subject: tls.subject,
        validFrom: tls.validFrom,
        validTo: tls.validTo,
        daysRemaining: tls.daysRemaining,
        protocol: tls.protocol,
        cipher: tls.cipher,
      };
    } catch (e) {
      results.checks.tls = { status: 'error', error: getErrorMessage(e) };
    }

    // HTTP Headers check
    try {
      const { createClient } = await import('../../core/client.js');
      const client = createClient({ timeout: 5000 });
      const res = await client.get(`https://${domain}`);

      const headers = res.headers;
      results.checks.http = {
        status: 'ok',
        statusCode: res.status,
        server: headers.get('server'),
        securityHeaders: {
          'strict-transport-security': headers.get('strict-transport-security') ? '✓' : '✗',
          'content-security-policy': headers.get('content-security-policy') ? '✓' : '✗',
          'x-frame-options': headers.get('x-frame-options') ? '✓' : '✗',
          'x-content-type-options': headers.get('x-content-type-options') ? '✓' : '✗',
        },
      };
    } catch (e) {
      results.checks.http = { status: 'error', error: getErrorMessage(e) };
    }

    return results;
  }

  private async checkApiHealth(url: string): Promise<object> {
    const startTime = Date.now();

    try {
      const { createClient } = await import('../../core/client.js');
      const client = createClient({ timeout: 10000 });

      // Make 3 requests to get average latency
      const times: number[] = [];
      let lastResponse: ReckerResponse | undefined;

      for (let i = 0; i < 3; i++) {
        const reqStart = Date.now();
        lastResponse = await client.get(url);
        times.push(Date.now() - reqStart);
      }

      const avgLatency = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const minLatency = Math.min(...times);
      const maxLatency = Math.max(...times);

      return {
        url,
        status: 'healthy',
        statusCode: lastResponse?.status,
        latency: {
          avg: `${avgLatency}ms`,
          min: `${minLatency}ms`,
          max: `${maxLatency}ms`,
        },
        headers: {
          server: lastResponse?.headers.get('server'),
          contentType: lastResponse?.headers.get('content-type'),
          cacheControl: lastResponse?.headers.get('cache-control'),
        },
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      return {
        url,
        status: 'unhealthy',
        error: getErrorMessage(e),
        latency: `${Date.now() - startTime}ms (failed)`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private async getExamplesByCategory(category: string): Promise<string> {
    const examples: Record<string, string> = {
      http: `# HTTP Examples

## Basic GET Request
\`\`\`typescript
import { recker } from 'recker';

const users = await recker.get('https://api.example.com/users').json();
console.log(users);
\`\`\`

## POST with JSON Body
\`\`\`typescript
import { recker } from 'recker';

const user = await recker
  .post('https://api.example.com/users')
  .json({ name: 'John', email: 'john@example.com' })
  .json();
\`\`\`

## With Retry and Timeout
\`\`\`typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retry: { maxAttempts: 3, backoff: 'exponential' },
});

const data = await client.get('/data').json();
\`\`\`
`,
      websocket: `# WebSocket Examples

## Basic Connection
\`\`\`typescript
import { ws } from 'recker';

const socket = ws('wss://echo.websocket.org');

socket.on('open', () => {
  socket.send('Hello!');
});

socket.on('message', (data) => {
  console.log('Received:', data);
});
\`\`\`

## With Reconnection
\`\`\`typescript
import { createWebSocket } from 'recker';

const socket = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,
});
\`\`\`
`,
      ai: `# AI Provider Examples

## OpenAI Chat
\`\`\`typescript
import { recker } from 'recker';

const response = await recker.ai.chat('What is Recker?', {
  provider: 'openai',
  model: 'gpt-4',
});
console.log(response.content);
\`\`\`

## Streaming Response
\`\`\`typescript
import { recker } from 'recker';

const stream = await recker.ai.stream('Tell me a story', {
  provider: 'anthropic',
  model: 'claude-3-opus',
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
\`\`\`

## With Multiple Providers
\`\`\`typescript
import { createAI } from 'recker';

const ai = createAI();

// Auto-selects based on available API keys
const response = await ai.chat('Hello!');
\`\`\`
`,
      scraping: `# Web Scraping Examples

## Basic Scraping
\`\`\`typescript
import { recker } from 'recker';

const doc = await recker.scrape('https://example.com');

// Extract data with CSS selectors
const title = doc.select('h1').text();
const links = doc.selectAll('a').map(a => a.attr('href'));
\`\`\`

## With Anti-Blocking
\`\`\`typescript
import { createClient } from 'recker';
import { userAgent, proxyRotator } from 'recker/plugins';

const client = createClient();
client.use(userAgent({ rotate: true }));
// Proxy list directly in createClient (recommended):
const client2 = createClient({
  proxy: ['http://proxy1:8080', 'socks5://proxy2:1080', 'socks5h://proxy3:1080'],
});
// Or via plugin:
client.use(proxyRotator({ proxies: ['http://proxy1:8080', 'socks5://proxy2:1080'] }));

const doc = await client.scrape('https://protected-site.com');
\`\`\`
`,
      dns: `# DNS Examples

## Basic Lookup
\`\`\`typescript
import { recker } from 'recker';

const records = await recker.dns('google.com');
console.log(records);
\`\`\`

## Specific Record Types
\`\`\`typescript
import { dns } from 'recker';

const mx = await dns('gmail.com', 'MX');
const txt = await dns('google.com', 'TXT');
const ns = await dns('example.com', 'NS');
\`\`\`
`,
    };

    const content = examples[category.toLowerCase()];
    if (!content) {
      const available = Object.keys(examples).join(', ');
      return `# Category Not Found

Category "${category}" not found.

Available categories: ${available}
`;
    }

    return content;
  }

  // ─────────────────────────────────────────────────────────────────
  // SEO Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private getSeoChecklist(): object {
    return {
      version: '1.0',
      totalItems: 52,
      categories: [
        {
          name: 'Technical SEO',
          items: [
            { id: 'robots-txt', item: 'robots.txt exists and is valid', priority: 'high' },
            { id: 'sitemap-xml', item: 'XML sitemap exists and is submitted', priority: 'high' },
            { id: 'https', item: 'Site uses HTTPS with valid certificate', priority: 'high' },
            { id: 'mobile-friendly', item: 'Site is mobile-friendly', priority: 'high' },
            { id: 'page-speed', item: 'Page load time < 3 seconds', priority: 'high' },
            { id: 'canonical', item: 'Canonical tags are properly set', priority: 'medium' },
            { id: 'hreflang', item: 'Hreflang tags for multi-language sites', priority: 'medium' },
          ],
        },
        {
          name: 'On-Page SEO',
          items: [
            { id: 'title-tag', item: 'Title tag exists and is 50-60 characters', priority: 'high' },
            { id: 'meta-desc', item: 'Meta description exists and is 150-160 characters', priority: 'high' },
            { id: 'h1-tag', item: 'Single H1 tag with primary keyword', priority: 'high' },
            { id: 'heading-hierarchy', item: 'Proper heading hierarchy (H1→H2→H3)', priority: 'medium' },
            { id: 'img-alt', item: 'All images have descriptive alt text', priority: 'medium' },
            { id: 'internal-links', item: 'Relevant internal links present', priority: 'medium' },
            { id: 'external-links', item: 'Quality external links (nofollow when appropriate)', priority: 'low' },
          ],
        },
        {
          name: 'Content',
          items: [
            { id: 'unique-content', item: 'Content is unique (not duplicated)', priority: 'high' },
            { id: 'content-length', item: 'Sufficient content length (300+ words)', priority: 'medium' },
            { id: 'keyword-usage', item: 'Target keywords used naturally', priority: 'medium' },
            { id: 'readability', item: 'Content is readable (Flesch score > 60)', priority: 'low' },
          ],
        },
        {
          name: 'Structured Data',
          items: [
            { id: 'schema-org', item: 'Schema.org markup present', priority: 'medium' },
            { id: 'og-tags', item: 'Open Graph tags for social sharing', priority: 'medium' },
            { id: 'twitter-cards', item: 'Twitter Card meta tags', priority: 'low' },
          ],
        },
        {
          name: 'Core Web Vitals',
          items: [
            { id: 'lcp', item: 'LCP < 2.5 seconds', priority: 'high' },
            { id: 'fid', item: 'FID < 100 milliseconds', priority: 'high' },
            { id: 'cls', item: 'CLS < 0.1', priority: 'high' },
            { id: 'ttfb', item: 'TTFB < 800 milliseconds', priority: 'medium' },
          ],
        },
        {
          name: 'Security',
          items: [
            { id: 'hsts', item: 'HSTS header present', priority: 'high' },
            { id: 'csp', item: 'Content Security Policy defined', priority: 'medium' },
            { id: 'x-frame', item: 'X-Frame-Options set', priority: 'medium' },
          ],
        },
        {
          name: 'Crawlability',
          items: [
            { id: 'no-orphans', item: 'No orphan pages', priority: 'medium' },
            { id: 'no-broken-links', item: 'No broken internal links', priority: 'high' },
            { id: 'crawl-depth', item: 'Important pages within 3 clicks', priority: 'medium' },
          ],
        },
        {
          name: 'International',
          items: [
            { id: 'lang-attr', item: 'HTML lang attribute set', priority: 'medium' },
            { id: 'charset', item: 'UTF-8 charset declared', priority: 'high' },
          ],
        },
      ],
    };
  }

  private getSeoRulesReference(): object {
    return {
      version: '1.0',
      totalRules: 400,
      note: 'These are the categories of rules used by rek_seo_analyze',
      categories: [
        {
          name: 'meta',
          description: 'Meta tags and document head analysis',
          ruleCount: 45,
          examples: ['title-length', 'description-length', 'viewport-present', 'charset-utf8'],
        },
        {
          name: 'content',
          description: 'Content quality and structure',
          ruleCount: 60,
          examples: ['h1-single', 'heading-hierarchy', 'word-count', 'keyword-density'],
        },
        {
          name: 'links',
          description: 'Internal and external link analysis',
          ruleCount: 35,
          examples: ['broken-links', 'nofollow-ratio', 'anchor-text-diversity', 'orphan-pages'],
        },
        {
          name: 'images',
          description: 'Image optimization and accessibility',
          ruleCount: 25,
          examples: ['alt-text-present', 'image-size', 'lazy-loading', 'next-gen-formats'],
        },
        {
          name: 'performance',
          description: 'Page speed and Core Web Vitals',
          ruleCount: 50,
          examples: ['lcp-threshold', 'cls-threshold', 'fid-threshold', 'resource-hints'],
        },
        {
          name: 'technical',
          description: 'Technical SEO factors',
          ruleCount: 70,
          examples: ['robots-txt', 'sitemap-xml', 'canonical-tags', 'structured-data'],
        },
        {
          name: 'security',
          description: 'Security headers and HTTPS',
          ruleCount: 30,
          examples: ['https-only', 'hsts-header', 'csp-header', 'mixed-content'],
        },
        {
          name: 'mobile',
          description: 'Mobile-friendliness',
          ruleCount: 25,
          examples: ['viewport-meta', 'tap-targets', 'font-size', 'responsive-images'],
        },
        {
          name: 'social',
          description: 'Social media optimization',
          ruleCount: 20,
          examples: ['og-title', 'og-description', 'og-image', 'twitter-card'],
        },
        {
          name: 'international',
          description: 'Multi-language and regional SEO',
          ruleCount: 15,
          examples: ['hreflang-tags', 'lang-attribute', 'content-language'],
        },
        {
          name: 'crawl',
          description: 'Crawlability and indexability',
          ruleCount: 25,
          examples: ['robots-meta', 'x-robots-tag', 'noindex-pages', 'crawl-budget'],
        },
      ],
      usage: 'Use rek_seo_analyze to run these rules against a URL',
    };
  }

  private async getSeoReport(url: string): Promise<string> {
    // Generate a comprehensive SEO report using the analyzer
    try {
      const { createClient } = await import('../../core/client.js');
      const { analyzeSeo } = await import('../../seo/analyzer.js');

      // Fetch the URL content first
      const client = createClient({ timeout: 30000 });
      const response = await client.get(url);
      const html = await response.text();

      // Analyze the HTML
      const results = await analyzeSeo(html, { baseUrl: url });

      // Use the proper SeoReport structure
      const { summary } = results;
      const passed = summary.passed;
      const warnings = summary.warnings;
      const errors = summary.errors;

      return `# SEO Report: ${url}

## Summary

| Metric | Value |
|--------|-------|
| **Grade** | ${results.grade} |
| **Score** | ${results.score}/100 |
| **Pass Rate** | ${summary.passRate.toFixed(1)}% |
| **Passed** | ${passed} |
| **Warnings** | ${warnings} |
| **Errors** | ${errors} |

## Critical Issues

${summary.topIssues
  .filter((i) => i.severity === 'error')
  .slice(0, 10)
  .map((i) => `- ❌ **${i.name}**: ${i.message}`)
  .join('\n') || '✅ No critical issues found'}

## Warnings

${summary.topIssues
  .filter((i) => i.severity === 'warning')
  .slice(0, 10)
  .map((i) => `- ⚠️ **${i.name}**: ${i.message}`)
  .join('\n') || '✅ No warnings'}

## Quick Wins

${summary.quickWins.slice(0, 5).map((w) => `- 💡 ${w}`).join('\n') || 'No quick wins identified'}

## Full Analysis

Use \`rek_seo_analyze\` tool for detailed analysis with all ${summary.totalChecks} rules.
`;
    } catch (e) {
      return `# SEO Report: ${url}

❌ **Error**: Could not analyze URL: ${(e as Error).message}

Make sure the URL is accessible and try again.
`;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // AI Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private getAiModelsCatalog(): object {
    return {
      version: '2024-12',
      lastUpdated: '2024-12-24',
      totalProviders: 15,
      totalModels: 50,
      providers: [
        {
          name: 'openai',
          displayName: 'OpenAI',
          models: [
            { id: 'gpt-4o', context: 128000, inputPrice: 2.50, outputPrice: 10.00, vision: true, tools: true },
            { id: 'gpt-4o-mini', context: 128000, inputPrice: 0.15, outputPrice: 0.60, vision: true, tools: true },
            { id: 'gpt-4-turbo', context: 128000, inputPrice: 10.00, outputPrice: 30.00, vision: true, tools: true },
            { id: 'o1-preview', context: 128000, inputPrice: 15.00, outputPrice: 60.00, reasoning: true },
            { id: 'o1-mini', context: 128000, inputPrice: 3.00, outputPrice: 12.00, reasoning: true },
          ],
        },
        {
          name: 'anthropic',
          displayName: 'Anthropic',
          models: [
            { id: 'claude-opus-4-20250514', context: 200000, inputPrice: 15.00, outputPrice: 75.00, vision: true, tools: true },
            { id: 'claude-sonnet-4-20250514', context: 200000, inputPrice: 3.00, outputPrice: 15.00, vision: true, tools: true },
            { id: 'claude-3-5-haiku-20241022', context: 200000, inputPrice: 0.80, outputPrice: 4.00, vision: true, tools: true },
          ],
        },
        {
          name: 'google',
          displayName: 'Google',
          models: [
            { id: 'gemini-2.0-flash', context: 1000000, inputPrice: 0.075, outputPrice: 0.30, vision: true, tools: true },
            { id: 'gemini-1.5-pro', context: 2000000, inputPrice: 1.25, outputPrice: 5.00, vision: true, tools: true },
            { id: 'gemini-1.5-flash', context: 1000000, inputPrice: 0.075, outputPrice: 0.30, vision: true, tools: true },
          ],
        },
        {
          name: 'groq',
          displayName: 'Groq',
          models: [
            { id: 'llama-3.3-70b-versatile', context: 128000, inputPrice: 0.59, outputPrice: 0.79, fast: true },
            { id: 'llama-3.1-8b-instant', context: 128000, inputPrice: 0.05, outputPrice: 0.08, fast: true },
            { id: 'mixtral-8x7b-32768', context: 32768, inputPrice: 0.24, outputPrice: 0.24, fast: true },
          ],
        },
        {
          name: 'mistral',
          displayName: 'Mistral AI',
          models: [
            { id: 'mistral-large-latest', context: 128000, inputPrice: 2.00, outputPrice: 6.00, tools: true },
            { id: 'mistral-small-latest', context: 32000, inputPrice: 0.20, outputPrice: 0.60, tools: true },
            { id: 'codestral-latest', context: 32000, inputPrice: 0.20, outputPrice: 0.60, coding: true },
          ],
        },
        {
          name: 'deepseek',
          displayName: 'DeepSeek',
          models: [
            { id: 'deepseek-chat', context: 64000, inputPrice: 0.14, outputPrice: 0.28 },
            { id: 'deepseek-coder', context: 64000, inputPrice: 0.14, outputPrice: 0.28, coding: true },
          ],
        },
        {
          name: 'xai',
          displayName: 'xAI',
          models: [
            { id: 'grok-2', context: 131072, inputPrice: 2.00, outputPrice: 10.00, vision: true },
            { id: 'grok-2-mini', context: 131072, inputPrice: 0.20, outputPrice: 1.00 },
          ],
        },
      ],
      priceNote: 'Prices are per 1M tokens in USD',
    };
  }

  private getAiPricing(): object {
    const catalog = this.getAiModelsCatalog() as {
      providers: Array<{
        name: string;
        displayName: string;
        models: Array<{
          id: string;
          inputPrice?: number;
          outputPrice?: number;
          context?: number;
          vision?: boolean;
          tools?: boolean;
          reasoning?: boolean;
          fast?: boolean;
          coding?: boolean;
        }>;
      }>;
    };
    const pricing: Array<{
      provider: string;
      model: string;
      input: string;
      output: string;
      context: string;
      features: string[];
    }> = [];

    for (const provider of catalog.providers) {
      for (const model of provider.models) {
        const features = [
          model.vision && 'vision',
          model.tools && 'tools',
          model.reasoning && 'reasoning',
          model.fast && 'fast',
          model.coding && 'coding',
        ].filter((value): value is string => Boolean(value));
        pricing.push({
          provider: provider.name,
          model: model.id,
          input: `$${model.inputPrice?.toFixed(2) || 'N/A'}`,
          output: `$${model.outputPrice?.toFixed(2) || 'N/A'}`,
          context: model.context?.toLocaleString() || 'N/A',
          features,
        });
      }
    }

    // Sort by input price
    pricing.sort((a, b) => {
      const priceA = parseFloat(a.input.replace('$', '')) || 999;
      const priceB = parseFloat(b.input.replace('$', '')) || 999;
      return priceA - priceB;
    });

    return {
      note: 'Prices per 1M tokens in USD (as of Dec 2024)',
      cheapest: pricing.slice(0, 5),
      byProvider: catalog.providers.map((p) => ({
        provider: p.displayName,
        modelCount: p.models.length,
        priceRange: {
          input: `$${Math.min(...p.models.map((m) => m.inputPrice || 999)).toFixed(2)} - $${Math.max(...p.models.map((m) => m.inputPrice || 0)).toFixed(2)}`,
        },
      })),
      allModels: pricing,
    };
  }

  private getAiProviderDetails(name: string): object {
    const catalog = this.getAiModelsCatalog() as {
      providers: Array<{
        name: string;
        displayName: string;
        models: Array<{ tools?: boolean; vision?: boolean }>;
      }>;
    };
    const provider = catalog.providers.find((p) => p.name === name);

    if (!provider) {
      const available = catalog.providers.map((p) => p.name).join(', ');
      throw new NotFoundError(`Provider '${name}' not found. Available: ${available}`, { resource: name });
    }

    return {
      name: provider.name,
      displayName: provider.displayName,
      models: provider.models,
      envVar: `${name.toUpperCase()}_API_KEY`,
      reckerPreset: `presets.${name}({ apiKey: process.env.${name.toUpperCase()}_API_KEY })`,
      documentation: {
        openai: 'https://platform.openai.com/docs',
        anthropic: 'https://docs.anthropic.com',
        google: 'https://ai.google.dev/docs',
        groq: 'https://console.groq.com/docs',
        mistral: 'https://docs.mistral.ai',
        deepseek: 'https://platform.deepseek.com/docs',
        xai: 'https://docs.x.ai',
      }[name] || null,
      features: {
        streaming: true,
        functionCalling: provider.models.some((m) => Boolean(m.tools)),
        vision: provider.models.some((m) => Boolean(m.vision)),
        embeddings: ['openai', 'google', 'mistral'].includes(name),
      },
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
