import { describe, it, expect } from 'vitest';
import {
  github,
  gitlab,
  stripe,
  cloudflare,
  cloudflareWorkersAI,
  vercel,
  supabase,
  twilio,
  digitalocean,
  linear,
  notion,
  slack,
  discord,
  openai,
  anthropic,
  cohere,
  mistral,
  groq,
  together,
  replicate,
  huggingface,
  perplexity,
  deepseek,
  fireworks,
  azureOpenai,
  gemini,
  xai,
  grok,
} from '../../src/presets/index.js';

describe('Presets', () => {
  describe('GitHub', () => {
    it('should create config with token', () => {
      const config = github({ token: 'ghp_test123' });
      expect(config.baseUrl).toBe('https://api.github.com');
      expect(config.headers?.['Authorization']).toBe('Bearer ghp_test123');
      expect(config.headers?.['Accept']).toBe('application/vnd.github+json');
      expect(config.headers?.['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('should use custom API version', () => {
      const config = github({ token: 'ghp_test123', apiVersion: '2023-01-01' });
      expect(config.headers?.['X-GitHub-Api-Version']).toBe('2023-01-01');
    });
  });

  describe('GitLab', () => {
    it('should create config with token', () => {
      const config = gitlab({ token: 'glpat-test123' });
      expect(config.baseUrl).toBe('https://gitlab.com/api/v4');
      expect(config.headers?.['PRIVATE-TOKEN']).toBe('glpat-test123');
    });

    it('should use custom base URL', () => {
      const config = gitlab({ token: 'glpat-test123', baseUrl: 'https://gitlab.mycompany.com' });
      expect(config.baseUrl).toBe('https://gitlab.mycompany.com/api/v4');
    });
  });

  describe('Stripe', () => {
    it('should create config with secret key', () => {
      const config = stripe({ secretKey: 'sk_test_123' });
      expect(config.baseUrl).toBe('https://api.stripe.com/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer sk_test_123');
      expect(config.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should add API version header', () => {
      const config = stripe({ secretKey: 'sk_test_123', apiVersion: '2023-10-16' });
      expect(config.headers?.['Stripe-Version']).toBe('2023-10-16');
    });

    it('should add idempotency key', () => {
      const config = stripe({ secretKey: 'sk_test_123', idempotencyKey: 'unique-key-123' });
      expect(config.headers?.['Idempotency-Key']).toBe('unique-key-123');
    });
  });

  describe('Cloudflare', () => {
    it('should create config with API token', () => {
      const config = cloudflare({ apiToken: 'cf_token_123' });
      expect(config.baseUrl).toBe('https://api.cloudflare.com/client/v4');
      expect(config.headers?.['Authorization']).toBe('Bearer cf_token_123');
    });

    it('should create config with legacy API key + email', () => {
      const config = cloudflare({ apiKey: 'api_key_123', email: 'user@example.com' });
      expect(config.headers?.['X-Auth-Key']).toBe('api_key_123');
      expect(config.headers?.['X-Auth-Email']).toBe('user@example.com');
    });
  });

  describe('Cloudflare Workers AI', () => {
    it('should create config with account ID and token', () => {
      const config = cloudflareWorkersAI({ accountId: 'acc123', apiToken: 'token123' });
      expect(config.baseUrl).toBe('https://api.cloudflare.com/client/v4/accounts/acc123/ai');
      expect(config.headers?.['Authorization']).toBe('Bearer token123');
    });
  });

  describe('Vercel', () => {
    it('should create config with token', () => {
      const config = vercel({ token: 'vercel_token_123' });
      expect(config.baseUrl).toBe('https://api.vercel.com');
      expect(config.headers?.['Authorization']).toBe('Bearer vercel_token_123');
    });

    it('should add team ID to params', () => {
      const config = vercel({ token: 'vercel_token_123', teamId: 'team_123' });
      expect(config.defaults?.params?.teamId).toBe('team_123');
    });
  });

  describe('Supabase', () => {
    it('should create config with project URL and API key', () => {
      const config = supabase({ projectUrl: 'https://xyz.supabase.co', apiKey: 'anon_key_123' });
      expect(config.baseUrl).toBe('https://xyz.supabase.co/rest/v1');
      expect(config.headers?.['apikey']).toBe('anon_key_123');
      expect(config.headers?.['Authorization']).toBe('Bearer anon_key_123');
      expect(config.headers?.['Prefer']).toBe('return=representation');
    });
  });

  describe('Twilio', () => {
    it('should create config with account SID and auth token', () => {
      const config = twilio({ accountSid: 'AC123', authToken: 'auth_token_123' });
      expect(config.baseUrl).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123');
      const expectedCredentials = Buffer.from('AC123:auth_token_123').toString('base64');
      expect(config.headers?.['Authorization']).toBe(`Basic ${expectedCredentials}`);
      expect(config.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
    });
  });

  describe('DigitalOcean', () => {
    it('should create config with token', () => {
      const config = digitalocean({ token: 'do_token_123' });
      expect(config.baseUrl).toBe('https://api.digitalocean.com/v2');
      expect(config.headers?.['Authorization']).toBe('Bearer do_token_123');
    });
  });

  describe('Linear', () => {
    it('should create config with API key', () => {
      const config = linear({ apiKey: 'lin_api_123' });
      expect(config.baseUrl).toBe('https://api.linear.app');
      expect(config.headers?.['Authorization']).toBe('lin_api_123');
    });
  });

  describe('Notion', () => {
    it('should create config with token', () => {
      const config = notion({ token: 'secret_123' });
      expect(config.baseUrl).toBe('https://api.notion.com/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer secret_123');
      expect(config.headers?.['Notion-Version']).toBe('2022-06-28');
    });

    it('should use custom Notion version', () => {
      const config = notion({ token: 'secret_123', notionVersion: '2023-01-01' });
      expect(config.headers?.['Notion-Version']).toBe('2023-01-01');
    });
  });

  describe('Slack', () => {
    it('should create config with token', () => {
      const config = slack({ token: 'xoxb-123' });
      expect(config.baseUrl).toBe('https://slack.com/api');
      expect(config.headers?.['Authorization']).toBe('Bearer xoxb-123');
    });
  });

  describe('Discord', () => {
    it('should create config with bot token', () => {
      const config = discord({ token: 'bot_token_123' });
      expect(config.baseUrl).toBe('https://discord.com/api/v10');
      expect(config.headers?.['Authorization']).toBe('Bot bot_token_123');
    });

    it('should support Bearer token type', () => {
      const config = discord({ token: 'oauth_token_123', tokenType: 'Bearer' });
      expect(config.headers?.['Authorization']).toBe('Bearer oauth_token_123');
    });
  });

  describe('OpenAI', () => {
    it('should create config with API key', () => {
      const config = openai({ apiKey: 'sk-test123' });
      expect(config.baseUrl).toBe('https://api.openai.com/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer sk-test123');
    });

    it('should add organization header', () => {
      const config = openai({ apiKey: 'sk-test123', organization: 'org-123' });
      expect(config.headers?.['OpenAI-Organization']).toBe('org-123');
    });

    it('should add project header', () => {
      const config = openai({ apiKey: 'sk-test123', project: 'proj-123' });
      expect(config.headers?.['OpenAI-Project']).toBe('proj-123');
    });
  });

  describe('Anthropic', () => {
    it('should create config with API key', () => {
      const config = anthropic({ apiKey: 'sk-ant-123' });
      expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(config.headers?.['x-api-key']).toBe('sk-ant-123');
      expect(config.headers?.['anthropic-version']).toBe('2023-06-01');
    });

    it('should use custom API version', () => {
      const config = anthropic({ apiKey: 'sk-ant-123', version: '2024-01-01' });
      expect(config.headers?.['anthropic-version']).toBe('2024-01-01');
    });
  });

  describe('Azure OpenAI', () => {
    it('should create config with resource name and API key', () => {
      const config = azureOpenai({ resourceName: 'my-resource', apiKey: 'azure_key_123' });
      expect(config.baseUrl).toBe('https://my-resource.openai.azure.com/openai');
      expect(config.headers?.['api-key']).toBe('azure_key_123');
      expect(config.defaults?.params?.['api-version']).toBe('2024-02-15-preview');
    });

    it('should include deployment name in URL', () => {
      const config = azureOpenai({
        resourceName: 'my-resource',
        apiKey: 'azure_key_123',
        deploymentName: 'gpt-4'
      });
      expect(config.baseUrl).toBe('https://my-resource.openai.azure.com/openai/deployments/gpt-4');
    });

    it('should use custom API version', () => {
      const config = azureOpenai({
        resourceName: 'my-resource',
        apiKey: 'azure_key_123',
        apiVersion: '2023-05-15'
      });
      expect(config.defaults?.params?.['api-version']).toBe('2023-05-15');
    });
  });

  describe('Cohere', () => {
    it('should create config with API key', () => {
      const config = cohere({ apiKey: 'cohere_key_123' });
      expect(config.baseUrl).toBe('https://api.cohere.ai/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer cohere_key_123');
    });
  });

  describe('Mistral', () => {
    it('should create config with API key', () => {
      const config = mistral({ apiKey: 'mistral_key_123' });
      expect(config.baseUrl).toBe('https://api.mistral.ai/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer mistral_key_123');
    });
  });

  describe('Groq', () => {
    it('should create config with API key', () => {
      const config = groq({ apiKey: 'gsk_key_123' });
      expect(config.baseUrl).toBe('https://api.groq.com/openai/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer gsk_key_123');
    });
  });

  describe('Together', () => {
    it('should create config with API key', () => {
      const config = together({ apiKey: 'together_key_123' });
      expect(config.baseUrl).toBe('https://api.together.xyz/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer together_key_123');
    });
  });

  describe('Replicate', () => {
    it('should create config with API key', () => {
      const config = replicate({ apiKey: 'r8_key_123' });
      expect(config.baseUrl).toBe('https://api.replicate.com/v1');
      expect(config.headers?.['Authorization']).toBe('Token r8_key_123');
    });
  });

  describe('HuggingFace', () => {
    it('should create config with API key', () => {
      const config = huggingface({ apiKey: 'hf_key_123' });
      expect(config.baseUrl).toBe('https://api-inference.huggingface.co');
      expect(config.headers?.['Authorization']).toBe('Bearer hf_key_123');
    });
  });

  describe('Perplexity', () => {
    it('should create config with API key', () => {
      const config = perplexity({ apiKey: 'pplx_key_123' });
      expect(config.baseUrl).toBe('https://api.perplexity.ai');
      expect(config.headers?.['Authorization']).toBe('Bearer pplx_key_123');
    });
  });

  describe('DeepSeek', () => {
    it('should create config with API key', () => {
      const config = deepseek({ apiKey: 'sk_key_123' });
      expect(config.baseUrl).toBe('https://api.deepseek.com/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer sk_key_123');
    });
  });

  describe('Fireworks', () => {
    it('should create config with API key', () => {
      const config = fireworks({ apiKey: 'fw_key_123' });
      expect(config.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer fw_key_123');
    });
  });

  describe('Gemini', () => {
    it('should create config with API key', () => {
      const config = gemini({ apiKey: 'gemini_key_123' });
      expect(config.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
      expect(config.headers?.['x-goog-api-key']).toBe('gemini_key_123');
    });
  });

  describe('xAI / Grok', () => {
    it('should create config with API key', () => {
      const config = xai({ apiKey: 'xai_key_123' });
      expect(config.baseUrl).toBe('https://api.x.ai/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer xai_key_123');
    });

    it('grok should be alias for xai', () => {
      const config = grok({ apiKey: 'xai_key_123' });
      expect(config.baseUrl).toBe('https://api.x.ai/v1');
      expect(config.headers?.['Authorization']).toBe('Bearer xai_key_123');
    });
  });

  describe('Common Configuration', () => {
    it('all presets should have retry configuration', () => {
      const configs = [
        github({ token: 'test' }),
        gitlab({ token: 'test' }),
        stripe({ secretKey: 'test' }),
        cloudflare({ apiToken: 'test' }),
        vercel({ token: 'test' }),
        supabase({ projectUrl: 'https://test.supabase.co', apiKey: 'test' }),
        twilio({ accountSid: 'test', authToken: 'test' }),
        digitalocean({ token: 'test' }),
        linear({ apiKey: 'test' }),
        notion({ token: 'test' }),
        slack({ token: 'test' }),
        discord({ token: 'test' }),
        openai({ apiKey: 'test' }),
        anthropic({ apiKey: 'test' }),
        cohere({ apiKey: 'test' }),
        mistral({ apiKey: 'test' }),
        groq({ apiKey: 'test' }),
        together({ apiKey: 'test' }),
        replicate({ apiKey: 'test' }),
        huggingface({ apiKey: 'test' }),
        perplexity({ apiKey: 'test' }),
        deepseek({ apiKey: 'test' }),
        fireworks({ apiKey: 'test' }),
        gemini({ apiKey: 'test' }),
        xai({ apiKey: 'test' }),
      ];

      for (const config of configs) {
        expect(config.retry).toBeDefined();
        expect(config.retry?.maxAttempts).toBeGreaterThanOrEqual(3);
        expect(config.retry?.backoff).toBe('exponential');
        expect(config.retry?.statusCodes).toContain(429);
        expect(config.retry?.statusCodes).toContain(500);
      }
    });

    it('all presets should have timeout', () => {
      const configs = [
        github({ token: 'test' }),
        gitlab({ token: 'test' }),
        stripe({ secretKey: 'test' }),
        cloudflare({ apiToken: 'test' }),
        vercel({ token: 'test' }),
        supabase({ projectUrl: 'https://test.supabase.co', apiKey: 'test' }),
        twilio({ accountSid: 'test', authToken: 'test' }),
        digitalocean({ token: 'test' }),
        linear({ apiKey: 'test' }),
        notion({ token: 'test' }),
        slack({ token: 'test' }),
        discord({ token: 'test' }),
        openai({ apiKey: 'test' }),
        anthropic({ apiKey: 'test' }),
        cohere({ apiKey: 'test' }),
        mistral({ apiKey: 'test' }),
        groq({ apiKey: 'test' }),
        together({ apiKey: 'test' }),
        replicate({ apiKey: 'test' }),
        huggingface({ apiKey: 'test' }),
        perplexity({ apiKey: 'test' }),
        deepseek({ apiKey: 'test' }),
        fireworks({ apiKey: 'test' }),
        gemini({ apiKey: 'test' }),
        xai({ apiKey: 'test' }),
      ];

      for (const config of configs) {
        expect(config.timeout).toBeDefined();
        expect(config.timeout).toBeGreaterThan(0);
      }
    });
  });
});
