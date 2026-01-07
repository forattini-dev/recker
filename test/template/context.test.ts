/**
 * Template Context Tests
 *
 * 100% coverage for context.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildContext,
  buildContextSync,
  getEnvContext,
  getEnv,
  getEnvRequired,
  hasEnv,
  loadFile,
  loadFileBase64,
  loadJsonFile,
  fileExists,
  globFiles,
  pathUtils,
  mergeContexts,
  createChildContext,
  lookup,
  setPath,
  buildRequestContext,
  buildResponseContext,
  validateContext,
  createContextBuilder,
} from '../../src/template/context.js';

describe('Template Context - buildContext', () => {
  beforeEach(() => {
    process.env.CTX_TEST_VAR = 'test_value';
    process.env.CTX_API_KEY = 'api_secret';
  });

  afterEach(() => {
    delete process.env.CTX_TEST_VAR;
    delete process.env.CTX_API_KEY;
  });

  it('should build empty context', async () => {
    const ctx = await buildContext();
    expect(ctx).toEqual({});
  });

  it('should include env variables with true', async () => {
    const ctx = await buildContext({ env: true });
    expect(ctx.CTX_TEST_VAR).toBe('test_value');
  });

  it('should include specific env variables', async () => {
    const ctx = await buildContext({ env: ['CTX_TEST_VAR'] });
    expect(ctx.CTX_TEST_VAR).toBe('test_value');
    expect(ctx.CTX_API_KEY).toBeUndefined();
  });

  it('should include env variables by prefix', async () => {
    const ctx = await buildContext({ env: 'CTX_' });
    expect(ctx.CTX_TEST_VAR).toBe('test_value');
    expect(ctx.CTX_API_KEY).toBe('api_secret');
  });

  it('should include args', async () => {
    const ctx = await buildContext({ args: { custom: 'value' } });
    expect(ctx.custom).toBe('value');
  });

  it('should include request context', async () => {
    const request = { method: 'GET', url: '/api', headers: {}, query: {} };
    const ctx = await buildContext({ request });
    expect(ctx.$request).toEqual(request);
    expect(ctx.request).toEqual(request);
  });

  it('should include response context', async () => {
    const response = { status: 200, statusText: 'OK', headers: {} };
    const ctx = await buildContext({ response });
    expect(ctx.$response).toEqual(response);
    expect(ctx.response).toEqual(response);
  });
});

describe('Template Context - buildContextSync', () => {
  beforeEach(() => {
    process.env.SYNC_TEST = 'sync_value';
  });

  afterEach(() => {
    delete process.env.SYNC_TEST;
  });

  it('should build empty context sync', () => {
    const ctx = buildContextSync();
    expect(ctx).toEqual({});
  });

  it('should include env variables sync', () => {
    const ctx = buildContextSync({ env: true });
    expect(ctx.SYNC_TEST).toBe('sync_value');
  });

  it('should include args sync', () => {
    const ctx = buildContextSync({ args: { key: 'val' } });
    expect(ctx.key).toBe('val');
  });

  it('should include request context sync', () => {
    const request = { method: 'POST', url: '/test', headers: {}, query: {} };
    const ctx = buildContextSync({ request });
    expect(ctx.$request).toEqual(request);
  });

  it('should include response context sync', () => {
    const response = { status: 201, statusText: 'Created', headers: {} };
    const ctx = buildContextSync({ response });
    expect(ctx.$response).toEqual(response);
  });
});

describe('Template Context - Environment Functions', () => {
  beforeEach(() => {
    process.env.ENV_TEST_VAR = 'test123';
    process.env.ENV_PREFIX_ONE = 'one';
    process.env.ENV_PREFIX_TWO = 'two';
  });

  afterEach(() => {
    delete process.env.ENV_TEST_VAR;
    delete process.env.ENV_PREFIX_ONE;
    delete process.env.ENV_PREFIX_TWO;
  });

  describe('getEnvContext', () => {
    it('should get all env vars with true', () => {
      const ctx = getEnvContext(true);
      expect(ctx.ENV_TEST_VAR).toBe('test123');
    });

    it('should get specific env vars', () => {
      const ctx = getEnvContext(['ENV_TEST_VAR']);
      expect(ctx.ENV_TEST_VAR).toBe('test123');
      expect(ctx.ENV_PREFIX_ONE).toBeUndefined();
    });

    it('should get env vars by prefix', () => {
      const ctx = getEnvContext('ENV_PREFIX_');
      expect(ctx.ENV_PREFIX_ONE).toBe('one');
      expect(ctx.ENV_PREFIX_TWO).toBe('two');
      expect(ctx.ENV_TEST_VAR).toBeUndefined();
    });

    it('should handle missing vars in array', () => {
      const ctx = getEnvContext(['MISSING_VAR', 'ENV_TEST_VAR']);
      expect(ctx.MISSING_VAR).toBeUndefined();
      expect(ctx.ENV_TEST_VAR).toBe('test123');
    });
  });

  describe('getEnv', () => {
    it('should get env var', () => {
      expect(getEnv('ENV_TEST_VAR')).toBe('test123');
    });

    it('should return default for missing var', () => {
      expect(getEnv('MISSING', 'default')).toBe('default');
    });

    it('should return undefined without default', () => {
      expect(getEnv('MISSING')).toBeUndefined();
    });
  });

  describe('getEnvRequired', () => {
    it('should get required env var', () => {
      expect(getEnvRequired('ENV_TEST_VAR')).toBe('test123');
    });

    it('should throw for missing required var', () => {
      expect(() => getEnvRequired('MISSING_REQUIRED')).toThrow(
        'Required environment variable not set: MISSING_REQUIRED'
      );
    });
  });

  describe('hasEnv', () => {
    it('should return true for existing var', () => {
      expect(hasEnv('ENV_TEST_VAR')).toBe(true);
    });

    it('should return false for missing var', () => {
      expect(hasEnv('MISSING_VAR')).toBe(false);
    });
  });
});

describe('Template Context - File Functions', () => {
  const testDir = join(process.cwd(), '.test-context-files');
  const testFile = join(testDir, 'test.txt');
  const testJson = join(testDir, 'test.json');
  const nestedDir = join(testDir, 'nested');
  const nestedFile = join(nestedDir, 'deep.txt');

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(testFile, 'Hello World');
    await writeFile(testJson, JSON.stringify({ key: 'value' }));
    await writeFile(nestedFile, 'Deep content');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('loadFile', () => {
    it('should load file content', async () => {
      const content = await loadFile(testFile);
      expect(content).toBe('Hello World');
    });

    it('should load file with baseDir', async () => {
      const content = await loadFile('test.txt', testDir);
      expect(content).toBe('Hello World');
    });
  });

  describe('loadFileBase64', () => {
    it('should load file as base64', async () => {
      const content = await loadFileBase64(testFile);
      expect(content).toBe(Buffer.from('Hello World').toString('base64'));
    });

    it('should load file as base64 with baseDir', async () => {
      const content = await loadFileBase64('test.txt', testDir);
      expect(content).toBe(Buffer.from('Hello World').toString('base64'));
    });
  });

  describe('loadJsonFile', () => {
    it('should load JSON file', async () => {
      const data = await loadJsonFile(testJson);
      expect(data).toEqual({ key: 'value' });
    });

    it('should load JSON with baseDir', async () => {
      const data = await loadJsonFile('test.json', testDir);
      expect(data).toEqual({ key: 'value' });
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      expect(await fileExists(testFile)).toBe(true);
    });

    it('should return false for missing file', async () => {
      expect(await fileExists(join(testDir, 'missing.txt'))).toBe(false);
    });

    it('should work with baseDir', async () => {
      expect(await fileExists('test.txt', testDir)).toBe(true);
      expect(await fileExists('missing.txt', testDir)).toBe(false);
    });
  });

  describe('globFiles', () => {
    it('should glob literal path', async () => {
      const files = await globFiles('test.txt', testDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('test.txt');
    });

    it('should glob with wildcard', async () => {
      const files = await globFiles('*.txt', testDir);
      expect(files.some(f => f.includes('test.txt'))).toBe(true);
    });

    it('should glob recursively with **', async () => {
      const files = await globFiles('**/*.txt', testDir);
      expect(files.some(f => f.includes('deep.txt'))).toBe(true);
    });

    it('should glob with ** and extension', async () => {
      const files = await globFiles('**.txt', testDir);
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('should use cwd when no baseDir (literal path)', async () => {
      // For literal paths (no wildcards), globFiles resolves relative to cwd
      const files = await globFiles('.test-context-files/test.txt');
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('test.txt');
    });
  });

  describe('buildContext with files', () => {
    it('should load files into context', async () => {
      const ctx = await buildContext({
        files: { content: testFile },
        baseDir: testDir,
      });
      expect(ctx.content).toBe('Hello World');
    });
  });
});

