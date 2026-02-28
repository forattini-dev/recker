import { promises as fs, constants } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const BIN_DIR = join(homedir(), '.recker', 'bin');
const VERSION = 'v0.6.1'; // Pinned version for stability

export function getCurlBinName(): string {
    return 'curl-impersonate-chrome';
}

export function getCurlPath(): string {
    return join(BIN_DIR, getCurlBinName());
}

export async function hasImpersonate(): Promise<boolean> {
    const binaryPath = process.env.RECKER_CURL_BIN || getCurlPath();

    try {
        await fs.access(binaryPath, constants.X_OK);
    } catch {
        return false;
    }

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
    
    // macOS support (experimental, static builds might vary)
    if (p === 'darwin') {
        // macOS builds are not always in the main release assets or require brew.
        // For now, we fallback to system curl on macOS if not found, 
        // or user can manually install and link.
        throw new Error('Auto-install not yet supported on macOS. Please install curl-impersonate manually.');
    }

    if (p === 'win32') {
        throw new Error('Auto-install not yet supported on Windows.');
    }

    throw new Error(`Unsupported platform: ${p} ${a}`);
}

export async function installCurlImpersonate(logger = console): Promise<void> {
    const url = getDownloadUrl();
    const tarPath = join(BIN_DIR, 'curl-impersonate.tar.gz');
    
    await fs.mkdir(BIN_DIR, { recursive: true });
    
    logger.log(`Downloading curl-impersonate from ${url}...`);
    
    // Use native fetch for download (bootstrapping)
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
    
    if (!res.body) throw new Error('Empty body');
    
    const fileStream = createWriteStream(tarPath);
    // @ts-ignore - ReadableStream to Writable
    await finished(Readable.fromWeb(res.body).pipe(fileStream));
    
    logger.log('Extracting...');
    
    // Use system tar
    await new Promise<void>((resolve, reject) => {
        const tar = spawn('tar', ['-xzf', tarPath, '-C', BIN_DIR]);
        tar.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Tar exited with code ${code}`));
        });
    });
    
    // Cleanup
    await fs.unlink(tarPath);
    
    // Verify
    if (await hasImpersonate()) {
        logger.log(`✅ Installed to ${getCurlPath()}`);
    } else {
        throw new Error('Installation failed: Binary not found after extraction');
    }
}
