import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer } from '../../src/mcp/server.js';
import { join } from 'path';

describe('MCP Network Tools', () => {
  let server: MCPServer;
  const testPort = 3205;
  const docsPath = join(process.cwd(), 'docs');

  beforeAll(async () => {
    server = new MCPServer({
      transport: 'http',
      port: testPort,
      docsPath,
      debug: false,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const response = await fetch(`http://localhost:${testPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    return response.json();
  };

  describe('rek_http_request', () => {
    it('should make a simple GET request', async () => {
      // Using a reliable public API or a mock would be better, 
      // but for now let's query the server itself (health endpoint)
      const result = await callTool('rek_http_request', {
        url: `http://localhost:${testPort}/health`,
        method: 'GET',
      });

      if (result.result.isError) {
        console.error('HTTP Request Tool Failed:', result.result.content[0].text);
      }
      expect(result.result.isError).toBeUndefined();
      
      const content = JSON.parse(result.result.content[0].text);
      expect(content.status).toBe(200);
      expect(content.data).toBeDefined();
      expect(content.data.status).toBe('ok');
    });

    it('should handle errors gracefully', async () => {
      const result = await callTool('rek_http_request', {
        url: 'http://localhost:9999/non-existent', // Likely unreachable
      });

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('Request failed');
    });
  });

  describe('rek_dns_lookup', () => {
    it('should resolve A records', async () => {
      const result = await callTool('rek_dns_lookup', {
        domain: 'localhost',
        type: 'A',
      });

      expect(result.result.isError).toBeUndefined();
      const content = JSON.parse(result.result.content[0].text);
      expect(content.domain).toBe('localhost');
      expect(content.result).toBeDefined();
      // Localhost might resolve to 127.0.0.1 or ::1, check if array has entries
      expect(Array.isArray(content.result)).toBe(true);
      expect(content.result.length).toBeGreaterThan(0);
    });

    it('should handle invalid domains', async () => {
      const result = await callTool('rek_dns_lookup', {
        domain: 'invalid-domain-xyz-123.test',
      });

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('DNS lookup failed');
    });
  });

  describe('rek_network_ping', () => {
    it('should ping localhost', async () => {
      const result = await callTool('rek_network_ping', {
        host: 'localhost',
        port: testPort,
        count: 2,
      });

      expect(result.result.isError).toBeUndefined();
      const content = JSON.parse(result.result.content[0].text);
      expect(content.host).toBe('localhost');
      expect(content.port).toBe(testPort);
      expect(content.sent).toBe(2);
      // Should be 100% success since it's local
      expect(content.received).toBe(2);
    });

    it('should report failure for unreachable host', async () => {
      const result = await callTool('rek_network_ping', {
        host: 'localhost',
        port: 9998, // Unused port
        count: 1,
        timeout: 100,
      });

      expect(result.result.isError).toBeUndefined(); // The tool call succeeds, but reports ping failure
      const content = JSON.parse(result.result.content[0].text);
      expect(content.loss).toContain('100');
    });
  });

  // Whois is hard to test reliably without external network or mocking.
  // Skipping comprehensive whois test, just checking error case.
  describe('rek_whois_lookup', () => {
    it('should return error without query', async () => {
      const result = await callTool('rek_whois_lookup', {});
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('query is required');
    });
  });
});
