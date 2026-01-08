#!/usr/bin/env node
/**
 * Browser Bundle Script
 * Creates ESM, UMD, and IIFE bundles for browser distribution
 */

import { build } from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const banner = `/**
 * Recker Browser
 * AI & DevX focused HTTP client
 * https://github.com/forattini-dev/recker
 * @license MIT
 */`;

// Node.js modules that should be stubbed/excluded for browser
const nodeModules = [
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:v8',
  'node:stream',
  'node:stream/promises',
  'node:zlib',
  'node:crypto',
  'node:buffer',
  'node:util',
  'node:events',
  'node:net',
  'node:tls',
  'node:async_hooks',
  'node:assert',
  'node:diagnostics_channel',
  'events',
  'fs',
  'path',
  'os',
  'stream',
  'zlib',
  'crypto',
  'buffer',
  'util',
  'net',
  'tls',
  'child_process',
  'node:child_process',
  'undici'
];

// Plugin to stub Node.js built-in modules
const nodeStubPlugin = {
  name: 'node-stub',
  setup(build) {
    // Stub all node: prefixed modules
    build.onResolve({ filter: /^node:/ }, args => ({
      path: args.path,
      namespace: 'node-stub',
    }));
    
    // Stub external node-only packages
    build.onResolve({ filter: /^undici$/ }, args => ({
      path: args.path,
      namespace: 'node-stub',
    }));

    // Stub non-prefixed Node.js modules
    const builtinModules = new Set([
      'events', 'fs', 'path', 'os', 'stream', 'zlib',
      'crypto', 'buffer', 'util', 'net', 'tls', 'http', 'https',
      'perf_hooks', 'async_hooks', 'diagnostics_channel', 'assert',
      'child_process'
    ]);
    build.onResolve({ filter: /^[a-z_]+$/ }, args => {
      if (builtinModules.has(args.path)) {
        return { path: args.path, namespace: 'node-stub' };
      }
      return null;
    });

    // Return comprehensive stubs for all Node.js modules
    build.onLoad({ filter: /.*/, namespace: 'node-stub' }, (args) => ({
      contents: `
        // Comprehensive stub for ${args.path} - not available in browser
        const noop = () => {};
        const noopPromise = () => Promise.resolve();
        const noopClass = class { constructor() {} };

        // Default export
        export default {};

        // fs module
        export const createWriteStream = noop;
        export const createReadStream = noop;
        export const readFileSync = () => '';
        export const writeFileSync = noop;
        export const existsSync = () => false;
        export const mkdir = noopPromise;
        export const readFile = noopPromise;
        export const writeFile = noopPromise;
        export const unlink = noopPromise;
        export const rm = noopPromise;
        export const stat = noopPromise;
        export const readdir = noopPromise;

        // path module
        export const join = (...args) => args.join('/');
        export const dirname = (p) => p.split('/').slice(0, -1).join('/');
        export const basename = (p) => p.split('/').pop() || '';
        export const extname = (p) => { const m = p.match(/\\.[^.]+$/); return m ? m[0] : ''; };
        export const resolve = (...args) => args.join('/');

        // stream module
        export const pipeline = noopPromise;
        export const Readable = noopClass;
        export const Writable = noopClass;
        export const Transform = noopClass;
        export const PassThrough = noopClass;
        export const finished = noopPromise;

        // events module
        export const EventEmitter = class {
          on() { return this; }
          off() { return this; }
          emit() { return false; }
          once() { return this; }
          addListener() { return this; }
          removeListener() { return this; }
        };

        // crypto module
        export const createHash = () => ({ update: () => ({ digest: () => '' }) });
        export const createHmac = () => ({ update: () => ({ digest: () => '' }) });
        export const createSign = () => ({ update: () => ({}), sign: () => '' });
        export const createPrivateKey = () => ({});
        export const randomBytes = (n) => new Uint8Array(n);
        export const randomUUID = () => crypto.randomUUID();
        export const createDecipheriv = () => ({ update: (d) => d, final: () => new Uint8Array(0), setAutoPadding: noop });
        export const createCipheriv = () => ({ update: (d) => d, final: () => new Uint8Array(0), setAutoPadding: noop });

        // util module
        export const promisify = (fn) => fn;
        export const inspect = (obj) => JSON.stringify(obj);
        export const format = (...args) => args.join(' ');

        // os module
        export const platform = () => 'browser';
        export const arch = () => 'unknown';
        export const cpus = () => [];
        export const freemem = () => 0;
        export const totalmem = () => 0;
        export const homedir = () => '/';
        export const tmpdir = () => '/tmp';

        // net module
        export const createConnection = noop;
        export const connect = noop;
        export const Socket = noopClass;
        export const Server = noopClass;

        // tls module
        export const TLSSocket = noopClass;

        // dns module
        export const lookup = (hostname, cb) => cb(null, '127.0.0.1', 4);
        export const resolve4 = noopPromise;
        export const resolve6 = noopPromise;
        export const resolveMx = noopPromise;
        export const resolveTxt = noopPromise;
        export const resolveNs = noopPromise;
        export const resolveCname = noopPromise;

        // zlib module
        export const gzip = (data, cb) => cb(null, data);
        export const deflate = (data, cb) => cb(null, data);
        export const brotliCompress = (data, cb) => cb(null, data);
        export const gunzip = (data, cb) => cb(null, data);
        export const inflate = (data, cb) => cb(null, data);
        export const brotliDecompress = (data, cb) => cb(null, data);
        export const gunzipSync = (data) => data;
        export const gzipSync = (data) => data;
        export const deflateSync = (data) => data;
        export const inflateSync = (data) => data;

        // perf_hooks module
        export const performance = globalThis.performance;

        // async_hooks module
        export const AsyncLocalStorage = class {
          getStore() { return undefined; }
          run(store, fn) { return fn(); }
          enterWith() {}
        };
        export const AsyncResource = noopClass;

        // diagnostics_channel
        export const channel = () => ({
          subscribe: noop,
          unsubscribe: noop,
          publish: noop,
          hasSubscribers: false
        });

        // buffer module
        export const Buffer = {
          from: (data) => new Uint8Array(typeof data === 'string' ? new TextEncoder().encode(data) : data),
          alloc: (size) => new Uint8Array(size),
          allocUnsafe: (size) => new Uint8Array(size),
          isBuffer: () => false,
        };

        // assert module
        export const ok = noop;
        export const strictEqual = noop;
        export const deepStrictEqual = noop;
        export const throws = noop;
        export const rejects = noopPromise;

        // child_process module
        export const spawn = () => ({
            on: noop,
            stdout: { on: noop },
            stderr: { on: noop },
            kill: noop
        });
        export const spawnSync = () => ({ status: 0, stdout: '', stderr: '' });
        export const exec = noop;
        export const execSync = () => '';

        // undici module
        export const request = noopPromise;
        export const errors = { 
            ConnectTimeoutError: noopClass,
            HeadersTimeoutError: noopClass,
            BodyTimeoutError: noopClass
        };
        export const ProxyAgent = noopClass;
        export const Agent = noopClass;
        export const Client = noopClass;
        export const WebSocket = noopClass;

        // fs module extras
        export const promises = {
            readFile: noopPromise,
            writeFile: noopPromise,
            access: noopPromise,
            stat: noopPromise,
            mkdir: noopPromise,
            unlink: noopPromise,
            readdir: noopPromise
        };
      `,
      loader: 'js',
    }));
  },
};

