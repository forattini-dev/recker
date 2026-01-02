import type { MCPPrompt, MCPPromptMessage } from '../types.js';

export interface PromptHandler {
  (args?: Record<string, string>): Promise<MCPPromptMessage[]> | MCPPromptMessage[];
}

export interface RegisteredPrompt {
  definition: MCPPrompt;
  handler: PromptHandler;
}

export class PromptRegistry {
  private prompts: Map<string, RegisteredPrompt> = new Map();

  constructor() {
    this.registerBuiltInPrompts();
  }

  registerPrompt(definition: MCPPrompt, handler: PromptHandler): void {
    this.prompts.set(definition.name, { definition, handler });
  }

  listPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values()).map(p => p.definition);
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }
    return prompt.handler(args);
  }

  private registerBuiltInPrompts(): void {
    // 1. Recker Expert
    this.registerPrompt(
      {
        name: 'recker-expert',
        description: 'Instructs the AI to act as a Recker SDK expert, focusing on best practices and idiomatic usage.',
      },
      () => [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are an expert in Recker, the AI & DevX focused Network SDK for Node.js.
Your goal is to help developers build robust, efficient, and AI-powered network applications.

Key Principles of Recker:
1. **Zero-Config Defaults**: Prefer 'await recker.get()' over complex setup.
2. **Unified API**: Use the same client for HTTP, DNS, WHOIS, and AI interactions.
3. **Resilience**: Always suggest adding retries and circuit breakers for production code.
4. **AI-Native**: Highlight features like 'stream().sse()' and 'recker.ai' when relevant.
5. **Type Safety**: Emphasize Recker's strong TypeScript support.

When providing code examples:
- Use TypeScript.
- Use 'import { recker, createClient } from "recker";'.
- Prefer the functional API ('recker.get') for simple tasks.
- Suggest 'createClient' for reusable configurations.
- Use plugins (retry, cache, dedup) to solve reliability issues.`
        }
      }]
    );

    // 2. Generate HTTP Client
    this.registerPrompt(
      {
        name: 'generate-http-client',
        description: 'Generates a robust Recker client configuration for a specific API.',
        arguments: [
          {
            name: 'apiName',
            description: 'Name of the API (e.g., "GitHub API", "Stripe")',
            required: true
          },
          {
            name: 'baseUrl',
            description: 'Base URL of the API',
            required: true
          },
          {
            name: 'authType',
            description: 'Authentication type (bearer, basic, api-key)',
            required: false
          }
        ]
      },
      (args) => {
        const { apiName, baseUrl, authType = 'bearer' } = args || {};
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a production-ready Recker client configuration for the ${apiName}.

Target API: ${baseUrl}
Auth Type: ${authType}

Requirements:
1. Use 'createClient'.
2. Configure sensible defaults for retries (exponential backoff) and timeouts.
3. Add a rate-limiting plugin if appropriate for this type of API.
4. Include an example of how to use this client to make a request.
5. If the API requires authentication, show how to inject the token securely (e.g., from process.env).`
          }
        }];
      }
    );

    // 3. SEO Audit Plan
    this.registerPrompt(
      {
        name: 'seo-audit',
        description: 'Guides the AI to perform a comprehensive SEO audit using Recker tools.',
        arguments: [
          {
            name: 'url',
            description: 'The URL to audit',
            required: true
          }
        ]
      },
      (args) => {
        const { url } = args || {};
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `I need to perform a comprehensive SEO audit for ${url}.

Please use Recker's MCP tools to analyze the site. Follow this plan:

1. **Initial Assessment**: Use 'rek_seo_analyze' to check the homepage for critical meta tag, structure, and performance issues.
2. **Security Check**: Use 'rek_security_headers' and 'rek_tls_inspect' to ensure the site is secure and trusted.
3. **Crawl**: Use 'rek_seo_spider' (limit to 20 pages) to identify broken links, duplicate content, or orphan pages.
4. **Quick Wins**: Use 'rek_seo_quick_wins' to identify the high-impact, low-effort fixes.

After running these tools, analyze the results and provide a prioritized action plan for improving the site's SEO.`
          }
        }];
      }
    );

    // 4. Migrate from Axios/Got
    this.registerPrompt(
      {
        name: 'migrate-from-axios',
        description: 'Helps migrate existing code from axios, got, ky, or node-fetch to Recker.',
        arguments: [
          {
            name: 'library',
            description: 'Source library (axios, got, ky, node-fetch)',
            required: false
          }
        ]
      },
      (args) => {
        const lib = args?.library || 'axios';
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me migrate my HTTP client code from ${lib} to Recker.

## Migration Guide: ${lib} → Recker

### Key Differences

${lib === 'axios' ? `
**Axios** uses a config object, Recker uses chaining:

\`\`\`typescript
// Axios
const { data } = await axios.get('/users', {
  headers: { Authorization: 'Bearer token' },
  timeout: 5000,
});

// Recker
const data = await recker
  .get('/users')
  .header('Authorization', 'Bearer token')
  .timeout(5000)
  .json();
\`\`\`

**Interceptors → Hooks**:
\`\`\`typescript
// Axios interceptor
axios.interceptors.request.use(config => { ... });

// Recker hook
client.beforeRequest(req => { ... });
\`\`\`
` : lib === 'got' ? `
**Got** is already similar, but Recker has simpler API:

\`\`\`typescript
// Got
const { body } = await got('https://api.example.com', {
  responseType: 'json',
  retry: { limit: 3 },
});

// Recker
const body = await recker.get('https://api.example.com')
  .retry({ maxAttempts: 3 })
  .json();
\`\`\`
` : `
**${lib}** basic migration:

\`\`\`typescript
// ${lib}
const response = await fetch('https://api.example.com');
const data = await response.json();

// Recker (simpler!)
const data = await recker.get('https://api.example.com').json();
\`\`\`
`}

### Common Patterns

1. **Base URL**: Use \`createClient({ baseUrl: '...' })\`
2. **Auth**: Use \`bearerAuth()\` or \`apiKeyAuth()\` plugins
3. **Retry**: Use \`retry: { maxAttempts: 3 }\` option
4. **Timeout**: Chain \`.timeout(5000)\` or set in config

Please provide your ${lib} code and I'll convert it to idiomatic Recker.`
          }
        }];
      }
    );

    // 5. Debug API Issues
    this.registerPrompt(
      {
        name: 'debug-api',
        description: 'Systematic workflow for debugging API connection and response issues.',
        arguments: [
          {
            name: 'url',
            description: 'The API endpoint experiencing issues',
            required: true
          },
          {
            name: 'error',
            description: 'Error message or symptom',
            required: false
          }
        ]
      },
      (args) => {
        const { url, error } = args || {};
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `I need to debug an API issue with: ${url}
${error ? `Error: ${error}` : ''}

Please follow this systematic debugging workflow using Recker's MCP tools:

## Step 1: DNS & Connectivity
- Use \`rek_dns\` to verify DNS resolution
- Use \`rek_ping\` to check TCP connectivity

## Step 2: TLS & Security
- Use \`rek_tls_inspect\` to check certificate validity
- Verify TLS version and cipher support

## Step 3: HTTP Request Analysis
- Use \`rek_http_request\` with verbose output
- Check status code, headers, and timing

## Step 4: Security Headers
- Use \`rek_security_headers\` to check CORS, CSP, etc.

## Step 5: Trace Route (if needed)
- Network path analysis for latency issues

After each step, analyze the results and narrow down the issue. Common problems:
- DNS: Wrong/stale records
- TLS: Expired cert, wrong hostname, unsupported protocol
- HTTP: CORS, auth, rate limiting, wrong content-type
- Network: Firewall, proxy, timeout

Provide actionable recommendations based on findings.`
          }
        }];
      }
    );

    // 6. API Security Assessment
    this.registerPrompt(
      {
        name: 'api-security-check',
        description: 'Comprehensive security assessment of an API endpoint.',
        arguments: [
          {
            name: 'url',
            description: 'The API endpoint to assess',
            required: true
          }
        ]
      },
      (args) => {
        const { url } = args || {};
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Perform a comprehensive security assessment of: ${url}

Use Recker's MCP tools to check:

## 1. Transport Security
- \`rek_tls_inspect\`: Certificate validity, chain, protocols
- Check for TLS 1.2+ support, strong ciphers

## 2. HTTP Security Headers
- \`rek_security_headers\`: Get A-F security grade
- Check: HSTS, CSP, X-Frame-Options, X-Content-Type-Options

## 3. DNS Security
- \`rek_dns\`: Check DNSSEC
- \`rek_dns_toolkit\`: Verify SPF, DMARC, DKIM (if email domain)

## 4. API Security Indicators
- Rate limiting headers (X-RateLimit-*)
- Authentication requirements
- Error information leakage
- CORS configuration

## 5. IP Intelligence
- \`rek_ip_lookup\`: Check hosting provider, geolocation
- Identify if behind CDN/WAF

Provide a security report with:
1. **Grade**: A-F overall security rating
2. **Critical Issues**: Must fix immediately
3. **Recommendations**: Prioritized improvements
4. **Compliance Notes**: OWASP, PCI-DSS considerations`
          }
        }];
      }
    );

    // 7. WebSocket Tutorial
    this.registerPrompt(
      {
        name: 'websocket-tutorial',
        description: 'Complete guide for implementing WebSocket connections with Recker.',
        arguments: [
          {
            name: 'useCase',
            description: 'Use case (chat, realtime-data, notifications)',
            required: false
          }
        ]
      },
      (args) => {
        const useCase = args?.useCase || 'general';
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create a complete WebSocket implementation guide for: ${useCase}

## Recker WebSocket Features

### Basic Connection
\`\`\`typescript
import { ws } from 'recker';

const socket = ws('wss://api.example.com/ws');

socket.on('open', () => console.log('Connected'));
socket.on('message', (data) => console.log('Received:', data));
socket.on('close', (code, reason) => console.log('Closed:', code));
socket.on('error', (err) => console.error('Error:', err));
\`\`\`

### With Auto-Reconnection
\`\`\`typescript
import { createWebSocket } from 'recker';

const socket = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectInterval: 1000,
  reconnectBackoff: 'exponential',
  maxReconnectAttempts: 10,
  pingInterval: 30000,
});
\`\`\`

${useCase === 'chat' ? `
### Chat-Specific Features
- Message queuing during disconnect
- Presence detection
- Typing indicators
- Read receipts
` : useCase === 'realtime-data' ? `
### Real-time Data Patterns
- Subscription management
- Delta updates vs full state
- Backpressure handling
- Data validation
` : `
### General Best Practices
- Connection lifecycle management
- Error handling and recovery
- Message serialization (JSON, binary)
- Authentication tokens
`}

Please provide a complete, production-ready implementation with:
1. Connection management
2. Error handling
3. Reconnection logic
4. Message handling
5. Cleanup on unmount/exit`
          }
        }];
      }
    );

    // 8. AI Streaming Guide
    this.registerPrompt(
      {
        name: 'ai-streaming',
        description: 'Guide for implementing streaming responses from AI providers.',
        arguments: [
          {
            name: 'provider',
            description: 'AI provider (openai, anthropic, google, ollama)',
            required: false
          }
        ]
      },
      (args) => {
        const provider = args?.provider || 'any';
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create a complete AI streaming implementation guide${provider !== 'any' ? ` for ${provider}` : ''}.

## Recker AI Streaming

### Basic Streaming
\`\`\`typescript
import { recker } from 'recker';

const stream = await recker.ai.stream('Tell me a story', {
  provider: '${provider !== 'any' ? provider : 'openai'}',
  model: 'gpt-4',
});

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
\`\`\`

### With Event Handlers
\`\`\`typescript
import { createAI } from 'recker';

const ai = createAI();

await ai.stream('Explain quantum computing', {
  onToken: (token) => process.stdout.write(token),
  onComplete: (fullResponse) => console.log('\\nDone!'),
  onError: (error) => console.error('Error:', error),
});
\`\`\`

### Server-Sent Events (SSE)
\`\`\`typescript
// For web servers
const stream = await recker.ai.stream(prompt);

return new Response(stream.toSSE(), {
  headers: { 'Content-Type': 'text/event-stream' },
});
\`\`\`

${provider === 'anthropic' ? `
### Anthropic-Specific
- Tool use streaming
- Message batching
- Content blocks
` : provider === 'openai' ? `
### OpenAI-Specific
- Function calling with streaming
- Structured outputs
- Vision with streaming
` : `
### Provider-Agnostic Tips
- Fallback between providers
- Unified response format
- Token counting
`}

Please provide complete examples for:
1. Basic streaming to console
2. Streaming to web client (SSE)
3. Streaming with tool/function calls
4. Error handling and retry
5. Cancellation and cleanup`
          }
        }];
      }
    );

    // 9. Web Scraping Workflow
    this.registerPrompt(
      {
        name: 'scraping-workflow',
        description: 'Complete web scraping workflow with anti-blocking techniques.',
        arguments: [
          {
            name: 'targetType',
            description: 'Type of site (ecommerce, news, social, api)',
            required: false
          }
        ]
      },
      (args) => {
        const targetType = args?.targetType || 'general';
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create a complete web scraping workflow for: ${targetType} sites

## Recker Scraping Stack

### Basic Scraping
\`\`\`typescript
import { recker } from 'recker';

const doc = await recker.scrape('https://example.com');

// CSS Selectors
const title = doc.select('h1').text();
const links = doc.selectAll('a[href]').map(a => ({
  text: a.text(),
  href: a.attr('href'),
}));

// Built-in extractors
const meta = doc.extractMeta();      // title, description, og:*
const schema = doc.extractSchema();  // JSON-LD structured data
const links = doc.extractLinks();    // All links with context
\`\`\`

### Anti-Blocking Setup
\`\`\`typescript
import { createClient } from 'recker';
import { userAgent, proxyRotator, rateLimit } from 'recker/plugins';

const client = createClient();

// Rotate user agents
client.use(userAgent({ rotate: true, type: 'desktop' }));

// Rotate proxies
client.use(proxyRotator({
  proxies: ['http://proxy1:8080', 'http://proxy2:8080'],
  strategy: 'round-robin',
}));

// Respect rate limits
client.use(rateLimit({ limit: 10, window: 60000 }));
\`\`\`

${targetType === 'ecommerce' ? `
### E-commerce Specific
- Product data extraction
- Price monitoring
- Inventory tracking
- Review aggregation
` : targetType === 'news' ? `
### News Site Specific
- Article content extraction
- Author/date parsing
- Category classification
- Paywall handling
` : `
### General Best Practices
- Respect robots.txt
- Handle pagination
- Deal with JavaScript rendering
- Structured data extraction
`}

### Spider for Multi-Page
\`\`\`typescript
import { Spider } from 'recker';

const spider = new Spider('https://example.com', {
  maxPages: 100,
  maxDepth: 3,
  respectRobotsTxt: true,
  delay: 1000,
});

spider.on('page', ({ url, doc }) => {
  console.log('Scraped:', url);
});

await spider.crawl();
\`\`\`

Please provide a complete workflow including:
1. Target analysis (what to extract)
2. Anti-blocking configuration
3. Data extraction logic
4. Error handling and retries
5. Data storage/export
6. Rate limiting and politeness`
          }
        }];
      }
    );

    // 10. SEO Schema Generator
    this.registerPrompt(
      {
        name: 'seo-schema-generator',
        description: 'Generate JSON-LD structured data for SEO (Schema.org markup).',
        arguments: [
          {
            name: 'type',
            description: 'Schema type (Article, Product, LocalBusiness, FAQ, Recipe, Event, Organization, Person, HowTo, Review)',
            required: true
          },
          {
            name: 'context',
            description: 'Brief description of the content to generate schema for',
            required: false
          }
        ]
      },
      (args) => {
        const schemaType = args?.type || 'Article';
        const context = args?.context || '';

        const schemaExamples: Record<string, string> = {
          Article: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "2025-01-01",
  "dateModified": "2025-01-02",
  "image": "https://example.com/image.jpg",
  "publisher": {
    "@type": "Organization",
    "name": "Publisher Name",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  }
}`,
          Product: `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "description": "Product description",
  "image": "https://example.com/product.jpg",
  "brand": {
    "@type": "Brand",
    "name": "Brand Name"
  },
  "offers": {
    "@type": "Offer",
    "price": "99.99",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "100"
  }
}`,
          LocalBusiness: `{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Business Name",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "City",
    "addressRegion": "State",
    "postalCode": "12345"
  },
  "telephone": "+1-555-555-5555",
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "opens": "09:00",
    "closes": "17:00"
  }
}`,
          FAQ: `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question 1?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer 1"
      }
    },
    {
      "@type": "Question",
      "name": "Question 2?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer 2"
      }
    }
  ]
}`
        };

        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Generate JSON-LD structured data (Schema.org) for: **${schemaType}**
${context ? `\nContext: ${context}` : ''}

## Schema.org Best Practices

1. **Always include required properties** - Each schema type has mandatory fields
2. **Use specific types** - "LocalBusiness" is better than just "Organization"
3. **Validate before use** - Use Google's Rich Results Test
4. **Keep it accurate** - Schema must match visible page content

## Template for ${schemaType}

\`\`\`json
${schemaExamples[schemaType] || schemaExamples.Article}
\`\`\`

## Verification with Recker

After generating, verify with:
\`\`\`typescript
import { recker } from 'recker';

// Analyze page schema
const result = await recker.seo.analyze('https://your-page.com');
console.log(result.structuredData); // Check detected schemas
\`\`\`

## Common ${schemaType} Rich Results

${schemaType === 'Article' ? '- News carousel\n- Top stories\n- Article rich snippet' :
  schemaType === 'Product' ? '- Product rich snippet with price\n- Star ratings\n- Availability status' :
  schemaType === 'LocalBusiness' ? '- Knowledge panel\n- Google Maps integration\n- Business hours' :
  schemaType === 'FAQ' ? '- FAQ accordion in SERP\n- Expanded snippets\n- Voice search answers' :
  '- Rich snippets in search results\n- Enhanced visibility\n- Featured snippets'}

Please generate a complete, valid JSON-LD schema customized for the specific use case.`
          }
        }];
      }
    );

    // 11. SEO Content Optimizer
    this.registerPrompt(
      {
        name: 'seo-content-optimizer',
        description: 'Analyze and optimize content for SEO based on target keywords.',
        arguments: [
          {
            name: 'url',
            description: 'URL of the page to optimize (or paste content directly)',
            required: false
          },
          {
            name: 'keyword',
            description: 'Primary target keyword for optimization',
            required: true
          },
          {
            name: 'secondaryKeywords',
            description: 'Comma-separated secondary keywords',
            required: false
          }
        ]
      },
      (args) => {
        const { url, keyword, secondaryKeywords } = args || { keyword: '' };
        const secondary = secondaryKeywords?.split(',').map(k => k.trim()) || [];

        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Optimize content for SEO with the following targets:

**Primary Keyword**: ${keyword}
${secondary.length > 0 ? `**Secondary Keywords**: ${secondary.join(', ')}` : ''}
${url ? `**Page URL**: ${url}` : ''}

## Analysis Workflow

${url ? `### Step 1: Analyze Current Page
Use Recker to fetch and analyze:
\`\`\`typescript
const report = await recker.seo.analyze('${url}');
console.log(report.keywords);  // Current keyword density
console.log(report.content);   // Content metrics
\`\`\`
` : ''}
### Step 2: Content Audit

Check these SEO factors:

| Factor | Target | Why It Matters |
|--------|--------|----------------|
| **Title** | ${keyword} in first 60 chars | Primary ranking signal |
| **H1** | Contains ${keyword} | Page topic signal |
| **Meta Description** | ${keyword} + CTA in 155 chars | CTR improvement |
| **URL** | Short, contains keyword | Readability + ranking |
| **Word Count** | 1500-2500 words | Comprehensive coverage |
| **Keyword Density** | 1-2% primary | Natural usage |
| **H2/H3 Headers** | Include variations | Structure + semantic SEO |
| **First 100 Words** | Include ${keyword} | Early prominence signal |
| **Internal Links** | 3-5 relevant links | Authority distribution |
| **External Links** | 2-3 authoritative sources | Credibility signal |

### Step 3: Content Optimization Checklist

**On-Page Elements**:
- [ ] Title tag optimized (under 60 chars)
- [ ] Meta description optimized (under 155 chars)
- [ ] H1 contains primary keyword
- [ ] H2/H3s contain secondary keywords
- [ ] First paragraph mentions primary keyword
- [ ] Image alt texts include keywords naturally

**Content Quality**:
- [ ] Answers search intent completely
- [ ] Includes original insights or data
- [ ] Uses semantic variations (LSI keywords)
- [ ] Has clear sections and structure
- [ ] Includes relevant media (images, videos)

**Technical**:
- [ ] Mobile-friendly layout
- [ ] Fast page load (Core Web Vitals)
- [ ] Proper schema markup
- [ ] Clean URL structure

### Step 4: Generate Optimized Content

Provide:
1. **Optimized title tag** (with character count)
2. **Optimized meta description** (with character count)
3. **Suggested H1**
4. **Suggested H2 outline** (5-7 sections)
5. **Opening paragraph** (optimized)
6. **List of LSI keywords** to incorporate
7. **Internal linking suggestions**

Focus on natural readability while strategically placing keywords.`
          }
        }];
      }
    );

    // 12. AI Prompt Engineer
    this.registerPrompt(
      {
        name: 'ai-prompt-engineer',
        description: 'Craft effective prompts for AI models with best practices.',
        arguments: [
          {
            name: 'task',
            description: 'The task you want the AI to perform',
            required: true
          },
          {
            name: 'model',
            description: 'Target model (gpt-4, claude, gemini, llama)',
            required: false
          },
          {
            name: 'style',
            description: 'Prompt style (zero-shot, few-shot, chain-of-thought, tree-of-thought)',
            required: false
          }
        ]
      },
      (args) => {
        const { task, model, style } = args || { task: '' };
        const targetModel = model || 'any';
        const promptStyle = style || 'auto';

        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me craft an effective prompt for this task:

**Task**: ${task}
**Target Model**: ${targetModel}
**Prompt Style**: ${promptStyle}

## Prompt Engineering Best Practices

### 1. Structure Template

\`\`\`
# Role
You are a [specific expert role].

# Context
[Background information the model needs]

# Task
[Clear, specific instruction]

# Constraints
- [Constraint 1]
- [Constraint 2]

# Output Format
[Specify exact output structure]

# Examples (if few-shot)
Input: [example]
Output: [example]
\`\`\`

### 2. Model-Specific Tips

${targetModel === 'gpt-4' || targetModel === 'any' ? `
**GPT-4/OpenAI**:
- Responds well to system messages
- Supports function calling for structured output
- Use JSON mode for reliable parsing
` : ''}
${targetModel === 'claude' || targetModel === 'any' ? `
**Claude/Anthropic**:
- Responds to XML tags for structure: <task>, <context>
- Explicit reasoning improves accuracy
- Use "Think step by step" for complex tasks
` : ''}
${targetModel === 'gemini' || targetModel === 'any' ? `
**Gemini/Google**:
- Strong at multimodal tasks
- Use clear section headers
- Specify safety considerations
` : ''}

### 3. Prompt Styles

${promptStyle === 'zero-shot' || promptStyle === 'auto' ? `
**Zero-Shot** (no examples):
\`\`\`
Classify this text as positive, negative, or neutral:
"I love this product!"
\`\`\`
` : ''}
${promptStyle === 'few-shot' || promptStyle === 'auto' ? `
**Few-Shot** (with examples):
\`\`\`
Classify these texts:

Text: "This is amazing!" → positive
Text: "Terrible experience" → negative
Text: "It works" → neutral

Text: "Best purchase ever!" →
\`\`\`
` : ''}
${promptStyle === 'chain-of-thought' || promptStyle === 'auto' ? `
**Chain-of-Thought**:
\`\`\`
Let's solve this step by step:
1. First, identify...
2. Then, analyze...
3. Finally, conclude...
\`\`\`
` : ''}

### 4. Using with Recker

\`\`\`typescript
import { recker } from 'recker';

const result = await recker.ai.chat(prompt, {
  provider: '${targetModel !== 'any' ? targetModel : 'openai'}',
  temperature: 0.7,  // Creativity level
  maxTokens: 1000,
});
\`\`\`

## Generate Optimized Prompt

Please generate:
1. **System Prompt** (role and constraints)
2. **User Prompt** (the actual task instruction)
3. **Expected Output Format**
4. **Variations** (2-3 alternative phrasings)
5. **Evaluation Criteria** (how to judge if output is good)

Make the prompt clear, specific, and optimized for the target task.`
          }
        }];
      }
    );

    // 13. AI Model Selector
    this.registerPrompt(
      {
        name: 'ai-model-selector',
        description: 'Choose the right AI model based on task requirements, cost, and performance.',
        arguments: [
          {
            name: 'task',
            description: 'Description of your AI task',
            required: true
          },
          {
            name: 'priority',
            description: 'Priority: cost, speed, quality, or balanced',
            required: false
          },
          {
            name: 'contextSize',
            description: 'Required context window (small, medium, large, huge)',
            required: false
          }
        ]
      },
      (args) => {
        const { task, priority, contextSize } = args || { task: '' };
        const priorityChoice = priority || 'balanced';
        const ctxSize = contextSize || 'medium';

        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me choose the best AI model for my task:

**Task**: ${task}
**Priority**: ${priorityChoice}
**Context Needs**: ${ctxSize}

## Model Comparison Matrix

### Frontier Models (Best Quality)

| Model | Provider | Context | Strengths | $/1M tokens |
|-------|----------|---------|-----------|-------------|
| **GPT-4o** | OpenAI | 128K | General, coding, vision | $5/$15 |
| **Claude 3.5 Sonnet** | Anthropic | 200K | Reasoning, long docs | $3/$15 |
| **Gemini 1.5 Pro** | Google | 1M+ | Huge context, multimodal | $3.50/$10.50 |
| **GPT-4 Turbo** | OpenAI | 128K | Balanced, reliable | $10/$30 |

### Fast & Efficient Models

| Model | Provider | Context | Strengths | $/1M tokens |
|-------|----------|---------|-----------|-------------|
| **GPT-4o-mini** | OpenAI | 128K | Fast, cheap, good | $0.15/$0.60 |
| **Claude 3 Haiku** | Anthropic | 200K | Fastest Claude | $0.25/$1.25 |
| **Gemini 1.5 Flash** | Google | 1M | Speed + huge context | $0.075/$0.30 |

### Open Source (Self-Host)

| Model | Size | Context | Best For |
|-------|------|---------|----------|
| **Llama 3.1 405B** | 405B | 128K | Max open performance |
| **Llama 3.1 70B** | 70B | 128K | Good balance |
| **Mistral Large** | 123B | 128K | Multilingual |
| **Qwen 2.5** | 72B | 128K | Coding, Chinese |

## Task-Based Recommendations

${priorityChoice === 'cost' ? `
### 💰 Cost Priority
1. **GPT-4o-mini** - Best quality/cost ratio
2. **Gemini 1.5 Flash** - If you need huge context
3. **Llama 3.1 70B** (self-hosted) - Zero API cost
` : priorityChoice === 'speed' ? `
### ⚡ Speed Priority
1. **Claude 3 Haiku** - Fastest inference
2. **Gemini 1.5 Flash** - Fast + long context
3. **GPT-4o-mini** - Fast + reliable
` : priorityChoice === 'quality' ? `
### 🎯 Quality Priority
1. **Claude 3.5 Sonnet** - Best reasoning
2. **GPT-4o** - Best general performance
3. **Gemini 1.5 Pro** - Best for long documents
` : `
### ⚖️ Balanced Priority
1. **GPT-4o-mini** - Great value for most tasks
2. **Claude 3.5 Sonnet** - Worth the cost for complex reasoning
3. **Gemini 1.5 Flash** - If context size matters
`}

## Context Size Recommendations

${ctxSize === 'huge' ? `
**1M+ tokens needed**: Gemini 1.5 Pro/Flash (1M+ context)
` : ctxSize === 'large' ? `
**128K-200K tokens**: Claude 3.5 (200K), GPT-4 (128K)
` : `
**Standard (8K-32K)**: Most models work, optimize for other factors
`}

## Using with Recker

\`\`\`typescript
import { recker } from 'recker';

// Easy provider switching
const result = await recker.ai.chat('Your prompt', {
  // Recommended for your task:
  provider: 'openai',
  model: 'gpt-4o-mini',

  // Fallback chain for reliability
  fallback: [
    { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    { provider: 'google', model: 'gemini-1.5-flash' },
  ],
});
\`\`\`

## My Recommendation

Based on your requirements (${task}), I recommend:

1. **Primary Choice**: [Model] - [Why]
2. **Budget Option**: [Model] - [Why]
3. **Performance Option**: [Model] - [Why]

Please describe your specific use case and I'll provide a tailored recommendation.`
          }
        }];
      }
    );
  }
}
