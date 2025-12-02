import { Client } from '../core/client.js';

export interface IpInfo {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string; // Lat,Long
  org?: string; // ASN + Org Name
  timezone?: string;
  postal?: string;
  anycast?: boolean;
  bogon?: boolean; // Private/Reserved IP
}

/**
 * IP Intelligence Service
 * Uses ipinfo.io (free tier, no token required for basic info)
 * or similar services.
 */
export async function getIpInfo(ip: string): Promise<IpInfo> {
  // Basic validation for Bogon IPs
  if (
    ip.startsWith('127.') || 
    ip.startsWith('10.') || 
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip === '::1'
  ) {
    return { ip, bogon: true, org: 'Localhost / Private Network' };
  }

  try {
    // Create a transient client
    const client = new Client();
    
    // Use ipinfo.io/json API (rate limited to 50k/month free, adequate for CLI)
    const url = `https://ipinfo.io/${ip}/json`;
    
    const data = await client.get(url).json<any>();
    
    return {
        ip: data.ip,
        hostname: data.hostname,
        city: data.city,
        region: data.region,
        country: data.country,
        loc: data.loc,
        org: data.org,
        timezone: data.timezone,
        postal: data.postal,
        anycast: data.anycast
    };
  } catch (error) {
    throw new Error(`Failed to fetch IP info: ${(error as Error).message}`);
  }
}