describe('Template Context - pathUtils', () => {
  it('should expose path utilities', () => {
    expect(pathUtils.join).toBeDefined();
    expect(pathUtils.resolve).toBeDefined();
    expect(pathUtils.basename).toBeDefined();
    expect(pathUtils.dirname).toBeDefined();
    expect(pathUtils.extname).toBeDefined();
  });

  it('should work correctly', () => {
    expect(pathUtils.join('a', 'b')).toBe('a/b');
    expect(pathUtils.basename('/foo/bar.txt')).toBe('bar.txt');
    expect(pathUtils.dirname('/foo/bar.txt')).toBe('/foo');
    expect(pathUtils.extname('/foo/bar.txt')).toBe('.txt');
  });
});

describe('Template Context - Context Merging', () => {
  describe('mergeContexts', () => {
    it('should merge flat contexts', () => {
      const a = { x: 1 };
      const b = { y: 2 };
      expect(mergeContexts(a, b)).toEqual({ x: 1, y: 2 });
    });

    it('should override values', () => {
      const a = { x: 1 };
      const b = { x: 2 };
      expect(mergeContexts(a, b)).toEqual({ x: 2 });
    });

    it('should deep merge objects', () => {
      const a = { user: { name: 'John', age: 30 } };
      const b = { user: { name: 'Jane' } };
      expect(mergeContexts(a, b)).toEqual({ user: { name: 'Jane', age: 30 } });
    });

    it('should not deep merge arrays', () => {
      const a = { items: [1, 2] };
      const b = { items: [3, 4] };
      expect(mergeContexts(a, b)).toEqual({ items: [3, 4] });
    });

    it('should handle null values', () => {
      const a = { x: { y: 1 } };
      const b = { x: null };
      expect(mergeContexts(a, b)).toEqual({ x: null });
    });
  });

  describe('createChildContext', () => {
    it('should create child context with $parent', () => {
      const parent = { name: 'parent' };
      const child = createChildContext(parent, { name: 'child' });
      expect(child.name).toBe('child');
      expect(child.$parent).toBe(parent);
    });

    it('should inherit parent properties', () => {
      const parent = { x: 1, y: 2 };
      const child = createChildContext(parent, { y: 3 });
      expect(child.x).toBe(1);
      expect(child.y).toBe(3);
    });
  });
});

