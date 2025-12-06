import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:os networkInterfaces
vi.mock('node:os', () => ({
  networkInterfaces: vi.fn()
}));

import { networkInterfaces } from 'node:os';
import { interfaceRotatorPlugin } from '../../src/plugins/interface-rotator.js';

describe('Interface Rotator Plugin', () => {
  const mockedNetworkInterfaces = vi.mocked(networkInterfaces);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auto-discovery', () => {
    it('should discover IPv4 interfaces by default', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
          { address: '192.168.1.101', family: 'IPv4', internal: false },
        ],
        lo: [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
      } as any);

      const plugin = interfaceRotatorPlugin();
      expect(typeof plugin).toBe('function');
    });

    it('should exclude internal addresses by default', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
        ],
        lo: [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          // Call the hook immediately with a mock request
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin();
      plugin(mockClient);

      expect(requests.length).toBe(1);
      expect((requests[0] as any)._localAddress).toBe('192.168.1.100');
    });

    it('should include internal addresses when excludeInternal is false', () => {
      mockedNetworkInterfaces.mockReturnValue({
        lo: [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin({ excludeInternal: false });
      plugin(mockClient);

      expect(requests.length).toBe(1);
      expect((requests[0] as any)._localAddress).toBe('127.0.0.1');
    });

    it('should filter by interface name string', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
        ],
        eth1: [
          { address: '192.168.2.100', family: 'IPv4', internal: false },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin({ interface: 'eth0' });
      plugin(mockClient);

      expect((requests[0] as any)._localAddress).toBe('192.168.1.100');
    });

    it('should filter by interface name regex', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
        ],
        wlan0: [
          { address: '192.168.3.100', family: 'IPv4', internal: false },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin({ interface: /^eth/ });
      plugin(mockClient);

      expect((requests[0] as any)._localAddress).toBe('192.168.1.100');
    });

    it('should filter IPv6 addresses', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
          { address: 'fe80::1', family: 'IPv6', internal: false },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin({ family: 'IPv6' });
      plugin(mockClient);

      expect((requests[0] as any)._localAddress).toBe('fe80::1');
    });

    it('should include both IPv4 and IPv6 when family is both', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: [
          { address: '192.168.1.100', family: 'IPv4', internal: false },
          { address: 'fe80::1', family: 'IPv6', internal: false },
        ],
      } as any);

      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          for (let i = 0; i < 2; i++) {
            const mockReq = {};
            fn(mockReq);
            requests.push(mockReq);
          }
        }
      };

      const plugin = interfaceRotatorPlugin({ family: 'both' });
      plugin(mockClient);

      const addresses = requests.map((r: any) => r._localAddress);
      expect(addresses).toContain('192.168.1.100');
      expect(addresses).toContain('fe80::1');
    });

    it('should return no-op plugin when no interfaces found', () => {
      mockedNetworkInterfaces.mockReturnValue({});

      const plugin = interfaceRotatorPlugin();
      
      // no-op plugin should do nothing
      const mockClient = {
        beforeRequest: vi.fn()
      };
      plugin(mockClient);

      expect(mockClient.beforeRequest).not.toHaveBeenCalled();
    });

    it('should handle empty interface array', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: []
      } as any);

      const plugin = interfaceRotatorPlugin();
      
      const mockClient = {
        beforeRequest: vi.fn()
      };
      plugin(mockClient);

      expect(mockClient.beforeRequest).not.toHaveBeenCalled();
    });

    it('should handle undefined interface info', () => {
      mockedNetworkInterfaces.mockReturnValue({
        eth0: undefined
      } as any);

      const plugin = interfaceRotatorPlugin();
      
      const mockClient = {
        beforeRequest: vi.fn()
      };
      plugin(mockClient);

      expect(mockClient.beforeRequest).not.toHaveBeenCalled();
    });
  });

  describe('manual IPs', () => {
    it('should use manually provided IPs', () => {
      const requests: any[] = [];
      const mockClient = {
        beforeRequest: (fn: any) => {
          const mockReq = {};
          fn(mockReq);
          requests.push(mockReq);
        }
      };

      const plugin = interfaceRotatorPlugin({ ips: ['10.0.0.1'] });
      plugin(mockClient);

      expect((requests[0] as any)._localAddress).toBe('10.0.0.1');
    });

    it('should not call networkInterfaces when IPs are provided', () => {
      const mockClient = {
        beforeRequest: vi.fn()
      };

      const plugin = interfaceRotatorPlugin({ ips: ['10.0.0.1'] });
      plugin(mockClient);

      expect(mockedNetworkInterfaces).not.toHaveBeenCalled();
    });
  });

  describe('strategies', () => {
    it('should rotate round-robin by default', () => {
      const requests: any[] = [];
      let hookFn: any;
      const mockClient = {
        beforeRequest: (fn: any) => {
          hookFn = fn;
        }
      };

      const plugin = interfaceRotatorPlugin({ ips: ['10.0.0.1', '10.0.0.2', '10.0.0.3'] });
      plugin(mockClient);

      // Call hook multiple times
      for (let i = 0; i < 6; i++) {
        const mockReq = {};
        hookFn(mockReq);
        requests.push(mockReq);
      }

      const addresses = requests.map((r: any) => r._localAddress);
      expect(addresses).toEqual([
        '10.0.0.1', '10.0.0.2', '10.0.0.3',
        '10.0.0.1', '10.0.0.2', '10.0.0.3'
      ]);
    });

    it('should select random IP with random strategy', () => {
      const requests: any[] = [];
      let hookFn: any;
      const mockClient = {
        beforeRequest: (fn: any) => {
          hookFn = fn;
        }
      };

      const plugin = interfaceRotatorPlugin({ 
        ips: ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
        strategy: 'random'
      });
      plugin(mockClient);

      // Call hook multiple times
      for (let i = 0; i < 10; i++) {
        const mockReq = {};
        hookFn(mockReq);
        requests.push(mockReq);
      }

      // All addresses should be from the provided list
      const addresses = requests.map((r: any) => r._localAddress);
      addresses.forEach(addr => {
        expect(['10.0.0.1', '10.0.0.2', '10.0.0.3']).toContain(addr);
      });
    });
  });

  describe('request modification', () => {
    it('should set _dispatcher on request', () => {
      let hookFn: any;
      const mockClient = {
        beforeRequest: (fn: any) => {
          hookFn = fn;
        }
      };

      const plugin = interfaceRotatorPlugin({ ips: ['10.0.0.1'] });
      plugin(mockClient);

      const mockReq: any = {};
      hookFn(mockReq);

      expect(mockReq._dispatcher).toBeDefined();
      expect(mockReq._localAddress).toBe('10.0.0.1');
    });
  });
});
