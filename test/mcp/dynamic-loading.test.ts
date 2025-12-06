import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer } from '../../src/mcp/server.js';
import { join, resolve } from 'path';

describe('MCP Dynamic Tool Loading', () => {
  let server: MCPServer;
  const testPort = 3210;
  const toolFixturePath = join(process.cwd(), 'test/mcp/fixtures/custom-tool.js');

  beforeAll(async () => {
    server = new MCPServer({
      transport: 'http',
      port: testPort,
      toolPaths: [toolFixturePath],
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

  const listTools = async () => {
    const response = await fetch(`http://localhost:${testPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });
    return response.json();
  };

  it('should list the dynamically loaded tool', async () => {
    const result = await listTools();
    const toolNames = result.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('custom_hello');
  });

  it('should execute the dynamically loaded tool', async () => {
    const result = await callTool('custom_hello', { name: 'Vitest' });
    
    expect(result.result.isError).toBeUndefined();
    expect(result.result.content[0].text).toBe('Hello, Vitest!');
  });
});
