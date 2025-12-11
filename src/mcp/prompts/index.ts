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
  }
}