describe('Template Context - Lookup', () => {
  describe('lookup', () => {
    it('should lookup simple path', () => {
      expect(lookup({ name: 'John' }, 'name')).toBe('John');
    });

    it('should lookup nested path', () => {
      expect(lookup({ user: { profile: { name: 'Jane' } } }, 'user.profile.name')).toBe('Jane');
    });

    it('should return context for empty path', () => {
      const ctx = { a: 1 };
      expect(lookup(ctx, '')).toBe(ctx);
    });

    it('should return undefined for missing path', () => {
      expect(lookup({ x: 1 }, 'y')).toBeUndefined();
    });

    it('should return undefined for null in path', () => {
      expect(lookup({ x: null }, 'x.y')).toBeUndefined();
    });

    it('should return undefined for non-object in path', () => {
      expect(lookup({ x: 'string' }, 'x.y')).toBeUndefined();
    });

    it('should handle array index access', () => {
      expect(lookup({ items: ['a', 'b', 'c'] }, 'items.[1]')).toBe('b');
    });
  });

  describe('setPath', () => {
    it('should set simple path', () => {
      const ctx: Record<string, unknown> = {};
      setPath(ctx, 'name', 'John');
      expect(ctx.name).toBe('John');
    });

    it('should set nested path', () => {
      const ctx: Record<string, unknown> = {};
      setPath(ctx, 'user.profile.name', 'Jane');
      expect((ctx.user as Record<string, unknown>).profile).toEqual({ name: 'Jane' });
    });

    it('should override non-object in path', () => {
      const ctx: Record<string, unknown> = { user: 'string' };
      setPath(ctx, 'user.name', 'John');
      expect((ctx.user as Record<string, unknown>).name).toBe('John');
    });

    it('should set value in existing object', () => {
      const ctx: Record<string, unknown> = { user: { age: 30 } };
      setPath(ctx, 'user.name', 'John');
      expect(ctx.user).toEqual({ age: 30, name: 'John' });
    });
  });
});

