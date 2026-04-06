import { promises as fs, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

// Package-local binary directory (installed by postinstall)
const PACKAGE_BIN_DIR = join(__dirname_local, '..', '..', '.curl', 'bin');

// Legacy user-home directory (deprecated, kept for fallback)
const LEGACY_BIN_DIR = join(homedir(), '.recker', 'bin');

const VERSION = 'v0.6.1'; // Pinned version for stability

export function getCurlBinName(): string {
    return 'curl-impersonate-chrome';
}

/**
 * Returns the package-local binary path (primary location).
 */
export function getCurlPath(): string {
    return join(PACKAGE_BIN_DIR, getCurlBinName());
}

/**
 * Returns the legacy binary path (~/.recker/bin/).
 */
export function getLegacyCurlPath(): string {
    return join(LEGACY_BIN_DIR, getCurlBinName());
}

/**
 * Resolves the curl-impersonate binary path with priority:
 * 1. RECKER_CURL_BIN env var (explicit override)
 * 2. Package-local (.curl/bin/ inside recker package)
 * 3. Legacy (~/.recker/bin/)
 * 4. null (not found)
 */
export async function resolveCurlPath(): Promise<string | null> {
    if (process.env.RECKER_CURL_BIN) {
        return process.env.RECKER_CURL_BIN;
    }

    const packagePath = getCurlPath();
    try {
        await fs.access(packagePath, constants.X_OK);
        return packagePath;
    } catch { /* not found */ }

    const legacyPath = getLegacyCurlPath();
    try {
        await fs.access(legacyPath, constants.X_OK);
        return legacyPath;
    } catch { /* not found */ }

    return null;
}

export async function hasImpersonate(): Promise<boolean> {
    const binaryPath = await resolveCurlPath();
    if (!binaryPath) return false;

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const child = spawn(binaryPath, ['--version']);

        const settle = (ok: boolean) => {
            if (!settled) {
                settled = true;
                resolve(ok);
            }
        };

        child.on('error', () => settle(false));
        child.on('close', (code) => {
            settle(code === 0);
        });

        const timeout = setTimeout(() => {
            if (child.exitCode === null) {
                child.kill();
            }
            settle(false);
        }, 2_000);

        child.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

function getDownloadUrl(): string {
    const p = platform();
    const a = arch();

    const baseUrl = `https://github.com/lwthiker/curl-impersonate/releases/download/${VERSION}`;

    if (p === 'linux') {
        if (a === 'x64') return `${baseUrl}/curl-impersonate-${VERSION}.x86_64-linux-gnu.tar.gz`;
        if (a === 'arm64') return `${baseUrl}/curl-impersonate-${VERSION}.aarch64-linux-gnu.tar.gz`;
    }

    if (p === 'darwin') {
        throw new Error('Auto-install not yet supported on macOS. Please install curl-impersonate manually.');
    }

    if (p === 'win32') {
        throw new Error('Auto-install not yet supported on Windows.');
    }

    throw new Error(`Unsupported platform: ${p} ${a}`);
}

export async function installCurlImpersonate(logger = console): Promise<void> {
    const url = getDownloadUrl();
    const tarPath = join(PACKAGE_BIN_DIR, 'curl-impersonate.tar.gz');

    await fs.mkdir(PACKAGE_BIN_DIR, { recursive: true });

    logger.log(`Downloading curl-impersonate from ${url}...`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);

    if (!res.body) throw new Error('Empty body');

    const fileStream = createWriteStream(tarPath);
    // @ts-ignore - ReadableStream to Writable
    await finished(Readable.fromWeb(res.body).pipe(fileStream));

    logger.log('Extracting...');

    await new Promise<void>((resolve, reject) => {
        const tar = spawn('tar', ['-xzf', tarPath, '-C', PACKAGE_BIN_DIR]);
        tar.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Tar exited with code ${code}`));
        });
    });

    // Cleanup
    await fs.unlink(tarPath);

    // Verify
    if (await hasImpersonate()) {
        logger.log(`Installed to ${getCurlPath()}`);
    } else {
        throw new Error('Installation failed: Binary not found after extraction');
    }
}
