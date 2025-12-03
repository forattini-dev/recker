/**
 * IP Intelligence using MaxMind GeoLite2 database.
 *
 * This module provides GeoIP lookup functionality for CLI and MCP,
 * using the locally cached MaxMind database.
 *
 * For library users, use the @maxmind/geoip2-node package directly
 * or integrate with your preferred GeoIP provider.
 */

import { Reader, ReaderModel } from '@maxmind/geoip2-node';
import { ensureGeoIPDatabase, hasLocalGeoIPDatabase, getGeoIPDatabasePath } from './geoip-loader.js';

export interface IpInfo {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  continent?: string;
  loc?: string; // Lat,Long
  org?: string; // ASN + Org Name
  asn?: number;
  timezone?: string;
  postal?: string;
  accuracy?: number; // Accuracy radius in km
  bogon?: boolean; // Private/Reserved IP
  bogonType?: string; // Type of bogon (loopback, private, link-local, etc.)
  isIPv6?: boolean;
}

// IPv4 Bogon Ranges (IANA reserved, RFC 5735, etc.)
const IPV4_BOGON_RANGES = [
  { prefix: '0.', desc: 'This Network (RFC 1122)' },
  { prefix: '10.', desc: 'Private-Use (RFC 1918)' },
  { prefix: '100.64.', desc: 'Carrier-Grade NAT (RFC 6598)' },
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
  { prefix: '240.', desc: 'Reserved for Future Use (RFC 1112)' },
  { prefix: '255.255.255.255', desc: 'Limited Broadcast (RFC 919)' }
];

/**
 * Check if an IPv4 address is a bogon
 */
function checkIPv4Bogon(ip: string): { isBogon: boolean; type?: string } {
  // Handle 100.64.0.0/10 range (Carrier-Grade NAT)
  if (ip.startsWith('100.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 64 && secondOctet <= 127) {
      return { isBogon: true, type: 'Carrier-Grade NAT (RFC 6598)' };
    }
  }

  // Handle multicast range 224-239
  const firstOctet = parseInt(ip.split('.')[0], 10);
  if (firstOctet >= 224 && firstOctet <= 239) {
    return { isBogon: true, type: 'Multicast (RFC 5771)' };
  }

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

  if (lower.includes('.')) {
    if (lower.startsWith('::ffff:')) {
      return '0000:0000:0000:0000:0000:ffff:' + lower.slice(7);
    }
    if (lower.startsWith('::')) {
      return '0000:0000:0000:0000:0000:0000:' + lower.slice(2);
    }
    return lower;
  }

  const parts = lower.split(':');
  const emptyIndex = parts.findIndex((p, i) => p === '' && parts[i + 1] === '');

  if (emptyIndex !== -1) {
    const nonEmptyParts = parts.filter(p => p !== '');
    const missingParts = 8 - nonEmptyParts.length;
    const expansion = Array(missingParts).fill('0000');
    const before = parts.slice(0, emptyIndex).filter(p => p !== '');
    const after = parts.slice(emptyIndex).filter(p => p !== '');
    const expanded = [...before, ...expansion, ...after];
    return expanded.map(p => p.padStart(4, '0')).join(':');
  }

  if (parts[0] === '') {
    const nonEmpty = parts.filter(p => p !== '');
    const padding = Array(8 - nonEmpty.length).fill('0000');
    return [...padding, ...nonEmpty].map(p => p.padStart(4, '0')).join(':');
  }

  return parts.map(p => p.padStart(4, '0')).join(':');
}

/**
 * Check if an IPv6 address is a bogon
 */
function checkIPv6Bogon(ip: string): { isBogon: boolean; type?: string } {
  const normalized = normalizeIPv6(ip);

  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return { isBogon: true, type: 'Unspecified Address (RFC 4291)' };
  }
  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return { isBogon: true, type: 'Loopback (RFC 4291)' };
  }
  if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    return { isBogon: true, type: 'IPv4-Mapped IPv6 (RFC 4291)' };
  }
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return { isBogon: true, type: 'Link-Local Unicast (RFC 4291)' };
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return { isBogon: true, type: 'Unique Local Address (RFC 4193)' };
  }
  if (normalized.startsWith('ff')) {
    return { isBogon: true, type: 'Multicast (RFC 4291)' };
  }
  if (normalized.startsWith('2001:0db8:')) {
    return { isBogon: true, type: 'Documentation (RFC 3849)' };
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
 * Validate IP address format
 */
export function isValidIP(ip: string): boolean {
  if (!ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(p => {
      const num = parseInt(p, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && p === num.toString();
    });
  }

  const parts = ip.split(':');
  if (parts.length < 2 || parts.length > 8) return false;
  const emptyParts = parts.filter(p => p === '').length;
  if (emptyParts > 1 && !(emptyParts === 2 && parts[0] === '' && parts[1] === '')) return false;

  return parts.every(p => {
    if (p === '') return true;
    if (p.includes('.')) return isValidIP(p);
    return /^[0-9a-fA-F]{1,4}$/.test(p);
  });
}

// Cached reader instance
let _reader: ReaderModel | null = null;

/**
 * Get or create the MaxMind reader instance
 */
async function getReader(): Promise<ReaderModel | null> {
  if (_reader) {
    return _reader;
  }

  const dbPath = await ensureGeoIPDatabase();
  if (!dbPath) {
    return null;
  }

  try {
    _reader = await Reader.open(dbPath);
    return _reader;
  } catch {
    return null;
  }
}

/**
 * IP Intelligence Service using MaxMind GeoLite2 database.
 *
 * @param ip - The IP address to look up
 * @returns IP information including location, ASN, and timezone
 *
 * @example
 * ```ts
 * const info = await getIpInfo('8.8.8.8');
 * console.log(info.city, info.country); // Mountain View, US
 * ```
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

  const reader = await getReader();

  if (!reader) {
    return {
      ip,
      isIPv6: ipv6,
      org: 'GeoIP database not available'
    };
  }

  try {
    const result = reader.city(ip);

    return {
      ip,
      city: result.city?.names?.en,
      region: result.subdivisions?.[0]?.names?.en,
      country: result.country?.names?.en,
      countryCode: result.country?.isoCode,
      continent: result.continent?.names?.en,
      loc: result.location?.latitude && result.location?.longitude
        ? `${result.location.latitude},${result.location.longitude}`
        : undefined,
      timezone: result.location?.timeZone,
      postal: result.postal?.code,
      accuracy: result.location?.accuracyRadius,
      isIPv6: ipv6,
      // Note: ASN info requires separate GeoLite2-ASN database
      // For now, we only include city info
    };
  } catch (error) {
    // IP not found in database (common for some ranges)
    return {
      ip,
      isIPv6: ipv6,
      org: 'IP not found in GeoIP database'
    };
  }
}

/**
 * Check if GeoIP database is available
 */
export function isGeoIPAvailable(): boolean {
  return hasLocalGeoIPDatabase();
}

/**
 * Get path to GeoIP database
 */
export { getGeoIPDatabasePath } from './geoip-loader.js';
