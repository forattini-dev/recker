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
  mailgun,
  meta,
  facebook,
  instagram,
  whatsapp,
  threads,
  oracle,
  ociCompute,
  ociObjectStorage,
  ociDatabase,
  ociKubernetes,
  ociGenerativeAI,
  ociVault,
  sinch,
  tiktok,
  tiktokBusiness,
  vultr,
  youtube,
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
        deploymentName: 'gpt-5-1'
      });
      expect(config.baseUrl).toBe('https://my-resource.openai.azure.com/openai/deployments/gpt-5-1');
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

  describe('Mailgun', () => {
    it('should create config with API key', () => {
      const config = mailgun({ apiKey: 'mg_key_123' });
      const expectedCredentials = Buffer.from('api:mg_key_123').toString('base64');
      expect(config.baseUrl).toBe('https://api.mailgun.net/v3');
      expect(config.headers?.['Authorization']).toBe(`Basic ${expectedCredentials}`);
    });

    it('should use domain in base URL', () => {
      const config = mailgun({ apiKey: 'mg_key_123', domain: 'mg.example.com' });
      expect(config.baseUrl).toBe('https://api.mailgun.net/v3/mg.example.com');
    });

    it('should use EU region', () => {
      const config = mailgun({ apiKey: 'mg_key_123', region: 'eu' });
      expect(config.baseUrl).toBe('https://api.eu.mailgun.net/v3');
    });

    it('should use EU region with domain', () => {
      const config = mailgun({ apiKey: 'mg_key_123', domain: 'mg.example.com', region: 'eu' });
      expect(config.baseUrl).toBe('https://api.eu.mailgun.net/v3/mg.example.com');
    });
  });

  describe('Meta / Facebook / Instagram / WhatsApp / Threads', () => {
    it('should create Meta config with access token', () => {
      const config = meta({ accessToken: 'meta_token_123' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v19.0');
      expect(config.defaults?.params?.access_token).toBe('meta_token_123');
    });

    it('should use custom API version', () => {
      const config = meta({ accessToken: 'meta_token_123', version: 'v20.0' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v20.0');
    });

    it('facebook should be alias for meta', () => {
      const config = facebook({ accessToken: 'fb_token_123' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v19.0');
      expect(config.defaults?.params?.access_token).toBe('fb_token_123');
    });

    it('instagram should be alias for meta', () => {
      const config = instagram({ accessToken: 'ig_token_123' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v19.0');
      expect(config.defaults?.params?.access_token).toBe('ig_token_123');
    });

    it('whatsapp should be alias for meta', () => {
      const config = whatsapp({ accessToken: 'wa_token_123' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v19.0');
      expect(config.defaults?.params?.access_token).toBe('wa_token_123');
    });

    it('threads should be alias for meta', () => {
      const config = threads({ accessToken: 'threads_token_123' });
      expect(config.baseUrl).toBe('https://graph.facebook.com/v19.0');
      expect(config.defaults?.params?.access_token).toBe('threads_token_123');
    });
  });

  describe('Oracle Cloud', () => {
    const ociOptions = {
      tenancyId: 'ocid1.tenancy.oc1..test',
      userId: 'ocid1.user.oc1..test',
      fingerprint: 'aa:bb:cc:dd:ee:ff',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
      region: 'us-ashburn-1',
    };

    it('should create Oracle config for core service', () => {
      const config = oracle({ ...ociOptions, service: 'core' });
      expect(config.baseUrl).toBe('https://iaas.us-ashburn-1.oraclecloud.com');
      expect(config.middlewares).toHaveLength(1);
    });

    it('should create Oracle config for objectstorage service', () => {
      const config = oracle({ ...ociOptions, service: 'objectstorage' });
      expect(config.baseUrl).toBe('https://objectstorage.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for database service', () => {
      const config = oracle({ ...ociOptions, service: 'database' });
      expect(config.baseUrl).toBe('https://database.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for identity service', () => {
      const config = oracle({ ...ociOptions, service: 'identity' });
      expect(config.baseUrl).toBe('https://identity.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for containerengine service', () => {
      const config = oracle({ ...ociOptions, service: 'containerengine' });
      expect(config.baseUrl).toBe('https://containerengine.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for functions service', () => {
      const config = oracle({ ...ociOptions, service: 'functions' });
      expect(config.baseUrl).toBe('https://functions.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for streaming service', () => {
      const config = oracle({ ...ociOptions, service: 'streaming' });
      expect(config.baseUrl).toBe('https://streaming.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for logging service', () => {
      const config = oracle({ ...ociOptions, service: 'logging' });
      expect(config.baseUrl).toBe('https://logging.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for monitoring service', () => {
      const config = oracle({ ...ociOptions, service: 'monitoring' });
      expect(config.baseUrl).toBe('https://telemetry.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for vault service', () => {
      const config = oracle({ ...ociOptions, service: 'vault' });
      expect(config.baseUrl).toBe('https://vaults.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for kms service', () => {
      const config = oracle({ ...ociOptions, service: 'kms' });
      expect(config.baseUrl).toBe('https://kms.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for nosql service', () => {
      const config = oracle({ ...ociOptions, service: 'nosql' });
      expect(config.baseUrl).toBe('https://nosql.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for apm service', () => {
      const config = oracle({ ...ociOptions, service: 'apm' });
      expect(config.baseUrl).toBe('https://apm.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for generativeai service', () => {
      const config = oracle({ ...ociOptions, service: 'generativeai' });
      expect(config.baseUrl).toBe('https://generativeai.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for aidocument service', () => {
      const config = oracle({ ...ociOptions, service: 'aidocument' });
      expect(config.baseUrl).toBe('https://document.us-ashburn-1.oraclecloud.com');
    });

    it('should create Oracle config for aivision service', () => {
      const config = oracle({ ...ociOptions, service: 'aivision' });
      expect(config.baseUrl).toBe('https://vision.us-ashburn-1.oraclecloud.com');
    });

    it('should fallback to generic URL for unknown service', () => {
      // @ts-expect-error Testing unknown service
      const config = oracle({ ...ociOptions, service: 'unknownservice' });
      expect(config.baseUrl).toBe('https://unknownservice.us-ashburn-1.oraclecloud.com');
    });

    it('ociCompute should be shortcut for core service', () => {
      const config = ociCompute(ociOptions);
      expect(config.baseUrl).toBe('https://iaas.us-ashburn-1.oraclecloud.com');
    });

    it('ociObjectStorage should be shortcut for objectstorage service', () => {
      const config = ociObjectStorage(ociOptions);
      expect(config.baseUrl).toBe('https://objectstorage.us-ashburn-1.oraclecloud.com');
    });

    it('ociDatabase should be shortcut for database service', () => {
      const config = ociDatabase(ociOptions);
      expect(config.baseUrl).toBe('https://database.us-ashburn-1.oraclecloud.com');
    });

    it('ociKubernetes should be shortcut for containerengine service', () => {
      const config = ociKubernetes(ociOptions);
      expect(config.baseUrl).toBe('https://containerengine.us-ashburn-1.oraclecloud.com');
    });

    it('ociGenerativeAI should be shortcut for generativeai service', () => {
      const config = ociGenerativeAI(ociOptions);
      expect(config.baseUrl).toBe('https://generativeai.us-ashburn-1.oraclecloud.com');
    });

    it('ociVault should be shortcut for vault service', () => {
      const config = ociVault(ociOptions);
      expect(config.baseUrl).toBe('https://vaults.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('Sinch', () => {
    it('should create config for SMS API (default)', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123' });
      const expectedCredentials = Buffer.from('key123:secret123').toString('base64');
      expect(config.baseUrl).toBe('https://us.sms.api.sinch.com/xms/v1/proj123');
      expect(config.headers?.['Authorization']).toBe(`Basic ${expectedCredentials}`);
    });

    it('should use EU region for SMS', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', region: 'eu' });
      expect(config.baseUrl).toBe('https://eu.sms.api.sinch.com/xms/v1/proj123');
    });

    it('should use AU region for SMS', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', region: 'au' });
      expect(config.baseUrl).toBe('https://au.sms.api.sinch.com/xms/v1/proj123');
    });

    it('should use BR region for SMS', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', region: 'br' });
      expect(config.baseUrl).toBe('https://br.sms.api.sinch.com/xms/v1/proj123');
    });

    it('should use CA region for SMS', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', region: 'ca' });
      expect(config.baseUrl).toBe('https://ca.sms.api.sinch.com/xms/v1/proj123');
    });

    it('should create config for Voice API', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', product: 'voice' });
      expect(config.baseUrl).toBe('https://calling.api.sinch.com/v1/projects/proj123');
    });

    it('should create config for Conversation API', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', product: 'conversation' });
      expect(config.baseUrl).toBe('https://us.conversation.api.sinch.com/v1/projects/proj123');
    });

    it('should create config for Numbers API', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', product: 'numbers' });
      expect(config.baseUrl).toBe('https://numbers.api.sinch.com/v1/projects/proj123');
    });

    it('should create config for Verification API', () => {
      const config = sinch({ projectId: 'proj123', keyId: 'key123', keySecret: 'secret123', product: 'verification' });
      expect(config.baseUrl).toBe('https://verification.api.sinch.com/v1/projects/proj123');
    });
  });

  describe('TikTok', () => {
    it('should create config with access token', () => {
      const config = tiktok({ accessToken: 'tt_token_123' });
      expect(config.baseUrl).toBe('https://open.tiktokapis.com/v2');
      expect(config.headers?.['Authorization']).toBe('Bearer tt_token_123');
    });

    it('tiktokBusiness should create config for Business API', () => {
      const config = tiktokBusiness({ accessToken: 'tt_biz_token_123' });
      expect(config.baseUrl).toBe('https://business-api.tiktok.com/open_api/v1.3');
      expect(config.headers?.['Access-Token']).toBe('tt_biz_token_123');
    });

    it('tiktokBusiness should include advertiser ID in defaults', () => {
      const config = tiktokBusiness({ accessToken: 'tt_biz_token_123', advertiserId: 'adv_123' });
      expect(config.defaults?.params?.advertiser_id).toBe('adv_123');
    });

    it('tiktokBusiness should not have defaults when no advertiserId', () => {
      const config = tiktokBusiness({ accessToken: 'tt_biz_token_123' });
      expect(config.defaults).toBeUndefined();
    });
  });

  describe('Vultr', () => {
    it('should create config with API key', () => {
      const config = vultr({ apiKey: 'vultr_key_123' });
      expect(config.baseUrl).toBe('https://api.vultr.com/v2');
      expect(config.headers?.['Authorization']).toBe('Bearer vultr_key_123');
    });
  });

  describe('YouTube', () => {
    it('should create config with API key', () => {
      const config = youtube({ apiKey: 'yt_key_123' });
      expect(config.baseUrl).toBe('https://www.googleapis.com/youtube/v3');
      expect(config.defaults?.params?.key).toBe('yt_key_123');
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