describe('Template Context - Request/Response Context', () => {
  describe('buildRequestContext', () => {
    it('should build basic request context', () => {
      const ctx = buildRequestContext('GET', 'https://api.com/users');
      expect(ctx.method).toBe('GET');
      expect(ctx.url).toBe('https://api.com/users');
      expect(ctx.headers).toEqual({});
      expect(ctx.query).toEqual({});
    });

    it('should include headers', () => {
      const ctx = buildRequestContext('POST', '/api', { 'Content-Type': 'application/json' });
      expect(ctx.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should include body', () => {
      const body = { name: 'John' };
      const ctx = buildRequestContext('POST', '/api', {}, body);
      expect(ctx.body).toEqual(body);
    });

    it('should parse query params', () => {
      const ctx = buildRequestContext('GET', 'https://api.com/search?q=test&page=1');
      expect(ctx.query).toEqual({ q: 'test', page: '1' });
    });

    it('should uppercase method', () => {
      const ctx = buildRequestContext('post', '/api');
      expect(ctx.method).toBe('POST');
    });
  });

  describe('buildResponseContext', () => {
    it('should build basic response context', () => {
      const ctx = buildResponseContext(200, 'OK');
      expect(ctx.status).toBe(200);
      expect(ctx.statusText).toBe('OK');
      expect(ctx.headers).toEqual({});
    });

    it('should include headers', () => {
      const ctx = buildResponseContext(200, 'OK', { 'Content-Type': 'application/json' });
      expect(ctx.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should include body', () => {
      const body = { data: 'test' };
      const ctx = buildResponseContext(200, 'OK', {}, body);
      expect(ctx.body).toEqual(body);
    });
  });
});

describe('Template Context - Validation', () => {
  describe('validateContext', () => {
    it('should validate context with all required vars', () => {
      const ctx = { name: 'John', age: 30 };
      const result = validateContext(ctx, ['name', 'age']);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing vars', () => {
      const ctx = { name: 'John' };
      const result = validateContext(ctx, ['name', 'age', 'email']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['age', 'email']);
    });

    it('should validate nested paths', () => {
      const ctx = { user: { name: 'John' } };
      const result = validateContext(ctx, ['user.name']);
      expect(result.valid).toBe(true);
    });

    it('should detect missing nested paths', () => {
      const ctx = { user: { name: 'John' } };
      const result = validateContext(ctx, ['user.email']);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['user.email']);
    });
  });
});

describe('Template Context - Factory', () => {
  describe('createContextBuilder', () => {
    it('should create builder with defaults', async () => {
      const builder = createContextBuilder({ args: { default: 'value' } });
      const ctx = await builder.build();
      expect(ctx.default).toBe('value');
    });

    it('should override options (shallow merge)', async () => {
      // Note: { ...defaults, ...options } does shallow merge
      // So args: { b: 2 } completely replaces args: { a: 1 }
      const builder = createContextBuilder({ args: { a: 1 } });
      const ctx = await builder.build({ args: { b: 2 } });
      expect(ctx.a).toBeUndefined(); // overwritten
      expect(ctx.b).toBe(2);
    });

    it('should support sync building', () => {
      const builder = createContextBuilder({ args: { sync: true } });
      const ctx = builder.buildSync();
      expect(ctx.sync).toBe(true);
    });

    it('should override sync options (shallow merge)', () => {
      // Note: { ...defaults, ...options } does shallow merge
      const builder = createContextBuilder({ args: { x: 1 } });
      const ctx = builder.buildSync({ args: { y: 2 } });
      expect(ctx.x).toBeUndefined(); // overwritten
      expect(ctx.y).toBe(2);
    });
  });
});
