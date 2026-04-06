#!/usr/bin/env node
'use strict';

const { promises: fs, constants, createWriteStream } = require('node:fs');
const { join, resolve } = require('node:path');
const { platform, arch } = require('node:os');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { finished } = require('node:stream/promises');

const SKIP_TOKEN = '1';
const DEFAULT_VERSION = 'v0.6.1';
const BIN_NAME = 'curl-impersonate-chrome';
const BIN_DIR = join(__dirname, '..', '.curl', 'bin');

const version = process.env.CURL_IMPERSONATE_VERSION || DEFAULT_VERSION;
const githubToken = process.env.GITHUB_TOKEN;

function getDownloadUrl() {
  const p = platform();
  const a = arch();
  const base = `https://github.com/lwthiker/curl-impersonate/releases/download/${version}`;

  if (p === 'linux') {
    if (a === 'x64') return `${base}/curl-impersonate-${VERSION}.x86_64-linux-gnu.tar.gz`;
    if (a === 'arm64') return `${base}/curl-impersonate-${VERSION}.aarch64-linux-gnu.tar.gz`;
  }

  // macOS and Windows: skip silently (not supported for auto-install)
  return null;
}

async function exists(filePath) {
  try {
    await fs.access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function verifyBinary(filePath) {
  if (!await exists(filePath)) return false;

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(filePath, ['--version']);

    const settle = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    child.on('error', () => settle(false));
    child.on('close', (code) => settle(code === 0));

    setTimeout(() => {
      if (child.exitCode === null) child.kill();
      settle(false);
    }, 5_000);

    child.on('close', () => {});
  });
}

async function install() {
  const url = getDownloadUrl();
  if (!url) {
    process.stdout.write(`recker: postinstall skipped (unsupported platform: ${platform()} ${arch()})\n`);
    return;
  }

  const binPath = join(BIN_DIR, BIN_NAME);

  // Already installed?
  if (await verifyBinary(binPath)) {
    process.stdout.write(`recker: curl-impersonate already installed at ${binPath}\n`);
    return;
  }

  await fs.mkdir(BIN_DIR, { recursive: true });

  process.stdout.write(`recker: downloading curl-impersonate ${version}...\n`);

  const headers = githubToken ? { Authorization: `Bearer ${githubToken}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  if (!res.body) throw new Error('Empty response body');

  const tarPath = join(BIN_DIR, 'curl-impersonate.tar.gz');
  const fileStream = createWriteStream(tarPath);
  await finished(Readable.fromWeb(res.body).pipe(fileStream));

  // Extract
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tarPath, '-C', BIN_DIR]);
    tar.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
    tar.on('error', reject);
  });

  // Cleanup tar
  await fs.unlink(tarPath).catch(() => {});

  // Verify
  if (await verifyBinary(binPath)) {
    process.stdout.write(`recker: installed curl-impersonate at ${binPath}\n`);
  } else {
    throw new Error('Binary not functional after extraction');
  }
}

// Main
if (process.env.RECKER_SKIP_POSTINSTALL === SKIP_TOKEN) {
  process.stdout.write('recker: postinstall skipped by RECKER_SKIP_POSTINSTALL=1\n');
  process.exit(0);
}

install().catch((error) => {
  process.stderr.write(`recker: postinstall skipped because download failed (${error.message})\n`);
  process.exit(0); // Never break install
});
