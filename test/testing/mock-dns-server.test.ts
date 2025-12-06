import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockDnsServer } from '../../src/testing/mock-dns-server.js';
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
      expect(server.port).toBe(5353);
      expect(server.host).toBe('127.0.0.1');
      expect(server.isRunning).toBe(false);
    });

    it('should create server with custom options', () => {
      server = new MockDnsServer({ port: 5454, host: '0.0.0.0', ttl: 600, delay: 100 });
      expect(server.port).toBe(5454);
      expect(server.host).toBe('0.0.0.0');
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

    it('should throw if starting already started server', async () => {
      server = new MockDnsServer({ port: 15354 });
      await server.start();

      await expect(server.start()).rejects.toThrow('Server already started');
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MockDnsServer({ port: 15355 });
      await server.stop(); // Should not throw
    });

    it('should create server via static factory', async () => {
      server = await MockDnsServer.create({ port: 15356 });
      expect(server.isRunning).toBe(true);
    });
  });

  describe('record management', () => {
    beforeEach(() => {
      server = new MockDnsServer({ port: 15357 });
    });

    it('should add and get records', () => {
      server.addRecord('mytest.com', 'A', '10.0.0.1');
      const records = server.getRecords('mytest.com');

      expect(records.length).toBe(1);
      expect(records[0].type).toBe('A');
      expect(records[0].value).toBe('10.0.0.1');
    });

    it('should get records case-insensitively', () => {
      server.addRecord('MyTest.Com', 'A', '10.0.0.1');
      const records = server.getRecords('mytest.com');
      expect(records.length).toBe(1);
    });

    it('should add multiple records for same domain', () => {
      server.addRecord('multi.com', 'A', '10.0.0.1');
      server.addRecord('multi.com', 'AAAA', '::1');
      server.addRecord('multi.com', 'TXT', 'test record');

      const records = server.getRecords('multi.com');
      expect(records.length).toBe(3);
    });

    it('should remove records for a domain', () => {
      server.addRecord('remove.com', 'A', '10.0.0.1');
      expect(server.getRecords('remove.com').length).toBe(1);

      server.removeRecords('remove.com');
      expect(server.getRecords('remove.com').length).toBe(0);
    });

    it('should clear all records and restore defaults', () => {
      server.addRecord('custom.com', 'A', '10.0.0.1');
      server.clearRecords();

      // Custom record should be gone
      expect(server.getRecords('custom.com').length).toBe(0);

      // Default records should be restored
      expect(server.getRecords('localhost').length).toBe(2); // A and AAAA
      expect(server.getRecords('example.com').length).toBeGreaterThan(0);
    });

    it('should add record with custom TTL', () => {
      server.addRecord('ttl.com', 'A', '10.0.0.1', 600);
      const records = server.getRecords('ttl.com');
      expect(records[0].ttl).toBe(600);
    });

    it('should add MX record', () => {
      server.addRecord('mx.com', 'MX', { priority: 10, exchange: 'mail.mx.com' });
      const records = server.getRecords('mx.com');
      expect(records[0].type).toBe('MX');
      expect(records[0].value).toEqual({ priority: 10, exchange: 'mail.mx.com' });
    });

    it('should add SRV record', () => {
      server.addRecord('srv.com', 'SRV', { priority: 1, weight: 10, port: 5060, target: 'sip.srv.com' });
      const records = server.getRecords('srv.com');
      expect(records[0].type).toBe('SRV');
    });

    it('should return empty array for non-existent domain', () => {
      expect(server.getRecords('nonexistent.com')).toEqual([]);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      server = new MockDnsServer({ port: 15358 });
    });

    it('should return statistics copy', () => {
      const stats = server.statistics;
      expect(stats.queriesReceived).toBe(0);
      expect(stats.responseSent).toBe(0);
      expect(stats.queryLog).toEqual([]);
    });

    it('should reset statistics', async () => {
      await server.start();
      server.reset();
      expect(server.statistics.queriesReceived).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit start event', async () => {
      server = new MockDnsServer({ port: 15359 });
      let started = false;
      server.on('start', () => { started = true; });

      await server.start();
      expect(started).toBe(true);
    });

    it('should emit stop event', async () => {
      server = new MockDnsServer({ port: 15360 });
      await server.start();

      let stopped = false;
      server.on('stop', () => { stopped = true; });

      await server.stop();
      expect(stopped).toBe(true);
    });

    it('should emit reset event', async () => {
      server = new MockDnsServer({ port: 15361 });
      await server.start();

      let resetTriggered = false;
      server.on('reset', () => { resetTriggered = true; });

      server.reset();
      expect(resetTriggered).toBe(true);
    });
  });

  describe('DNS query handling', () => {
    it('should respond to A record query', async () => {
      server = await MockDnsServer.create({ port: 15362 });
      server.addRecord('test-query.com', 'A', '1.2.3.4');

      const response = await sendDnsQuery(15362, 'test-query.com', 1); // Type 1 = A

      expect(response).toBeDefined();
      expect(server.statistics.queriesReceived).toBe(1);
    });

    it('should respond to AAAA record query', async () => {
      server = await MockDnsServer.create({ port: 15363 });
      server.addRecord('ipv6.test.com', 'AAAA', '2001:db8::1');

      const response = await sendDnsQuery(15363, 'ipv6.test.com', 28); // Type 28 = AAAA

      expect(response).toBeDefined();
    });

    it('should log queries', async () => {
      server = await MockDnsServer.create({ port: 15364 });

      await sendDnsQuery(15364, 'log.test.com', 1);

      const stats = server.statistics;
      expect(stats.queryLog.length).toBe(1);
      expect(stats.queryLog[0].domain).toBe('log.test.com');
    });

    it('should handle delay option', async () => {
      server = await MockDnsServer.create({ port: 15365, delay: 50 });

      const start = Date.now();
      await sendDnsQuery(15365, 'delay.test.com', 1);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });

    it('should emit query event', async () => {
      server = await MockDnsServer.create({ port: 15366 });

      let queryReceived = false;
      server.on('query', (query) => {
        queryReceived = true;
        expect(query.domain).toBe('event.test.com');
      });

      await sendDnsQuery(15366, 'event.test.com', 1);
      expect(queryReceived).toBe(true);
    });
  });

  describe('default records', () => {
    beforeEach(() => {
      server = new MockDnsServer({ port: 15367 });
    });

    it('should have localhost A record', () => {
      const records = server.getRecords('localhost');
      expect(records.some(r => r.type === 'A' && r.value === '127.0.0.1')).toBe(true);
    });

    it('should have localhost AAAA record', () => {
      const records = server.getRecords('localhost');
      expect(records.some(r => r.type === 'AAAA' && r.value === '::1')).toBe(true);
    });

    it('should have example.com records', () => {
      const records = server.getRecords('example.com');
      expect(records.length).toBeGreaterThan(0);
      expect(records.some(r => r.type === 'A')).toBe(true);
      expect(records.some(r => r.type === 'NS')).toBe(true);
    });

    it('should have test.local A record', () => {
      const records = server.getRecords('test.local');
      expect(records.some(r => r.type === 'A')).toBe(true);
    });
  });
});

// Helper function to send a DNS query
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

    // Build simple DNS query
    const query = buildDnsQuery(domain, type);
    socket.send(query, port, '127.0.0.1');
  });
}

function buildDnsQuery(domain: string, type: number): Buffer {
  const parts: Buffer[] = [];

  // Header (12 bytes)
  const header = Buffer.alloc(12);
  header.writeUInt16BE(Math.floor(Math.random() * 65535), 0); // Transaction ID
  header.writeUInt16BE(0x0100, 2); // Flags: standard query
  header.writeUInt16BE(1, 4); // Questions: 1
  header.writeUInt16BE(0, 6); // Answers
  header.writeUInt16BE(0, 8); // Authority
  header.writeUInt16BE(0, 10); // Additional
  parts.push(header);

  // Domain name
  const labels = domain.split('.');
  for (const label of labels) {
    parts.push(Buffer.from([label.length]));
    parts.push(Buffer.from(label, 'ascii'));
  }
  parts.push(Buffer.from([0])); // Null terminator

  // Type and Class
  const footer = Buffer.alloc(4);
  footer.writeUInt16BE(type, 0); // Type
  footer.writeUInt16BE(1, 2); // Class IN
  parts.push(footer);

  return Buffer.concat(parts);
}
