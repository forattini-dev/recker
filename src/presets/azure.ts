import { ClientOptions, Middleware } from '../types/index.js';

export interface AzurePresetOptions {
  /**
   * Azure Subscription ID
   */
  subscriptionId?: string;
  /**
   * Azure Resource Group (optional)
   */
  resourceGroup?: string;
  /**
   * Authentication options
   */
  auth: AzureAuthOptions;
}

export type AzureAuthOptions =
  | { type: 'bearer'; token: string | (() => string | Promise<string>) }
  | { type: 'shared-key'; accountName: string; accountKey: string }
  | { type: 'sas'; sasToken: string };

export type AzureService =
  | 'management'        // Azure Resource Manager
  | 'storage-blob'      // Blob Storage
  | 'storage-queue'     // Queue Storage
  | 'storage-table'     // Table Storage
  | 'storage-file'      // File Storage
  | 'cosmos-db'         // Cosmos DB
  | 'keyvault'          // Key Vault
  | 'servicebus'        // Service Bus
  | 'eventhubs'         // Event Hubs
  | 'functions'         // Azure Functions
  | 'cognitive'         // Cognitive Services
  | 'devops'            // Azure DevOps
  | 'graph'             // Microsoft Graph
  | 'monitor'           // Azure Monitor
  | 'containerregistry';// Container Registry

/**
 * Get Azure API base URL for a service
 */
function getAzureServiceUrl(
  service: AzureService,
  options: {
    subscriptionId?: string;
    resourceGroup?: string;
    accountName?: string;
    region?: string;
  }
): string {
  const { subscriptionId, accountName, region } = options;

  switch (service) {
    case 'management':
      return 'https://management.azure.com';

    case 'storage-blob':
      return `https://${accountName}.blob.core.windows.net`;

    case 'storage-queue':
      return `https://${accountName}.queue.core.windows.net`;

    case 'storage-table':
      return `https://${accountName}.table.core.windows.net`;

    case 'storage-file':
      return `https://${accountName}.file.core.windows.net`;

    case 'cosmos-db':
      return `https://${accountName}.documents.azure.com`;

    case 'keyvault':
      return `https://${accountName}.vault.azure.net`;

    case 'servicebus':
      return `https://${accountName}.servicebus.windows.net`;

    case 'eventhubs':
      return `https://${accountName}.servicebus.windows.net`;

    case 'cognitive':
      return `https://${region || 'eastus'}.api.cognitive.microsoft.com`;

    case 'devops':
      return 'https://dev.azure.com';

    case 'graph':
      return 'https://graph.microsoft.com/v1.0';

    case 'monitor':
      return 'https://management.azure.com';

    case 'containerregistry':
      return `https://${accountName}.azurecr.io`;

    default:
      return 'https://management.azure.com';
  }
}

/**
 * Create Azure auth middleware
 */
function createAzureAuthMiddleware(auth: AzureAuthOptions): Middleware {
  return async (req, next) => {
    let newReq = req;

    if (auth.type === 'bearer') {
      const token = typeof auth.token === 'function'
        ? await auth.token()
        : auth.token;
      newReq = req.withHeader('Authorization', `Bearer ${token}`);
    } else if (auth.type === 'sas') {
      // Append SAS token to URL
      const url = new URL(req.url);
      const sasParams = new URLSearchParams(auth.sasToken.startsWith('?') ? auth.sasToken.slice(1) : auth.sasToken);
      sasParams.forEach((value, key) => url.searchParams.set(key, value));
      newReq = { ...req, url: url.toString() } as typeof req;
    } else if (auth.type === 'shared-key') {
      // Shared Key auth requires request signing (similar to AWS Sig V4)
      // This is a simplified version - full implementation would require HMAC signing
      const authHeader = `SharedKey ${auth.accountName}:${auth.accountKey}`;
      newReq = req.withHeader('Authorization', authHeader);
    }

    return next(newReq);
  };
}

export interface AzureFullPresetOptions extends AzurePresetOptions {
  service: AzureService;
  /**
   * Account name (for storage, keyvault, etc.)
   */
  accountName?: string;
  /**
   * Azure region (for regional services)
   */
  region?: string;
}

/**
 * Microsoft Azure API preset
 * @see https://docs.microsoft.com/en-us/rest/api/azure/
 *
 * @example
 * ```typescript
 * import { azure } from 'recker/presets';
 *
 * // Azure Resource Manager
 * const arm = createClient(azure({
 *   subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
 *   auth: { type: 'bearer', token: process.env.AZURE_TOKEN },
 *   service: 'management'
 * }));
 *
 * // Azure Blob Storage
 * const blob = createClient(azure({
 *   auth: { type: 'sas', sasToken: process.env.AZURE_SAS_TOKEN },
 *   service: 'storage-blob',
 *   accountName: 'mystorageaccount'
 * }));
 *
 * // Microsoft Graph
 * const graph = createClient(azure({
 *   auth: { type: 'bearer', token: process.env.AZURE_TOKEN },
 *   service: 'graph'
 * }));
 * ```
 */
export function azure(options: AzureFullPresetOptions): ClientOptions {
  const baseUrl = getAzureServiceUrl(options.service, {
    subscriptionId: options.subscriptionId,
    resourceGroup: options.resourceGroup,
    accountName: options.accountName,
    region: options.region,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add API version for management APIs
  if (options.service === 'management' || options.service === 'monitor') {
    headers['x-ms-version'] = '2023-01-01';
  }

  return {
    baseUrl,
    headers,
    timeout: 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    middlewares: [createAzureAuthMiddleware(options.auth)]
  };
}

/**
 * Azure Resource Manager preset
 */
export function azureResourceManager(options: Omit<AzurePresetOptions, 'service'> & { subscriptionId: string }): ClientOptions {
  return azure({ ...options, service: 'management' });
}

/**
 * Azure Blob Storage preset
 */
export function azureBlobStorage(options: Omit<AzurePresetOptions, 'service'> & { accountName: string }): ClientOptions {
  return azure({ ...options, service: 'storage-blob' });
}

/**
 * Azure Key Vault preset
 */
export function azureKeyVault(options: Omit<AzurePresetOptions, 'service'> & { accountName: string }): ClientOptions {
  return azure({ ...options, service: 'keyvault' });
}

/**
 * Azure Cosmos DB preset
 */
export function azureCosmosDB(options: Omit<AzurePresetOptions, 'service'> & { accountName: string }): ClientOptions {
  return azure({ ...options, service: 'cosmos-db' });
}

/**
 * Microsoft Graph API preset
 */
export function microsoftGraph(options: Omit<AzurePresetOptions, 'service'>): ClientOptions {
  return azure({ ...options, service: 'graph' });
}

/**
 * Azure DevOps API preset
 */
export function azureDevOps(options: Omit<AzurePresetOptions, 'service'>): ClientOptions {
  return azure({ ...options, service: 'devops' });
}

/**
 * Azure Cognitive Services preset
 */
export function azureCognitiveServices(options: Omit<AzurePresetOptions, 'service'> & { region: string }): ClientOptions {
  return azure({ ...options, service: 'cognitive' });
}
