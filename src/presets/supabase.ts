import { ClientOptions } from '../types/index.js';

export interface SupabasePresetOptions {
  /**
   * Supabase project URL
   * Example: 'https://xyzcompany.supabase.co'
   */
  projectUrl: string;
  /**
   * Supabase anon key (public) or service role key (server-side)
   */
  apiKey: string;
}

/**
 * Supabase REST API preset
 * @see https://supabase.com/docs/guides/api
 */
export function supabase(options: SupabasePresetOptions): ClientOptions {
  return {
    baseUrl: `${options.projectUrl}/rest/v1`,
    headers: {
      'apikey': options.apiKey,
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
