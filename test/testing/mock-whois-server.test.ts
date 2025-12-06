import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockWhoisServer } from '../../src/testing/mock-whois-server.js';
import * as net from 'node:net';

describe('MockWhoisServer', () => {
  let server: MockWhoisServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('constructor and defaults', () => {
    it('should create server with default options', () => {
      server = new MockWhoisServer();
      expect(server.port).toBe(4343);
      expect(server.host).toBe('127.0.0.1');
      expect(server.isRunning).toBe(false);
    });

    it('should create server with custom options', () => {
      server = new MockWhoisServer({ port: 4444, host: '0.0.0.0', delay: 100 });
      expect(server.port).toBe(4444);
      expect(server.host).toBe('0.0.0.0');
    });

    it('should return url property', () => {
      server = new MockWhoisServer({ port: 4445, host: '127.0.0.1' });
      expect(server.url).toBe('127.0.0.1:4445');
    });
  });

  describe('lifecycle', () => {
    it('should start and stop server', async () => {
      server = new MockWhoisServer({ port: 14343 });
      expect(server.isRunning).toBe(false);

      await server.start();
      expect(server.isRunning).toBe(true);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should throw if starting already started server', async () => {
      server = new MockWhoisServer({ port: 14344 });
      await server.start();

      await expect(server.start()).rejects.toThrow('Server already started');
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MockWhoisServer({ port: 14345 });
      await server.stop(); // Should not throw
    });

    it('should create server via static factory', async () => {
      server = await MockWhoisServer.create({ port: 14346 });
      expect(server.isRunning).toBe(true);
    });
  });

  describe('domain management', () => {
    beforeEach(() => {
      server = new MockWhoisServer({ port: 14347 });
    });

    it('should add and get domain data', () => {
      server.addDomain('custom.com', {
        registrar: 'Custom Registrar',
        createdDate: '2020-01-01',
      });

      const data = server.getDomain('custom.com');
      expect(data?.registrar).toBe('Custom Registrar');
      expect(data?.createdDate).toBe('2020-01-01');
    });

    it('should get domain case-insensitively', () => {
      server.addDomain('UPPER.COM', { registrar: 'Test' });
      const data = server.getDomain('upper.com');
      expect(data?.registrar).toBe('Test');
    });

    it('should remove domain', () => {
      server.addDomain('remove.com', { registrar: 'Test' });
      expect(server.getDomain('remove.com')).toBeDefined();

      server.removeDomain('remove.com');
      expect(server.getDomain('remove.com')).toBeUndefined();
    });

    it('should clear all domains and restore defaults', () => {
      server.addDomain('custom.com', { registrar: 'Test' });
      server.clearDomains();

      // Custom domain should be gone
      expect(server.getDomain('custom.com')).toBeUndefined();

      // Default domains should be restored
      expect(server.getDomain('example.com')).toBeDefined();
      expect(server.getDomain('google.com')).toBeDefined();
    });

    it('should return undefined for non-existent domain', () => {
      expect(server.getDomain('nonexistent.com')).toBeUndefined();
    });
  });

  describe('statistics', () => {
    it('should return statistics copy', () => {
      server = new MockWhoisServer({ port: 14348 });
      const stats = server.statistics;
      expect(stats.queriesReceived).toBe(0);
      expect(stats.responseSent).toBe(0);
      expect(stats.queryLog).toEqual([]);
    });

    it('should reset statistics', async () => {
      server = new MockWhoisServer({ port: 14349 });
      await server.start();
      server.reset();
      expect(server.statistics.queriesReceived).toBe(0);
    });
  });

  describe('events', () => {
    it('should emit start event', async () => {
      server = new MockWhoisServer({ port: 14350 });
      let started = false;
      server.on('start', () => { started = true; });

      await server.start();
      expect(started).toBe(true);
    });

    it('should emit stop event', async () => {
      server = new MockWhoisServer({ port: 14351 });
      await server.start();

      let stopped = false;
      server.on('stop', () => { stopped = true; });

      await server.stop();
      expect(stopped).toBe(true);
    });

    it('should emit reset event', async () => {
      server = new MockWhoisServer({ port: 14352 });
      await server.start();

      let resetTriggered = false;
      server.on('reset', () => { resetTriggered = true; });

      server.reset();
      expect(resetTriggered).toBe(true);
    });
  });

  describe('WHOIS query handling', () => {
    it('should respond to domain query', async () => {
      server = await MockWhoisServer.create({ port: 14353 });

      const response = await sendWhoisQuery(14353, 'example.com');

      expect(response).toContain('Domain Name: EXAMPLE.COM');
      expect(response).toContain('Registrar:');
      expect(server.statistics.queriesReceived).toBe(1);
    });

    it('should respond with not found for unknown domain', async () => {
      server = await MockWhoisServer.create({ port: 14354 });

      const response = await sendWhoisQuery(14354, 'unknown-domain.xyz');

      expect(response).toContain('No match for domain');
    });

    it('should log queries', async () => {
      server = await MockWhoisServer.create({ port: 14355 });

      await sendWhoisQuery(14355, 'test.local');

      const stats = server.statistics;
      expect(stats.queryLog.length).toBe(1);
      expect(stats.queryLog[0].query).toBe('test.local');
    });

    it('should emit query event', async () => {
      server = await MockWhoisServer.create({ port: 14356 });

      let queryReceived = '';
      server.on('query', (query) => {
        queryReceived = query;
      });

      await sendWhoisQuery(14356, 'google.com');
      expect(queryReceived).toBe('google.com');
    });

    it('should include all domain fields in response', async () => {
      server = await MockWhoisServer.create({ port: 14357 });
      server.addDomain('full.com', {
        registrar: 'Test Registrar',
        registrarUrl: 'http://test.com',
        createdDate: '2020-01-01',
        updatedDate: '2023-01-01',
        expiryDate: '2025-01-01',
        status: ['active', 'ok'],
        nameservers: ['ns1.test.com', 'ns2.test.com'],
        registrantName: 'John Doe',
        registrantOrg: 'Test Corp',
        registrantEmail: 'admin@test.com',
        adminEmail: 'admin@test.com',
        techEmail: 'tech@test.com',
        dnssec: 'unsigned',
      });

      const response = await sendWhoisQuery(14357, 'full.com');

      expect(response).toContain('Test Registrar');
      expect(response).toContain('http://test.com');
      expect(response).toContain('Creation Date:');
      expect(response).toContain('Updated Date:');
      expect(response).toContain('Registry Expiry Date:');
      expect(response).toContain('Domain Status:');
      expect(response).toContain('Name Server:');
      expect(response).toContain('Registrant Name:');
      expect(response).toContain('Registrant Organization:');
      expect(response).toContain('Registrant Email:');
      expect(response).toContain('Admin Email:');
      expect(response).toContain('Tech Email:');
      expect(response).toContain('DNSSEC:');
    });
  });

  describe('default domains', () => {
    beforeEach(() => {
      server = new MockWhoisServer({ port: 14358 });
    });

    it('should have example.com', () => {
      const data = server.getDomain('example.com');
      expect(data).toBeDefined();
      expect(data?.registrar).toContain('Internet Assigned Numbers Authority');
    });

    it('should have google.com', () => {
      const data = server.getDomain('google.com');
      expect(data).toBeDefined();
      expect(data?.registrar).toContain('MarkMonitor');
    });

    it('should have test.local', () => {
      const data = server.getDomain('test.local');
      expect(data).toBeDefined();
      expect(data?.registrar).toBe('Mock Registrar');
    });
  });
});

// Helper function to send a WHOIS query
async function sendWhoisQuery(port: number, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('WHOIS query timeout'));
    }, 5000);

    socket.on('connect', () => {
      socket.write(domain + '\r\n');
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(response);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