const commonOptions = {
  entryPoints: ['./dist/browser/browser/index.js'],
  bundle: true,
  platform: 'browser',
  target: ['chrome90', 'firefox90', 'safari15', 'edge90'],
  banner: { js: banner },
  legalComments: 'none',
  plugins: [nodeStubPlugin],
};

const miniOptions = {
  ...commonOptions,
  entryPoints: ['./dist/browser/browser/index-mini.js'],
};

async function bundleBrowser() {
  console.log('Building browser bundles...\n');

  // ESM minified
  await build({
    ...commonOptions,
    outfile: './dist/browser/index.min.js',
    format: 'esm',
    minify: true,
    sourcemap: true,
  });
  console.log('  ESM minified: dist/browser/index.min.js');

  // UMD (for <script> tags)
  await build({
    ...commonOptions,
    outfile: './dist/browser/index.umd.js',
    format: 'iife',
    globalName: 'recker',
    minify: false,
  });
  console.log('  UMD: dist/browser/index.umd.js');

  // UMD minified
  await build({
    ...commonOptions,
    outfile: './dist/browser/index.umd.min.js',
    format: 'iife',
    globalName: 'recker',
    minify: true,
    sourcemap: true,
  });
  console.log('  UMD minified: dist/browser/index.umd.min.js');

  // IIFE (for CDN)
  await build({
    ...commonOptions,
    outfile: './dist/browser/index.iife.js',
    format: 'iife',
    globalName: 'recker',
    minify: false,
  });
  console.log('  IIFE: dist/browser/index.iife.js');

  // IIFE minified
  await build({
    ...commonOptions,
    outfile: './dist/browser/index.iife.min.js',
    format: 'iife',
    globalName: 'recker',
    minify: true,
    sourcemap: true,
  });
  console.log('  IIFE minified: dist/browser/index.iife.min.js');

  // Mini ESM minified
  await build({
    ...miniOptions,
    outfile: './dist/browser/index.mini.min.js',
    format: 'esm',
    minify: true,
    sourcemap: true,
  });
  console.log('  Mini ESM minified: dist/browser/index.mini.min.js');

  // Mini UMD (for <script> tags)
  await build({
    ...miniOptions,
    outfile: './dist/browser/index.mini.umd.js',
    format: 'iife',
    globalName: 'recker',
    minify: false,
  });
  console.log('  Mini UMD: dist/browser/index.mini.umd.js');

  // Mini UMD minified
  await build({
    ...miniOptions,
    outfile: './dist/browser/index.mini.umd.min.js',
    format: 'iife',
    globalName: 'recker',
    minify: true,
    sourcemap: true,
  });
  console.log('  Mini UMD minified: dist/browser/index.mini.umd.min.js');

  // Mini IIFE (for CDN)
  await build({
    ...miniOptions,
    outfile: './dist/browser/index.mini.iife.js',
    format: 'iife',
    globalName: 'recker',
    minify: false,
  });
  console.log('  Mini IIFE: dist/browser/index.mini.iife.js');

  // Mini IIFE minified
  await build({
    ...miniOptions,
    outfile: './dist/browser/index.mini.iife.min.js',
    format: 'iife',
    globalName: 'recker',
    minify: true,
    sourcemap: true,
  });
  console.log('  Mini IIFE minified: dist/browser/index.mini.iife.min.js');

  console.log('\nBrowser bundles built successfully!');
}

bundleBrowser().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
