import { ClientOptions } from '../types/index.js';

export interface SentryPresetOptions {
  /**
   * Sentry Auth Token (for API access)
   * Generate at: https://sentry.io/settings/account/api/auth-tokens/
   */
  authToken: string;
  /**
   * Organization slug
   */
  organization?: string;
}

export interface SentryDSNPresetOptions {
  /**
   * Sentry DSN (for sending events)
   * Format: https://key@org.ingest.sentry.io/project_id
   */
  dsn: string;
}

/**
 * Sentry API preset (for API access)
 *
 * Particularities:
 * - Two modes: API access (auth token) vs Event ingestion (DSN)
 * - API has strict rate limits
 * - Event ingestion uses envelope format
 *
 * @see https://docs.sentry.io/api/
 *
 * @example API Access
 * ```typescript
 * const client = createClient(sentry({
 *   authToken: 'sntrys_xxx',
 *   organization: 'my-org'
 * }));
 *
 * // List projects
 * await client.get('/projects/').json();
 *
 * // Get issues
 * await client.get('/organizations/my-org/issues/').json();
 * ```
 */
export function sentry(options: SentryPresetOptions): ClientOptions {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.authToken}`,
    'Content-Type': 'application/json',
  };

  return {
    baseUrl: 'https://sentry.io/api/0',
    headers,
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * Parse Sentry DSN into components
 */
function parseDSN(dsn: string): { publicKey: string; host: string; projectId: string } {
  const url = new URL(dsn);
  const publicKey = url.username;
  const host = url.host;
  const projectId = url.pathname.slice(1); // Remove leading /
  return { publicKey, host, projectId };
}

/**
 * Sentry Event Ingestion preset (for sending errors/events)
 *
 * @example Send Error Event
 * ```typescript
 * const client = createClient(sentryIngest({
 *   dsn: 'https://key@org.ingest.sentry.io/123456'
 * }));
 *
 * // Send error event
 * await client.post('/envelope/', {
 *   body: createSentryEnvelope({
 *     event_id: crypto.randomUUID().replace(/-/g, ''),
 *     timestamp: Date.now() / 1000,
 *     platform: 'node',
 *     exception: {
 *       values: [{
 *         type: 'Error',
 *         value: 'Something went wrong',
 *         stacktrace: { frames: [] }
 *       }]
 *     }
 *   })
 * });
 * ```
 */
export function sentryIngest(options: SentryDSNPresetOptions): ClientOptions {
  const { publicKey, host, projectId } = parseDSN(options.dsn);

  return {
    baseUrl: `https://${host}/api/${projectId}`,
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=recker/1.0, sentry_key=${publicKey}`,
    },
    timeout: 10 * 1000, // Fast timeout for event ingestion
    retry: {
      maxAttempts: 2, // Don't retry too much for telemetry
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * Helper to create Sentry envelope format
 */
export function createSentryEnvelope(event: Record<string, unknown>): string {
  const eventId = event.event_id || crypto.randomUUID().replace(/-/g, '');
  const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
  const itemHeader = JSON.stringify({ type: 'event' });
  const payload = JSON.stringify(event);

  return `${header}\n${itemHeader}\n${payload}`;
}
