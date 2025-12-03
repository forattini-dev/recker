import { describe, it, expect } from 'vitest';
import { isBogon, isIPv6, isValidIP } from '../../src/mcp/ip-intel.js';

describe('IP Intelligence', () => {
  describe('isIPv6', () => {
    it('should detect IPv6 addresses', () => {
      expect(isIPv6('::1')).toBe(true);
      expect(isIPv6('2001:db8::1')).toBe(true);
      expect(isIPv6('fe80::1')).toBe(true);
      expect(isIPv6('::ffff:192.168.1.1')).toBe(true);
    });

    it('should detect IPv4 addresses', () => {
      expect(isIPv6('192.168.1.1')).toBe(false);
      expect(isIPv6('10.0.0.1')).toBe(false);
      expect(isIPv6('8.8.8.8')).toBe(false);
    });
  });

  describe('isValidIP', () => {
    it('should validate IPv4 addresses', () => {
      expect(isValidIP('192.168.1.1')).toBe(true);
      expect(isValidIP('10.0.0.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
      expect(isValidIP('0.0.0.0')).toBe(true);
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(isValidIP('256.0.0.1')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
      expect(isValidIP('192.168.1.1.1')).toBe(false);
      expect(isValidIP('192.168.01.1')).toBe(false); // Leading zero
      expect(isValidIP('abc.def.ghi.jkl')).toBe(false);
    });

    it('should validate IPv6 addresses', () => {
      expect(isValidIP('::1')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
      expect(isValidIP('fe80::1')).toBe(true);
      expect(isValidIP('::ffff:192.168.1.1')).toBe(true);
    });

    it('should reject invalid IPv6 addresses', () => {
      expect(isValidIP('2001:db8::1::2')).toBe(false); // Multiple ::
      expect(isValidIP('2001:db8:gggg::1')).toBe(false); // Invalid hex
    });
  });

  describe('isBogon - IPv4', () => {
    it('should detect loopback addresses', () => {
      expect(isBogon('127.0.0.1').isBogon).toBe(true);
      expect(isBogon('127.255.255.255').isBogon).toBe(true);
      expect(isBogon('127.0.0.1').type).toContain('Loopback');
    });

    it('should detect private RFC 1918 addresses', () => {
      // 10.0.0.0/8
      expect(isBogon('10.0.0.1').isBogon).toBe(true);
      expect(isBogon('10.255.255.255').isBogon).toBe(true);
      expect(isBogon('10.0.0.1').type).toContain('Private');

      // 172.16.0.0/12
      expect(isBogon('172.16.0.1').isBogon).toBe(true);
      expect(isBogon('172.31.255.255').isBogon).toBe(true);
      expect(isBogon('172.16.0.1').type).toContain('Private');

      // 192.168.0.0/16
      expect(isBogon('192.168.0.1').isBogon).toBe(true);
      expect(isBogon('192.168.255.255').isBogon).toBe(true);
      expect(isBogon('192.168.0.1').type).toContain('Private');
    });

    it('should detect link-local addresses', () => {
      expect(isBogon('169.254.0.1').isBogon).toBe(true);
      expect(isBogon('169.254.255.255').isBogon).toBe(true);
      expect(isBogon('169.254.0.1').type).toContain('Link-Local');
    });

    it('should detect carrier-grade NAT addresses', () => {
      expect(isBogon('100.64.0.1').isBogon).toBe(true);
      expect(isBogon('100.127.255.255').isBogon).toBe(true);
      expect(isBogon('100.64.0.1').type).toContain('Carrier-Grade NAT');
    });

    it('should detect documentation addresses', () => {
      expect(isBogon('192.0.2.1').isBogon).toBe(true);
      expect(isBogon('198.51.100.1').isBogon).toBe(true);
      expect(isBogon('203.0.113.1').isBogon).toBe(true);
      expect(isBogon('192.0.2.1').type).toContain('Documentation');
    });

    it('should detect multicast addresses', () => {
      expect(isBogon('224.0.0.1').isBogon).toBe(true);
      expect(isBogon('239.255.255.255').isBogon).toBe(true);
      expect(isBogon('224.0.0.1').type).toContain('Multicast');
    });

    it('should not flag public addresses', () => {
      expect(isBogon('8.8.8.8').isBogon).toBe(false);
      expect(isBogon('1.1.1.1').isBogon).toBe(false);
      expect(isBogon('142.250.190.46').isBogon).toBe(false); // Google
    });
  });

  describe('isBogon - IPv6', () => {
    it('should detect loopback address (::1)', () => {
      expect(isBogon('::1').isBogon).toBe(true);
      expect(isBogon('::1').type).toContain('Loopback');
    });

    it('should detect unspecified address (::)', () => {
      expect(isBogon('::').isBogon).toBe(true);
      expect(isBogon('::').type).toContain('Unspecified');
    });

    it('should detect link-local addresses (fe80::/10)', () => {
      expect(isBogon('fe80::1').isBogon).toBe(true);
      expect(isBogon('fe80::abcd:1234:5678:9abc').isBogon).toBe(true);
      expect(isBogon('fe80::1').type).toContain('Link-Local');
    });

    it('should detect unique local addresses (fc00::/7)', () => {
      expect(isBogon('fc00::1').isBogon).toBe(true);
      expect(isBogon('fd00::1').isBogon).toBe(true);
      expect(isBogon('fd12:3456:789a::1').isBogon).toBe(true);
      expect(isBogon('fc00::1').type).toContain('Unique Local');
    });

    it('should detect multicast addresses (ff00::/8)', () => {
      expect(isBogon('ff02::1').isBogon).toBe(true);
      expect(isBogon('ff05::1').isBogon).toBe(true);
      expect(isBogon('ff02::1').type).toContain('Multicast');
    });

    it('should detect documentation addresses (2001:db8::/32)', () => {
      expect(isBogon('2001:db8::1').isBogon).toBe(true);
      expect(isBogon('2001:db8:1234:5678::1').isBogon).toBe(true);
      expect(isBogon('2001:db8::1').type).toContain('Documentation');
    });

    it('should detect IPv4-mapped IPv6 (::ffff:x.x.x.x)', () => {
      expect(isBogon('::ffff:192.168.1.1').isBogon).toBe(true);
      expect(isBogon('::ffff:192.168.1.1').type).toContain('IPv4-Mapped');
    });

    it('should not flag global unicast addresses', () => {
      expect(isBogon('2607:f8b0:4004:800::200e').isBogon).toBe(false); // Google
      expect(isBogon('2606:4700:4700::1111').isBogon).toBe(false); // Cloudflare
      expect(isBogon('2001:4860:4860::8888').isBogon).toBe(false); // Google DNS
    });
  });
});
