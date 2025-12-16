import { ClientOptions } from '../types/index.js';

export interface HubSpotPresetOptions {
  /**
   * HubSpot API key (legacy) or Private App access token
   * Private App tokens start with 'pat-'
   */
  accessToken: string;
  /**
   * Portal ID (optional, some endpoints require it)
   */
  portalId?: string;
}

/**
 * HubSpot CRM API preset
 *
 * Particularities:
 * - Rate limits vary by tier (Free: 100/10s, Starter: 150/10s, Pro: 200/10s)
 * - Uses Bearer token auth (Private App) or hapikey query param (legacy)
 * - Burst limits: 100 requests per 10 seconds
 * - Daily limits vary by subscription
 *
 * @see https://developers.hubspot.com/docs/api/usage-details
 *
 * @example
 * ```typescript
 * const client = createClient(hubspot({ accessToken: 'pat-xxx' }));
 *
 * // Get contacts
 * await client.get('/crm/v3/objects/contacts').json();
 *
 * // Create deal
 * await client.post('/crm/v3/objects/deals', {
 *   json: { properties: { dealname: 'New Deal', amount: '1000' } }
 * }).json();
 * ```
 */
export function hubspot(options: HubSpotPresetOptions): ClientOptions {
  return {
    baseUrl: 'https://api.hubapi.com',
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      // HubSpot returns 429 with Retry-After header
      statusCodes: [408, 429, 500, 502, 503, 504],
      // Respect Retry-After header (enabled by default in Recker)
    }
  };
}

/**
 * HubSpot CRM API sub-presets for specific objects
 */
export const hubspotContacts = (options: HubSpotPresetOptions): ClientOptions => ({
  ...hubspot(options),
  baseUrl: 'https://api.hubapi.com/crm/v3/objects/contacts',
});

export const hubspotDeals = (options: HubSpotPresetOptions): ClientOptions => ({
  ...hubspot(options),
  baseUrl: 'https://api.hubapi.com/crm/v3/objects/deals',
});

export const hubspotCompanies = (options: HubSpotPresetOptions): ClientOptions => ({
  ...hubspot(options),
  baseUrl: 'https://api.hubapi.com/crm/v3/objects/companies',
});
