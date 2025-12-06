import { describe, it, expect, vi } from 'vitest';
import {
  azure,
  azureResourceManager,
  azureBlobStorage,
  azureKeyVault,
  azureCosmosDB,
  microsoftGraph,
  azureDevOps,
  azureCognitiveServices,
} from '../../src/presets/azure.js';

describe('Azure Presets', () => {
  const baseAuthBearer = {
    auth: { type: 'bearer' as const, token: 'test-token' }
  };

  const baseAuthSAS = {
    auth: { type: 'sas' as const, sasToken: 'sv=2020-08-04&ss=bfqt&srt=sco&sp=rwdlacuptfx&se=2025-01-01' }
  };

  const baseAuthSharedKey = {
    auth: { type: 'shared-key' as const, accountName: 'testaccount', accountKey: 'testkey' }
  };

  describe('azure', () => {
    it('should create management preset with correct endpoint', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'management',
        subscriptionId: 'sub-123'
      });
      expect(config.baseUrl).toBe('https://management.azure.com');
      expect(config.headers?.['x-ms-version']).toBe('2023-01-01');
      expect(config.timeout).toBe(60000);
    });

    it('should create storage-blob preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'storage-blob',
        accountName: 'mystorageaccount'
      });
      expect(config.baseUrl).toBe('https://mystorageaccount.blob.core.windows.net');
    });

    it('should create storage-queue preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'storage-queue',
        accountName: 'mystorageaccount'
      });
      expect(config.baseUrl).toBe('https://mystorageaccount.queue.core.windows.net');
    });

    it('should create storage-table preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'storage-table',
        accountName: 'mystorageaccount'
      });
      expect(config.baseUrl).toBe('https://mystorageaccount.table.core.windows.net');
    });

    it('should create storage-file preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'storage-file',
        accountName: 'mystorageaccount'
      });
      expect(config.baseUrl).toBe('https://mystorageaccount.file.core.windows.net');
    });

    it('should create cosmos-db preset with account name', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'cosmos-db',
        accountName: 'mycosmosdb'
      });
      expect(config.baseUrl).toBe('https://mycosmosdb.documents.azure.com');
    });

    it('should create keyvault preset with account name', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'keyvault',
        accountName: 'mykeyvault'
      });
      expect(config.baseUrl).toBe('https://mykeyvault.vault.azure.net');
    });

    it('should create servicebus preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'servicebus',
        accountName: 'myservicebus'
      });
      expect(config.baseUrl).toBe('https://myservicebus.servicebus.windows.net');
    });

    it('should create eventhubs preset with account name', () => {
      const config = azure({
        ...baseAuthSAS,
        service: 'eventhubs',
        accountName: 'myeventhub'
      });
      expect(config.baseUrl).toBe('https://myeventhub.servicebus.windows.net');
    });

    it('should create cognitive preset with region', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'cognitive',
        region: 'westus2'
      });
      expect(config.baseUrl).toBe('https://westus2.api.cognitive.microsoft.com');
    });

    it('should create cognitive preset with default region', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'cognitive'
      });
      expect(config.baseUrl).toBe('https://eastus.api.cognitive.microsoft.com');
    });

    it('should create devops preset', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'devops'
      });
      expect(config.baseUrl).toBe('https://dev.azure.com');
    });

    it('should create graph preset', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'graph'
      });
      expect(config.baseUrl).toBe('https://graph.microsoft.com/v1.0');
    });

    it('should create monitor preset', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'monitor'
      });
      expect(config.baseUrl).toBe('https://management.azure.com');
      expect(config.headers?.['x-ms-version']).toBe('2023-01-01');
    });

    it('should create containerregistry preset', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'containerregistry',
        accountName: 'myregistry'
      });
      expect(config.baseUrl).toBe('https://myregistry.azurecr.io');
    });

    it('should handle unknown service with default endpoint', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'functions' as any
      });
      expect(config.baseUrl).toBe('https://management.azure.com');
    });

    it('should configure retry with exponential backoff', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'management'
      });
      expect(config.retry?.maxAttempts).toBe(3);
      expect(config.retry?.backoff).toBe('exponential');
      expect(config.retry?.delay).toBe(1000);
      expect(config.retry?.statusCodes).toContain(429);
      expect(config.retry?.statusCodes).toContain(503);
    });

    it('should include middlewares for auth', () => {
      const config = azure({
        ...baseAuthBearer,
        service: 'management'
      });
      expect(config.middlewares).toHaveLength(1);
    });
  });

  describe('Azure Auth Middleware', () => {
    it('should handle bearer token authentication', async () => {
      const config = azure({
        auth: { type: 'bearer', token: 'my-bearer-token' },
        service: 'management'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://management.azure.com/test',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', 'Bearer my-bearer-token');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle bearer token function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-token');
      const config = azure({
        auth: { type: 'bearer', token: tokenFn },
        service: 'management'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://management.azure.com/test',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(tokenFn).toHaveBeenCalled();
      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', 'Bearer dynamic-token');
    });

    it('should handle SAS token authentication', async () => {
      const config = azure({
        auth: { type: 'sas', sasToken: 'sv=2020&ss=b&srt=sco' },
        service: 'storage-blob',
        accountName: 'test'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://test.blob.core.windows.net/container/blob',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      // SAS token modifies the URL, not headers
      expect(mockNext).toHaveBeenCalled();
      const calledReq = mockNext.mock.calls[0][0];
      expect(calledReq.url).toContain('sv=2020');
      expect(calledReq.url).toContain('ss=b');
    });

    it('should handle SAS token with leading question mark', async () => {
      const config = azure({
        auth: { type: 'sas', sasToken: '?sv=2020&ss=b' },
        service: 'storage-blob',
        accountName: 'test'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://test.blob.core.windows.net/container/blob',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      const calledReq = mockNext.mock.calls[0][0];
      expect(calledReq.url).toContain('sv=2020');
    });

    it('should handle shared-key authentication', async () => {
      const config = azure({
        auth: { type: 'shared-key', accountName: 'myaccount', accountKey: 'mykey' },
        service: 'storage-blob',
        accountName: 'myaccount'
      });

      const middleware = config.middlewares![0];
      const mockReq = {
        url: 'https://myaccount.blob.core.windows.net/test',
        withHeader: vi.fn().mockReturnThis(),
      };
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await middleware(mockReq as any, mockNext);

      expect(mockReq.withHeader).toHaveBeenCalledWith('Authorization', 'SharedKey myaccount:mykey');
    });
  });

  describe('azureResourceManager', () => {
    it('should create Resource Manager preset', () => {
      const config = azureResourceManager({
        ...baseAuthBearer,
        subscriptionId: 'sub-123'
      });
      expect(config.baseUrl).toBe('https://management.azure.com');
    });
  });

  describe('azureBlobStorage', () => {
    it('should create Blob Storage preset', () => {
      const config = azureBlobStorage({
        ...baseAuthSAS,
        accountName: 'myblobaccount'
      });
      expect(config.baseUrl).toBe('https://myblobaccount.blob.core.windows.net');
    });
  });

  describe('azureKeyVault', () => {
    it('should create Key Vault preset', () => {
      const config = azureKeyVault({
        ...baseAuthBearer,
        accountName: 'myvault'
      });
      expect(config.baseUrl).toBe('https://myvault.vault.azure.net');
    });
  });

  describe('azureCosmosDB', () => {
    it('should create Cosmos DB preset', () => {
      const config = azureCosmosDB({
        ...baseAuthBearer,
        accountName: 'mycosmos'
      });
      expect(config.baseUrl).toBe('https://mycosmos.documents.azure.com');
    });
  });

  describe('microsoftGraph', () => {
    it('should create Microsoft Graph preset', () => {
      const config = microsoftGraph(baseAuthBearer);
      expect(config.baseUrl).toBe('https://graph.microsoft.com/v1.0');
    });
  });

  describe('azureDevOps', () => {
    it('should create Azure DevOps preset', () => {
      const config = azureDevOps(baseAuthBearer);
      expect(config.baseUrl).toBe('https://dev.azure.com');
    });
  });

  describe('azureCognitiveServices', () => {
    it('should create Cognitive Services preset', () => {
      const config = azureCognitiveServices({
        ...baseAuthBearer,
        region: 'westeurope'
      });
      expect(config.baseUrl).toBe('https://westeurope.api.cognitive.microsoft.com');
    });
  });
});
