import { describe, it, expect, vi } from 'vitest';
import {
  oracle,
  ociCompute,
  ociObjectStorage,
  ociDatabase,
  ociKubernetes,
  ociGenerativeAI,
  ociVault,
} from '../../src/presets/oracle.js';
import { generateKeyPairSync } from 'node:crypto';

describe('Oracle Cloud Presets', () => {
  // Generate a real RSA key pair for testing
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const baseOptions = {
    tenancyId: 'ocid1.tenancy.oc1..example',
    userId: 'ocid1.user.oc1..example',
    fingerprint: 'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99',
    privateKey: privateKey as string,
    region: 'us-ashburn-1',
  };

  describe('oracle', () => {
    it('should create core preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      expect(config.baseUrl).toBe('https://iaas.us-ashburn-1.oraclecloud.com');
      expect(config.headers?.['Content-Type']).toBe('application/json');
      expect(config.timeout).toBe(60000);
    });

    it('should create objectstorage preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'objectstorage' });
      expect(config.baseUrl).toBe('https://objectstorage.us-ashburn-1.oraclecloud.com');
    });

    it('should create database preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'database' });
      expect(config.baseUrl).toBe('https://database.us-ashburn-1.oraclecloud.com');
    });

    it('should create identity preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'identity' });
      expect(config.baseUrl).toBe('https://identity.us-ashburn-1.oraclecloud.com');
    });

    it('should create containerengine preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'containerengine' });
      expect(config.baseUrl).toBe('https://containerengine.us-ashburn-1.oraclecloud.com');
    });

    it('should create functions preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'functions' });
      expect(config.baseUrl).toBe('https://functions.us-ashburn-1.oraclecloud.com');
    });

    it('should create streaming preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'streaming' });
      expect(config.baseUrl).toBe('https://streaming.us-ashburn-1.oraclecloud.com');
    });

    it('should create logging preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'logging' });
      expect(config.baseUrl).toBe('https://logging.us-ashburn-1.oraclecloud.com');
    });

    it('should create monitoring preset with telemetry endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'monitoring' });
      expect(config.baseUrl).toBe('https://telemetry.us-ashburn-1.oraclecloud.com');
    });

    it('should create vault preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'vault' });
      expect(config.baseUrl).toBe('https://vaults.us-ashburn-1.oraclecloud.com');
    });

    it('should create kms preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'kms' });
      expect(config.baseUrl).toBe('https://kms.us-ashburn-1.oraclecloud.com');
    });

    it('should create nosql preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'nosql' });
      expect(config.baseUrl).toBe('https://nosql.us-ashburn-1.oraclecloud.com');
    });

    it('should create apm preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'apm' });
      expect(config.baseUrl).toBe('https://apm.us-ashburn-1.oraclecloud.com');
    });

    it('should create generativeai preset with correct endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'generativeai' });
      expect(config.baseUrl).toBe('https://generativeai.us-ashburn-1.oraclecloud.com');
    });

    it('should create aidocument preset with document endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'aidocument' });
      expect(config.baseUrl).toBe('https://document.us-ashburn-1.oraclecloud.com');
    });

    it('should create aivision preset with vision endpoint', () => {
      const config = oracle({ ...baseOptions, service: 'aivision' });
      expect(config.baseUrl).toBe('https://vision.us-ashburn-1.oraclecloud.com');
    });

    it('should handle unknown service with default pattern', () => {
      const config = oracle({ ...baseOptions, service: 'custom-service' as any });
      expect(config.baseUrl).toBe('https://custom-service.us-ashburn-1.oraclecloud.com');
    });

    it('should configure retry with exponential backoff', () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      expect(config.retry?.maxAttempts).toBe(3);
      expect(config.retry?.backoff).toBe('exponential');
      expect(config.retry?.delay).toBe(1000);
      expect(config.retry?.statusCodes).toContain(429);
      expect(config.retry?.statusCodes).toContain(503);
      expect(config.retry?.statusCodes).toContain(408);
    });

    it('should include middleware for signing', () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      expect(config.middlewares).toHaveLength(1);
    });

    it('should work with different regions', () => {
      const config = oracle({
        ...baseOptions,
        region: 'eu-frankfurt-1',
        service: 'core'
      });
      expect(config.baseUrl).toBe('https://iaas.eu-frankfurt-1.oraclecloud.com');
    });

    it('should work with ap-tokyo region', () => {
      const config = oracle({
        ...baseOptions,
        region: 'ap-tokyo-1',
        service: 'objectstorage'
      });
      expect(config.baseUrl).toBe('https://objectstorage.ap-tokyo-1.oraclecloud.com');
    });
  });

  describe('OCI Signing Middleware', () => {
    it('should add Authorization header for GET request', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances',
        method: 'GET',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', expect.stringContaining('Signature'));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', expect.stringContaining('keyId='));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', expect.stringContaining('rsa-sha256'));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Date', expect.any(String));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Host', 'iaas.us-ashburn-1.oraclecloud.com');
    });

    it('should add content headers for POST request', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances',
        method: 'POST',
        body: JSON.stringify({ name: 'test-instance' }),
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 201 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('should add content headers for PUT request', async () => {
      const config = oracle({ ...baseOptions, service: 'objectstorage' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/namespace/b/bucket/o/object',
        method: 'PUT',
        body: 'file content',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
    });

    it('should add content headers for PATCH request', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances/ocid1.instance...',
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'updated-name' }),
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
      expect(mockReq.withHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('should handle empty body in POST request', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/actions/start',
        method: 'POST',
        body: undefined,
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      // Should still add x-content-sha256 (hash of empty string)
      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
    });

    it('should handle ArrayBuffer body', async () => {
      const config = oracle({ ...baseOptions, service: 'objectstorage' });
      const middleware = config.middlewares![0];

      const bodyBuffer = new ArrayBuffer(8);
      const view = new Uint8Array(bodyBuffer);
      view.set([1, 2, 3, 4, 5, 6, 7, 8]);

      const mockReq = {
        url: 'https://objectstorage.us-ashburn-1.oraclecloud.com/n/namespace/b/bucket/o/object',
        method: 'PUT',
        body: bodyBuffer,
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
    });

    it('should build correct keyId in Authorization header', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances',
        method: 'GET',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      const authCall = mockReq.withHeader.mock.calls.find(
        (call: any[]) => call[0] === 'Authorization'
      );
      expect(authCall).toBeDefined();
      const authHeader = authCall![1];
      expect(authHeader).toContain(`keyId="${baseOptions.tenancyId}/${baseOptions.userId}/${baseOptions.fingerprint}"`);
    });

    it('should include query parameters in request-target', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances?compartmentId=ocid1.compartment.oc1..example',
        method: 'GET',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should support passphrase-protected private key', async () => {
      // Generate a key with passphrase
      const { privateKey: encryptedKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: 'test-passphrase'
        }
      });

      const config = oracle({
        ...baseOptions,
        privateKey: encryptedKey as string,
        passphrase: 'test-passphrase',
        service: 'core'
      });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances',
        method: 'GET',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', expect.stringContaining('Signature'));
    });
  });

  describe('ociCompute', () => {
    it('should create Compute preset', () => {
      const config = ociCompute(baseOptions);
      expect(config.baseUrl).toBe('https://iaas.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('ociObjectStorage', () => {
    it('should create Object Storage preset', () => {
      const config = ociObjectStorage(baseOptions);
      expect(config.baseUrl).toBe('https://objectstorage.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('ociDatabase', () => {
    it('should create Database preset', () => {
      const config = ociDatabase(baseOptions);
      expect(config.baseUrl).toBe('https://database.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('ociKubernetes', () => {
    it('should create Container Engine (OKE) preset', () => {
      const config = ociKubernetes(baseOptions);
      expect(config.baseUrl).toBe('https://containerengine.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('ociGenerativeAI', () => {
    it('should create Generative AI preset', () => {
      const config = ociGenerativeAI(baseOptions);
      expect(config.baseUrl).toBe('https://generativeai.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('ociVault', () => {
    it('should create Vault preset', () => {
      const config = ociVault(baseOptions);
      expect(config.baseUrl).toBe('https://vaults.us-ashburn-1.oraclecloud.com');
    });
  });

  describe('edge cases', () => {
    it('should preserve all configuration properties', () => {
      const config = oracle({ ...baseOptions, service: 'core' });

      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('headers');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('middlewares');
    });

    it('should handle lowercase method names', async () => {
      const config = oracle({ ...baseOptions, service: 'core' });
      const middleware = config.middlewares![0];

      const mockReq = {
        url: 'https://iaas.us-ashburn-1.oraclecloud.com/20160918/instances',
        method: 'post',  // lowercase
        body: '{}',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 201 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('x-content-sha256', expect.any(String));
    });

    it('should work with all supported regions', () => {
      const regions = [
        'us-ashburn-1',
        'us-phoenix-1',
        'eu-frankfurt-1',
        'uk-london-1',
        'ap-tokyo-1',
        'ap-sydney-1',
        'ca-toronto-1',
        'sa-saopaulo-1',
      ];

      regions.forEach(region => {
        const config = oracle({ ...baseOptions, region, service: 'core' });
        expect(config.baseUrl).toBe(`https://iaas.${region}.oraclecloud.com`);
      });
    });
  });
});
