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

  describe('rek_dns', () => {
    it('should resolve A records', async () => {
      const result = await callTool('rek_dns', {
        domain: 'localhost',
        type: 'A',
      });

      expect(result.result.isError).toBeUndefined();
      const content = JSON.parse(result.result.content[0].text);
      // Now returns array directly
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      // Check first record structure
      expect(content[0].type).toBeDefined();
      expect(content[0].data).toBeDefined();
    });

    it('should handle invalid domains', async () => {
      const result = await callTool('rek_dns', {
        domain: 'invalid-domain-xyz-123.test',
      });

      if (result.result.isError) {
        expect(result.result.content[0].text).toContain('DNS lookup failed');
      } else {
        const content = JSON.parse(result.result.content[0].text);
        expect(Array.isArray(content)).toBe(true);
        expect(content.length).toBe(0);
      }
    });
  });

  describe('rek_ping', () => {
    it('should ping localhost', async () => {
      const result = await callTool('rek_ping', {
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
      const result = await callTool('rek_ping', {
        host: '192.0.2.1', // TEST-NET-1 (RFC 5737) - guaranteed unreachable
        port: 9998,
        count: 1,
        timeout: 500,
      });

      expect(result.result.isError).toBeUndefined(); // The tool call succeeds, but reports ping failure
      const content = JSON.parse(result.result.content[0].text);
      // Should have packet loss (either timeout or connection refused)
      expect(content.received).toBeLessThan(content.sent);
    });
  });

  // Whois is hard to test reliably without external network or mocking.
  // Skipping comprehensive whois test, just checking error case.
  describe('rek_whois', () => {
    it('should return error without query', async () => {
      const result = await callTool('rek_whois', {});
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain('query is required');
    });
  });
});
