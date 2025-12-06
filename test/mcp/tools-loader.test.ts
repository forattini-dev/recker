import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadToolModules } from '../../src/mcp/tools/loader.js';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';

describe('loadToolModules', () => {
  const tempDir = join(process.cwd(), 'test/mcp/fixtures/temp-loader-tests');

  beforeEach(() => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should return empty array for empty paths', async () => {
    const modules = await loadToolModules([]);
    expect(modules).toEqual([]);
  });

  it('should warn and skip non-existent files', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const modules = await loadToolModules(['/non/existent/path.js']);

    expect(modules).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tool file not found'));
  });

  it('should warn and skip directories', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const modules = await loadToolModules([tempDir]);

    expect(modules).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('must be a file, not a directory'));
  });

  it('should load valid tool module', async () => {
    const validModulePath = join(tempDir, 'valid-tool.mjs');
    writeFileSync(validModulePath, `
      export const tools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} }
        }
      ];
      export const handlers = {
        test_tool: async () => ({ content: [{ type: 'text', text: 'OK' }] })
      };
    `);

    const modules = await loadToolModules([validModulePath]);

    expect(modules.length).toBe(1);
    expect(modules[0].tools[0].name).toBe('test_tool');
  });

  it('should load valid tool module from default export', async () => {
    const validModulePath = join(tempDir, 'default-tool.mjs');
    writeFileSync(validModulePath, `
      const tools = [
        {
          name: 'default_tool',
          description: 'A default exported tool',
          inputSchema: { type: 'object', properties: {} }
        }
      ];
      const handlers = {
        default_tool: async () => ({ content: [{ type: 'text', text: 'Default' }] })
      };
      export default { tools, handlers };
    `);

    const modules = await loadToolModules([validModulePath]);

    expect(modules.length).toBe(1);
    expect(modules[0].tools[0].name).toBe('default_tool');
  });

  it('should warn and skip invalid modules without tools array', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidModulePath = join(tempDir, 'invalid-no-tools.mjs');
    writeFileSync(invalidModulePath, `
      export const handlers = { test: () => {} };
    `);

    const modules = await loadToolModules([invalidModulePath]);

    expect(modules).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid tool module'));
  });

  it('should warn and skip invalid modules without handlers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidModulePath = join(tempDir, 'invalid-no-handlers.mjs');
    writeFileSync(invalidModulePath, `
      export const tools = [{ name: 'test' }];
    `);

    const modules = await loadToolModules([invalidModulePath]);

    expect(modules).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid tool module'));
  });

  it('should handle import errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badModulePath = join(tempDir, 'syntax-error.mjs');
    writeFileSync(badModulePath, `
      export const tools = [invalid syntax here;
    `);

    const modules = await loadToolModules([badModulePath]);

    expect(modules).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    // The error message includes "Error loading tool module"
    const calls = consoleSpy.mock.calls;
    const hasErrorCall = calls.some(call =>
      call[0]?.toString().includes('Error loading tool module') ||
      call[0]?.toString().includes('syntax-error')
    );
    expect(hasErrorCall).toBe(true);
  });

  it('should load multiple valid modules', async () => {
    const module1Path = join(tempDir, 'tool1.mjs');
    const module2Path = join(tempDir, 'tool2.mjs');

    writeFileSync(module1Path, `
      export const tools = [{ name: 'tool1', description: 'Tool 1', inputSchema: {} }];
      export const handlers = { tool1: async () => ({}) };
    `);

    writeFileSync(module2Path, `
      export const tools = [{ name: 'tool2', description: 'Tool 2', inputSchema: {} }];
      export const handlers = { tool2: async () => ({}) };
    `);

    const modules = await loadToolModules([module1Path, module2Path]);

    expect(modules.length).toBe(2);
  });

  it('should skip invalid modules but load valid ones', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const validPath = join(tempDir, 'valid.mjs');
    const invalidPath = join(tempDir, 'invalid.mjs');

    writeFileSync(validPath, `
      export const tools = [{ name: 'valid', description: 'Valid', inputSchema: {} }];
      export const handlers = { valid: async () => ({}) };
    `);

    writeFileSync(invalidPath, `
      export const foo = 'bar';
    `);

    const modules = await loadToolModules([validPath, invalidPath]);

    expect(modules.length).toBe(1);
    expect(modules[0].tools[0].name).toBe('valid');
  });
});
