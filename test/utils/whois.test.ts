import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock the net module
vi.mock('net', () => {
  return {
    createConnection: vi.fn()
  };
});

import { createConnection } from 'net';
import { whois, isDomainAvailable } from '../../src/utils/whois.js';
import { createClient } from '../../src/core/client.js';

const mockedCreateConnection = vi.mocked(createConnection);

// Helper to create a mock socket
function createMockSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  socket.write = vi.fn();
  socket.destroy = vi.fn();
  return socket;
}

describe('WHOIS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('whois function', () => {
    it('should perform WHOIS lookup for a .com domain', async () => {
      const mockSocket = createMockSocket();
      // Response without referral server - simple case
      const whoisResponse = `
Domain Name: GOOGLE.COM
Registry Domain ID: 2138514_DOMAIN_COM-VRSN
Updated Date: 2019-09-09T15:39:04Z
Creation Date: 1997-09-15T04:00:00Z
Registry Expiry Date: 2028-09-14T04:00:00Z
Registrar: MarkMonitor Inc.
Name Server: NS1.GOOGLE.COM
Name Server: NS2.GOOGLE.COM
`;

      mockedCreateConnection.mockImplementation((options, callback) => {
        // Simulate async connection
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(whoisResponse));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('google.com');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeDefined();
      expect(result.query).toBe('google.com');
      expect(result.server).toBe('whois.verisign-grs.com');
      expect(result.raw).toContain('GOOGLE.COM');
      expect(mockSocket.write).toHaveBeenCalledWith('google.com\r\n');
    });

    it('should use correct server for .org domain', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('Domain Name: TEST.ORG\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('test.org');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('whois.pir.org');
    });

    it('should use ARIN server for IP addresses', async () => {
      const mockSocket = createMockSocket();
      const ipWhoisResponse = `
NetRange:       8.0.0.0 - 8.255.255.255
CIDR:           8.0.0.0/8
NetName:        LVLT-ORG-8-8
NetHandle:      NET-8-0-0-0-1
OrgName:        Google LLC
`;

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(ipWhoisResponse));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('8.8.8.8');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.query).toBe('8.8.8.8');
      expect(result.server).toBe('whois.arin.net');
    });

    it('should use IANA for unknown TLDs', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('Domain: example.unknown\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('example.unknown');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('whois.iana.org');
    });

    it('should use custom server when provided', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        expect(options.host).toBe('custom.whois.server');
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('Custom response\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('google.com', { server: 'custom.whois.server' });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('custom.whois.server');
    });

    it('should use custom port when provided', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        expect(options.port).toBe(4343);
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('Response\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('google.com', { port: 4343 });
      await vi.runAllTimersAsync();
      await resultPromise;
    });

    it('should timeout after specified duration', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options, callback) => {
        // Don't emit any events - simulate slow server
        return mockSocket as any;
      });

      const resultPromise = whois('google.com', { timeout: 1000 });

      // Advance past timeout and immediately catch the rejection
      vi.advanceTimersByTime(1001);

      await expect(resultPromise).rejects.toThrow(/timed out/);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options, callback) => {
        // Use process.nextTick instead of setImmediate for better timing control
        process.nextTick(() => {
          mockSocket.emit('error', new Error('ECONNREFUSED'));
        });
        return mockSocket as any;
      });

      // Start the query and immediately await the rejection
      await expect(whois('google.com')).rejects.toThrow(/WHOIS query failed/);
    });

    it('should follow referrals when enabled', async () => {
      const mockSocket = createMockSocket();
      let callCount = 0;

      const initialResponse = `
Domain Name: GOOGLE.COM
Whois Server: whois.markmonitor.com
`;
      const referralResponse = `
Domain Name: google.com
Registrant Name: Google LLC
`;

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        callCount++;
        setImmediate(() => {
          callback?.();
          if (callCount === 1) {
            mockSocket.emit('data', Buffer.from(initialResponse));
          } else {
            mockSocket.emit('data', Buffer.from(referralResponse));
          }
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('google.com', { follow: true });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('whois.markmonitor.com');
      expect(callCount).toBe(2);
    });

    it('should not follow referrals when disabled', async () => {
      const mockSocket = createMockSocket();
      let callCount = 0;

      const response = `
Domain Name: GOOGLE.COM
Whois Server: whois.markmonitor.com
`;

      mockedCreateConnection.mockImplementation((options, callback) => {
        callCount++;
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('google.com', { follow: false });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(callCount).toBe(1);
    });

    it('should parse WHOIS data into key-value pairs', async () => {
      const mockSocket = createMockSocket();
      const response = `
Domain Name: EXAMPLE.COM
Registry Domain ID: 12345_DOMAIN
Registrar: Example Registrar
Name Server: ns1.example.com
Name Server: ns2.example.com
Creation Date: 2000-01-01
`;

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('example.com');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.data['domain name']).toBe('EXAMPLE.COM');
      expect(result.data['registry domain id']).toBe('12345_DOMAIN');
      expect(result.data['registrar']).toBe('Example Registrar');
      // Multiple name servers should be an array
      expect(result.data['name server']).toEqual(['ns1.example.com', 'ns2.example.com']);
      expect(result.data['creation date']).toBe('2000-01-01');
    });

    it('should skip comment lines and empty lines in parsing', async () => {
      const mockSocket = createMockSocket();
      const response = `
% This is a comment
# Another comment

Domain Name: EXAMPLE.COM

No-colon line
Key Without Value:
`;

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('example.com');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.data['domain name']).toBe('EXAMPLE.COM');
      expect(Object.keys(result.data)).toHaveLength(1);
    });

    it('should handle IPv6 addresses', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('IPv6 response\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('2001:4860:4860::8888');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('whois.arin.net');
    });

    it('should clean up query (trim and lowercase)', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from('Response\n'));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('  GOOGLE.COM  ');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.query).toBe('google.com');
      expect(mockSocket.write).toHaveBeenCalledWith('google.com\r\n');
    });
  });

  describe('isDomainAvailable function', () => {
    it('should return true for available domain (no match)', async () => {
      const mockSocket = createMockSocket();
      const response = 'No match for "availabledomain12345.com".\n';

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = isDomainAvailable('availabledomain12345.com');
      await vi.runAllTimersAsync();
      const available = await resultPromise;

      expect(available).toBe(true);
    });

    it('should return true for "not found" response', async () => {
      const mockSocket = createMockSocket();
      const response = 'Domain not found.\n';

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = isDomainAvailable('notfound.com');
      await vi.runAllTimersAsync();
      const available = await resultPromise;

      expect(available).toBe(true);
    });

    it('should return true for "status: available"', async () => {
      const mockSocket = createMockSocket();
      const response = 'Domain: example.com\nStatus: available\n';

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = isDomainAvailable('example.com');
      await vi.runAllTimersAsync();
      const available = await resultPromise;

      expect(available).toBe(true);
    });

    it('should return false for registered domain', async () => {
      const mockSocket = createMockSocket();
      const response = `
Domain Name: GOOGLE.COM
Registrar: MarkMonitor Inc.
Creation Date: 1997-09-15
`;

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          callback?.();
          mockSocket.emit('data', Buffer.from(response));
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = isDomainAvailable('google.com');
      await vi.runAllTimersAsync();
      const available = await resultPromise;

      expect(available).toBe(false);
    });

    it('should return false on error', async () => {
      const mockSocket = createMockSocket();

      mockedCreateConnection.mockImplementation((options, callback) => {
        setImmediate(() => {
          mockSocket.emit('error', new Error('Connection failed'));
        });
        return mockSocket as any;
      });

      const resultPromise = isDomainAvailable('google.com');
      await vi.runAllTimersAsync();
      const available = await resultPromise;

      expect(available).toBe(false);
    });
  });

  describe('TLD server mapping', () => {
    const tldTests = [
      { domain: 'test.net', server: 'whois.verisign-grs.com' },
      { domain: 'test.info', server: 'whois.afilias.net' },
      { domain: 'test.io', server: 'whois.nic.io' },
      { domain: 'test.co', server: 'whois.nic.co' },
      { domain: 'test.dev', server: 'whois.nic.google' },
      { domain: 'test.app', server: 'whois.nic.google' },
      { domain: 'test.ai', server: 'whois.nic.ai' },
      { domain: 'test.eu', server: 'whois.eu' },
      { domain: 'test.br', server: 'whois.registro.br' },
    ];

    for (const { domain, server } of tldTests) {
      it(`should use ${server} for .${domain.split('.')[1]} domains`, async () => {
        const mockSocket = createMockSocket();

        mockedCreateConnection.mockImplementation((options: any, callback) => {
          expect(options.host).toBe(server);
          setImmediate(() => {
            callback?.();
            mockSocket.emit('data', Buffer.from('Response\n'));
            mockSocket.emit('end');
          });
          return mockSocket as any;
        });

        const resultPromise = whois(domain);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.server).toBe(server);
      });
    }
  });

  describe('Referral URL extraction', () => {
    it('should extract referral from "Referral URL" format', async () => {
      const mockSocket = createMockSocket();
      let callCount = 0;

      const initialResponse = `
Domain Name: EXAMPLE.COM
Referral URL: http://whois.example-registrar.com
`;

      mockedCreateConnection.mockImplementation((options: any, callback) => {
        callCount++;
        setImmediate(() => {
          callback?.();
          if (callCount === 1) {
            mockSocket.emit('data', Buffer.from(initialResponse));
          } else {
            mockSocket.emit('data', Buffer.from('Final response\n'));
          }
          mockSocket.emit('end');
        });
        return mockSocket as any;
      });

      const resultPromise = whois('example.com');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.server).toBe('whois.example-registrar.com');
    });
  });

  // Integration tests (skipped by default - require actual network)
  describe('Integration tests (skipped)', () => {
    it.skip('should perform real WHOIS lookup for a domain', async () => {
      vi.useRealTimers();
      const result = await whois('google.com');

      expect(result).toBeDefined();
      expect(result.query).toBe('google.com');
      expect(result.server).toBeDefined();
      expect(result.raw).toBeDefined();
      expect(typeof result.raw).toBe('string');
      expect(result.raw.length).toBeGreaterThan(0);
    }, 15000);

    it.skip('should detect that google.com is not available', async () => {
      vi.useRealTimers();
      const available = await isDomainAvailable('google.com');
      expect(available).toBe(false);
    }, 15000);
  });
});
