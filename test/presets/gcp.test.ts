import { describe, it, expect, vi } from 'vitest';
import {
  gcp,
  gcpStorage,
  gcpCompute,
  gcpBigQuery,
  gcpPubSub,
  gcpCloudRun,
  gcpVertexAI,
  gcpFirestore,
  gcpSecretManager,
} from '../../src/presets/gcp.js';

describe('GCP Presets', () => {
  const baseApiKeyOptions = {
    projectId: 'my-project',
    auth: { type: 'api-key' as const, apiKey: 'test-api-key' }
  };

  const baseOauthOptions = {
    projectId: 'my-project',
    auth: { type: 'oauth' as const, accessToken: 'test-access-token' }
  };

  describe('gcp', () => {
    it('should create compute preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'compute' });
      expect(config.baseUrl).toBe('https://compute.googleapis.com');
      expect(config.headers?.['Content-Type']).toBe('application/json');
      expect(config.headers?.['X-Goog-User-Project']).toBe('my-project');
      expect(config.timeout).toBe(60000);
    });

    it('should create storage preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'storage' });
      expect(config.baseUrl).toBe('https://storage.googleapis.com');
    });

    it('should create bigquery preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'bigquery' });
      expect(config.baseUrl).toBe('https://bigquery.googleapis.com');
    });

    it('should create pubsub preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'pubsub' });
      expect(config.baseUrl).toBe('https://pubsub.googleapis.com');
    });

    it('should create firestore preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'firestore' });
      expect(config.baseUrl).toBe('https://firestore.googleapis.com');
    });

    it('should create cloudsql preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'cloudsql' });
      expect(config.baseUrl).toBe('https://sqladmin.googleapis.com');
    });

    it('should create kubernetes preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'kubernetes' });
      expect(config.baseUrl).toBe('https://container.googleapis.com');
    });

    it('should create translate preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'translate' });
      expect(config.baseUrl).toBe('https://translation.googleapis.com');
    });

    it('should create vision preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'vision' });
      expect(config.baseUrl).toBe('https://vision.googleapis.com');
    });

    it('should create speech preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'speech' });
      expect(config.baseUrl).toBe('https://speech.googleapis.com');
    });

    it('should create language preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'language' });
      expect(config.baseUrl).toBe('https://language.googleapis.com');
    });

    it('should create secretmanager preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'secretmanager' });
      expect(config.baseUrl).toBe('https://secretmanager.googleapis.com');
    });

    it('should create iam preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'iam' });
      expect(config.baseUrl).toBe('https://iam.googleapis.com');
    });

    it('should create logging preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'logging' });
      expect(config.baseUrl).toBe('https://logging.googleapis.com');
    });

    it('should create monitoring preset with correct endpoint', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'monitoring' });
      expect(config.baseUrl).toBe('https://monitoring.googleapis.com');
    });

    // Regional services
    it('should create run preset with default region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'run' });
      expect(config.baseUrl).toBe('https://us-central1-run.googleapis.com');
    });

    it('should create run preset with custom region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'run', region: 'europe-west1' });
      expect(config.baseUrl).toBe('https://europe-west1-run.googleapis.com');
    });

    it('should create aiplatform preset with default region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'aiplatform' });
      expect(config.baseUrl).toBe('https://us-central1-aiplatform.googleapis.com');
    });

    it('should create aiplatform preset with custom region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'aiplatform', region: 'asia-southeast1' });
      expect(config.baseUrl).toBe('https://asia-southeast1-aiplatform.googleapis.com');
    });

    it('should create functions preset with default region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'functions' });
      expect(config.baseUrl).toBe('https://us-central1-cloudfunctions.googleapis.com');
    });

    it('should create functions preset with custom region', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'functions', region: 'us-west1' });
      expect(config.baseUrl).toBe('https://us-west1-cloudfunctions.googleapis.com');
    });

    it('should handle unknown service with default pattern', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'unknown-service' as any });
      expect(config.baseUrl).toBe('https://unknown-service.googleapis.com');
    });

    it('should configure retry with exponential backoff', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'compute' });
      expect(config.retry?.maxAttempts).toBe(3);
      expect(config.retry?.backoff).toBe('exponential');
      expect(config.retry?.delay).toBe(1000);
      expect(config.retry?.statusCodes).toContain(429);
      expect(config.retry?.statusCodes).toContain(503);
    });

    it('should include middlewares for auth', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'compute' });
      expect(config.middlewares).toHaveLength(1);
    });
  });

  describe('GCP Auth Middleware', () => {
    it('should handle API key authentication', async () => {
      const config = gcp({
        projectId: 'my-project',
        auth: { type: 'api-key', apiKey: 'my-api-key-123' },
        service: 'translate'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://translation.googleapis.com/v2/translate',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      // API key should be added to URL params
      expect(mockNext).toHaveBeenCalled();
      const calledReq = mockNext.mock.calls[0][0];
      expect(calledReq.url).toContain('key=my-api-key-123');
    });

    it('should handle OAuth token authentication', async () => {
      const config = gcp({
        projectId: 'my-project',
        auth: { type: 'oauth', accessToken: 'my-oauth-token' },
        service: 'compute'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://compute.googleapis.com/v1/projects',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', 'Bearer my-oauth-token');
    });

    it('should handle OAuth token function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-token');
      const config = gcp({
        projectId: 'my-project',
        auth: { type: 'oauth', accessToken: tokenFn },
        service: 'storage'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://storage.googleapis.com/b/mybucket',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(tokenFn).toHaveBeenCalled();
      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', 'Bearer dynamic-token');
    });

    it('should throw error for service-account auth type', async () => {
      const config = gcp({
        projectId: 'my-project',
        auth: {
          type: 'service-account',
          credentials: {
            client_email: 'test@project.iam.gserviceaccount.com',
            private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
          }
        },
        service: 'compute'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://compute.googleapis.com/v1/projects',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await expect(middleware(mockReq as any, mockNext)).rejects.toThrow(
        'Service account authentication requires obtaining an access token first'
      );
    });
  });

  describe('gcpStorage', () => {
    it('should create Storage preset', () => {
      const config = gcpStorage(baseApiKeyOptions);
      expect(config.baseUrl).toBe('https://storage.googleapis.com');
    });
  });

  describe('gcpCompute', () => {
    it('should create Compute preset', () => {
      const config = gcpCompute(baseApiKeyOptions);
      expect(config.baseUrl).toBe('https://compute.googleapis.com');
    });
  });

  describe('gcpBigQuery', () => {
    it('should create BigQuery preset', () => {
      const config = gcpBigQuery(baseApiKeyOptions);
      expect(config.baseUrl).toBe('https://bigquery.googleapis.com');
    });
  });

  describe('gcpPubSub', () => {
    it('should create Pub/Sub preset', () => {
      const config = gcpPubSub(baseApiKeyOptions);
      expect(config.baseUrl).toBe('https://pubsub.googleapis.com');
    });
  });

  describe('gcpCloudRun', () => {
    it('should create Cloud Run preset with default region', () => {
      const config = gcpCloudRun(baseOauthOptions);
      expect(config.baseUrl).toBe('https://us-central1-run.googleapis.com');
    });

    it('should create Cloud Run preset with custom region', () => {
      const config = gcpCloudRun({ ...baseOauthOptions, region: 'asia-east1' });
      expect(config.baseUrl).toBe('https://asia-east1-run.googleapis.com');
    });
  });

  describe('gcpVertexAI', () => {
    it('should create Vertex AI preset with default region', () => {
      const config = gcpVertexAI(baseOauthOptions);
      expect(config.baseUrl).toBe('https://us-central1-aiplatform.googleapis.com');
    });

    it('should create Vertex AI preset with custom region', () => {
      const config = gcpVertexAI({ ...baseOauthOptions, region: 'europe-west4' });
      expect(config.baseUrl).toBe('https://europe-west4-aiplatform.googleapis.com');
    });
  });

  describe('gcpFirestore', () => {
    it('should create Firestore preset', () => {
      const config = gcpFirestore(baseApiKeyOptions);
      expect(config.baseUrl).toBe('https://firestore.googleapis.com');
    });
  });

  describe('gcpSecretManager', () => {
    it('should create Secret Manager preset', () => {
      const config = gcpSecretManager(baseOauthOptions);
      expect(config.baseUrl).toBe('https://secretmanager.googleapis.com');
    });
  });

  describe('edge cases', () => {
    it('should preserve all configuration properties', () => {
      const config = gcp({ ...baseApiKeyOptions, service: 'compute' });

      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('headers');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('middlewares');
    });

    it('should set project ID header', () => {
      const config = gcp({
        projectId: 'custom-project-id',
        auth: { type: 'api-key', apiKey: 'test' },
        service: 'storage'
      });

      expect(config.headers?.['X-Goog-User-Project']).toBe('custom-project-id');
    });
  });
});
