import { build } from 'esbuild';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

console.log('📦 Bundling CLI for binary distribution...');

const outfile = 'dist/bin/rek.cjs';

// Plugin to stub node:sqlite which causes issues with pkg + older node targets
const nodeSqliteStubPlugin = {
  name: 'node-sqlite-stub',
  setup(build) {
    build.onResolve({ filter: /^node:sqlite$/ }, args => ({
      path: args.path,
      namespace: 'sqlite-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'sqlite-stub' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js',
    }));
  },
};

try {
  // Ensure directory exists
  mkdirSync(dirname(outfile), { recursive: true });

  await build({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: outfile,
    format: 'cjs',
    sourcemap: false,
    minify: false,
    logOverride: {
      'empty-import-meta': 'silent', // We polyfill import.meta.url in post-processing
    },
    plugins: [nodeSqliteStubPlugin],
    external: [
      'fsevents',
      'sharp',
      'onnxruntime-node',
      'fastembed',
      '@anush008/tokenizers',
      'mock-aws-s3',
      'nock'
      // removed node:sqlite from external so our plugin handles it
    ],
  });

  // Post-processing
  let content = readFileSync(outfile, 'utf-8');
  
  // 1. Remove shebangs
  content = content.replace(/^#!.*\n/gm, '');
  
  // 2. Polyfill import.meta.url
  content = content.replace(/import\.meta\.url/g, "require('url').pathToFileURL(__filename).toString()");

  // 3. Add Header with Polyfills
  // File API polyfill for Node 18 environment in pkg
  const header = `#!/usr/bin/env node
if (typeof File === 'undefined') {
  global.File = class File extends Blob {
    constructor(fileBits, fileName, options) {
      super(fileBits, options);
      this.name = fileName;
      this.lastModified = options?.lastModified || Date.now();
    }
  };
}
`;
  content = header + content;

  writeFileSync(outfile, content);

  try {
    chmodSync(outfile, '755');
  } catch (e) { }
  
  console.log(`✅ CLI bundled successfully at ${outfile}`);
  
} catch (e) {
  console.error('❌ Bundling failed:', e);
  process.exit(1);
}