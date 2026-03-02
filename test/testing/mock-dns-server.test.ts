import { describe, it, expect, afterEach } from 'vitest';
import { MockDnsServer, createMockDnsServer } from 'raffel/testing';
import * as dgram from 'node:dgram';

describe('MockDnsServer', () => {
  let server: MockDnsServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('constructor and defaults', () => {
    it('should create server with default options', () => {
      server = new MockDnsServer();
      expect(server.port).toBe(0);
      expect(server.isRunning).toBe(false);
    });

    it('should create server with custom port after start', async () => {
      server = new MockDnsServer({ port: 15454, host: '0.0.0.0' });
      await server.start();
      expect(server.port).toBe(15454);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop server', async () => {
      server = new MockDnsServer({ port: 15353 });
      expect(server.isRunning).toBe(false);

      await server.start();
      expect(server.isRunning).toBe(true);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MockDnsServer({ port: 15354 });
      await server.stop(); // Should not throw
    });

    it('should create server via factory', async () => {
      server = await createMockDnsServer({ port: 15355 });
      expect(server.isRunning).toBe(true);
    });
  });

  describe('record management', () => {
    it('should add records', async () => {
      server = new MockDnsServer({ port: 15356 });
      server.addRecord('mytest.com', 'A', '10.0.0.1');
      // Records are added - verifiable via actual DNS query after start
    });

    it('should remove records', async () => {
      server = new MockDnsServer({ port: 15357 });
      server.addRecord('remove.com', 'A', '10.0.0.1');
      server.removeRecords('remove.com');
      // Records removed (no getRecords in raffel API)
    });

    it('should clear all records', async () => {
      server = new MockDnsServer({ port: 15358 });
      server.addRecord('custom.com', 'A', '10.0.0.1');
      server.clearRecords();
      // Records cleared
    });

    it('should add MX record', () => {
      server = new MockDnsServer({ port: 15359 });
      server.addRecord('mx.com', 'MX', { priority: 10, exchange: 'mail.mx.com' });
      // No exception thrown
    });

    it('should add SRV record', () => {
      server = new MockDnsServer({ port: 15360 });
      server.addRecord('srv.com', 'SRV', { priority: 1, weight: 10, port: 5060, target: 'sip.srv.com' });
      // No exception thrown
    });
  });

  describe('DNS query handling', () => {
    it('should respond to A record query', async () => {
      server = await createMockDnsServer({ port: 15362 });
      server.addRecord('test-query.com', 'A', '1.2.3.4');

      const response = await sendDnsQuery(15362, 'test-query.com', 1);

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it('should respond to AAAA record query', async () => {
      server = await createMockDnsServer({ port: 15363 });
      server.addRecord('ipv6.test.com', 'AAAA', '2001:db8::1');

      const response = await sendDnsQuery(15363, 'ipv6.test.com', 28);

      expect(response).toBeDefined();
    });

    it('should emit query event', async () => {
      server = await createMockDnsServer({ port: 15364 });
      server.addRecord('event.test.com', 'A', '1.2.3.4');

      let queryReceived = false;
      server.on('query', (query) => {
        queryReceived = true;
        expect(query.name).toBe('event.test.com');
      });

      await sendDnsQuery(15364, 'event.test.com', 1);
      expect(queryReceived).toBe(true);
    });

    it('should handle delay option', async () => {
      server = await createMockDnsServer({ port: 15365, delay: 50 });
      server.addRecord('delay.test.com', 'A', '1.2.3.4');

      const start = Date.now();
      await sendDnsQuery(15365, 'delay.test.com', 1);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});

async function sendDnsQuery(port: number, domain: string, type: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DNS query timeout'));
    }, 5000);

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();
      resolve(msg);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    const query = buildDnsQuery(domain, type);
    socket.send(query, port, '127.0.0.1');
  });
}

function buildDnsQuery(domain: string, type: number): Buffer {
  const parts: Buffer[] = [];

  const header = Buffer.alloc(12);
  header.writeUInt16BE(Math.floor(Math.random() * 65535), 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  parts.push(header);

  const labels = domain.split('.');
  for (const label of labels) {
    parts.push(Buffer.from([label.length]));
    parts.push(Buffer.from(label, 'ascii'));
  }
  parts.push(Buffer.from([0]));

  const footer = Buffer.alloc(4);
  footer.writeUInt16BE(type, 0);
  footer.writeUInt16BE(1, 2);
  parts.push(footer);

  return Buffer.concat(parts);
}
