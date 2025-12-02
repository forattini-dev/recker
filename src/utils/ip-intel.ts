import { Client } from '../core/client.js';
import { NetworkError } from '../core/errors.js';

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
  bogonType?: string; // Type of bogon (loopback, private, link-local, etc.)
  isIPv6?: boolean;
}

// IPv4 Bogon Ranges (IANA reserved, RFC 5735, etc.)
const IPV4_BOGON_RANGES = [
  { prefix: '0.', desc: 'This Network (RFC 1122)' },
  { prefix: '10.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '100.64.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.65.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.66.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.67.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.68.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.69.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.70.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.71.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.72.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.73.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.74.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.75.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.76.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.77.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.78.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.79.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.80.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.81.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.82.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.83.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.84.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.85.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.86.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.87.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.88.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.89.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.90.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.91.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.92.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.93.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.94.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.95.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.96.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.97.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.98.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.99.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.100.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.101.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.102.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.103.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.104.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.105.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.106.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.107.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.108.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.109.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.110.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.111.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.112.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.113.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.114.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.115.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.116.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.117.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.118.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.119.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.120.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.121.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.122.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.123.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.124.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.125.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.126.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '100.127.', desc: 'Carrier-Grade NAT (RFC 6598)' },
  { prefix: '127.', desc: 'Loopback (RFC 1122)' },
  { prefix: '169.254.', desc: 'Link-Local (RFC 3927)' },
  { prefix: '172.16.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.17.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.18.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.19.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.20.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.21.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.22.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.23.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.24.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.25.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.26.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.27.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.28.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.29.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.30.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '172.31.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '192.0.0.', desc: 'IETF Protocol Assignments (RFC 6890)' },
  { prefix: '192.0.2.', desc: 'Documentation TEST-NET-1 (RFC 5737)' },
  { prefix: '192.88.99.', desc: '6to4 Relay Anycast (RFC 3068)' },
  { prefix: '192.168.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '198.18.', desc: 'Benchmarking (RFC 2544)' },
  { prefix: '198.19.', desc: 'Benchmarking (RFC 2544)' },
  { prefix: '198.51.100.', desc: 'Documentation TEST-NET-2 (RFC 5737)' },
  { prefix: '203.0.113.', desc: 'Documentation TEST-NET-3 (RFC 5737)' },
  { prefix: '224.', desc: 'Multicast (RFC 5771)' },
  { prefix: '225.', desc: 'Multicast (RFC 5771)' },
  { prefix: '226.', desc: 'Multicast (RFC 5771)' },
  { prefix: '227.', desc: 'Multicast (RFC 5771)' },
  { prefix: '228.', desc: 'Multicast (RFC 5771)' },
  { prefix: '229.', desc: 'Multicast (RFC 5771)' },
  { prefix: '230.', desc: 'Multicast (RFC 5771)' },
  { prefix: '231.', desc: 'Multicast (RFC 5771)' },
  { prefix: '232.', desc: 'Multicast (RFC 5771)' },
  { prefix: '233.', desc: 'Multicast (RFC 5771)' },
  { prefix: '234.', desc: 'Multicast (RFC 5771)' },
  { prefix: '235.', desc: 'Multicast (RFC 5771)' },
  { prefix: '236.', desc: 'Multicast (RFC 5771)' },
  { prefix: '237.', desc: 'Multicast (RFC 5771)' },
  { prefix: '238.', desc: 'Multicast (RFC 5771)' },
  { prefix: '239.', desc: 'Multicast (RFC 5771)' },
  { prefix: '240.', desc: 'Reserved for Future Use (RFC 1112)' },
  { prefix: '255.255.255.255', desc: 'Limited Broadcast (RFC 919)' }
];

/**
 * Check if an IPv4 address is a bogon
 */
function checkIPv4Bogon(ip: string): { isBogon: boolean; type?: string } {
  for (const range of IPV4_BOGON_RANGES) {
    if (ip.startsWith(range.prefix) || ip === range.prefix.slice(0, -1)) {
      return { isBogon: true, type: range.desc };
    }
  }
  return { isBogon: false };
}

/**
 * Normalize an IPv6 address to full form for comparison
 */
function normalizeIPv6(ip: string): string {
  const lower = ip.toLowerCase();

  // Handle mixed notation (::ffff:192.168.1.1)
  // Keep it as-is but lowercase for comparison
  if (lower.includes('.')) {
    // Still need to expand :: before the IPv4 part
    if (lower.startsWith('::ffff:')) {
      return '0000:0000:0000:0000:0000:ffff:' + lower.slice(7);
    }
    if (lower.startsWith('::')) {
      // ::x.x.x.x format (IPv4-compatible, deprecated)
      return '0000:0000:0000:0000:0000:0000:' + lower.slice(2);
    }
    return lower;
  }

  // Expand :: notation
  const parts = lower.split(':');
  const emptyIndex = parts.findIndex((p, i) => p === '' && parts[i + 1] === '');

  if (emptyIndex !== -1) {
    // Count non-empty parts
    const nonEmptyParts = parts.filter(p => p !== '');
    const missingParts = 8 - nonEmptyParts.length;
    const expansion = Array(missingParts).fill('0000');

    // Replace :: with expanded zeros
    const before = parts.slice(0, emptyIndex).filter(p => p !== '');
    const after = parts.slice(emptyIndex).filter(p => p !== '');
    const expanded = [...before, ...expansion, ...after];

    return expanded.map(p => p.padStart(4, '0')).join(':');
  }

  // Handle single : at start (like :1 which is invalid but handle gracefully)
  if (parts[0] === '') {
    // Leading ::
    const nonEmpty = parts.filter(p => p !== '');
    const padding = Array(8 - nonEmpty.length).fill('0000');
    return [...padding, ...nonEmpty].map(p => p.padStart(4, '0')).join(':');
  }

  // Already expanded, just normalize
  return parts.map(p => p.padStart(4, '0')).join(':');
}

/**
 * Check if an IPv6 address is a bogon
 */
function checkIPv6Bogon(ip: string): { isBogon: boolean; type?: string } {
  const normalized = normalizeIPv6(ip);

  // Unspecified address (::)
  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return { isBogon: true, type: 'Unspecified Address (RFC 4291)' };
  }

  // Loopback (::1)
  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return { isBogon: true, type: 'Loopback (RFC 4291)' };
  }

  // IPv4-compatible IPv6 (deprecated, ::x.x.x.x)
  if (normalized.startsWith('0000:0000:0000:0000:0000:0000:') && !normalized.endsWith(':0000') && !normalized.endsWith(':0001')) {
    return { isBogon: true, type: 'IPv4-Compatible IPv6 (deprecated)' };
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    return { isBogon: true, type: 'IPv4-Mapped IPv6 (RFC 4291)' };
  }

  // Link-local (fe80::/10)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return { isBogon: true, type: 'Link-Local Unicast (RFC 4291)' };
  }

  // Site-local (deprecated, fec0::/10)
  if (normalized.startsWith('fec') || normalized.startsWith('fed') ||
      normalized.startsWith('fee') || normalized.startsWith('fef')) {
    return { isBogon: true, type: 'Site-Local (deprecated, RFC 3879)' };
  }

  // Unique local (fc00::/7 = fc00::/8 + fd00::/8)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return { isBogon: true, type: 'Unique Local Address (RFC 4193)' };
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith('ff')) {
    return { isBogon: true, type: 'Multicast (RFC 4291)' };
  }

  // Documentation (2001:db8::/32)
  if (normalized.startsWith('2001:0db8:')) {
    return { isBogon: true, type: 'Documentation (RFC 3849)' };
  }

  // Benchmarking (2001:2::/48)
  if (normalized.startsWith('2001:0002:0000:')) {
    return { isBogon: true, type: 'Benchmarking (RFC 5180)' };
  }

  // ORCHID v2 (2001:20::/28)
  if (normalized.startsWith('2001:002')) {
    return { isBogon: true, type: 'ORCHID v2 (RFC 7343)' };
  }

  // 6to4 (2002::/16)
  if (normalized.startsWith('2002:')) {
    return { isBogon: true, type: '6to4 (RFC 3056)' };
  }

  // Teredo (2001::/32)
  if (normalized.startsWith('2001:0000:')) {
    return { isBogon: true, type: 'Teredo (RFC 4380)' };
  }

  // Discard-only (100::/64)
  if (normalized.startsWith('0100:0000:0000:0000:')) {
    return { isBogon: true, type: 'Discard-Only (RFC 6666)' };
  }

  return { isBogon: false };
}

/**
 * Detect if an IP address is IPv6
 */
export function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

/**
 * Check if an IP address is a bogon (private/reserved)
 */
export function isBogon(ip: string): { isBogon: boolean; type?: string } {
  if (isIPv6(ip)) {
    return checkIPv6Bogon(ip);
  }
  return checkIPv4Bogon(ip);
}

/**
 * IP Intelligence Service
 * Uses ipinfo.io (free tier, no token required for basic info)
 * or similar services.
 */
export async function getIpInfo(ip: string): Promise<IpInfo> {
  const ipv6 = isIPv6(ip);
  const bogonCheck = isBogon(ip);

  // Return early for bogon IPs
  if (bogonCheck.isBogon) {
    return {
      ip,
      bogon: true,
      bogonType: bogonCheck.type,
      isIPv6: ipv6,
      org: bogonCheck.type
    };
  }

  try {
    // Create a transient client with baseUrl
    const client = new Client({ baseUrl: 'https://ipinfo.io' });

    // Use ipinfo.io/json API (rate limited to 50k/month free, adequate for CLI)
    const data = await client.get(`/${ip}/json`).json<any>();

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
      anycast: data.anycast,
      isIPv6: ipv6
    };
  } catch (error) {
    throw new NetworkError(`Failed to fetch IP info: ${(error as Error).message}`, 'IP_LOOKUP_FAILED');
  }
}

/**
 * Validate IP address format
 */
export function isValidIP(ip: string): boolean {
  // IPv4 validation
  if (!ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
      const num = parseInt(p, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && p === num.toString();
    });
  }

  // IPv6 validation (simplified)
  const parts = ip.split(':');
  if (parts.length < 2 || parts.length > 8) return false;

  // Count empty parts (for ::)
  const emptyParts = parts.filter(p => p === '').length;
  if (emptyParts > 1 && !(emptyParts === 2 && parts[0] === '' && parts[1] === '')) return false;

  // Validate each part
  return parts.every(p => {
    if (p === '') return true;
    if (p.includes('.')) return isValidIP(p); // IPv4-mapped
    return /^[0-9a-fA-F]{1,4}$/.test(p);
  });
}
