import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let mockBaseDir = '';
let mockHomeDir = '';
let mockPlatform = 'linux';
let mockArch = 'x64';
type SpawnEvent = { type: 'error' | 'close'; value?: Error | number; delayMs?: number };
type SpawnBehavior = {
  exitCodeAtStart?: number | null;
  events: SpawnEvent[];
};
const spawnBehaviors: SpawnBehavior[] = [];

function queueSpawnBehavior(behavior: SpawnBehavior): void {
  spawnBehaviors.push(behavior);
}

function clearSpawnBehaviors(): void {
  spawnBehaviors.length = 0;
}

function scheduleSpawnEvents(child: EventEmitter & { kill: () => void; exitCode?: number | null }, behavior: SpawnBehavior): void {
  const emitEvent = (event: SpawnEvent) => {
    if (event.type === 'error') {
      child.emit('error', event.value instanceof Error ? event.value : new Error('spawn error'));
    } else {
      child.emit('close', typeof event.value === 'number' ? event.value : 0);
    }
  };

  for (const event of behavior.events) {
    const delay = event.delayMs ?? 0;
    setTimeout(() => emitEvent(event), delay);
  }
}

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const behavior = spawnBehaviors.shift();
      if (!behavior) {
        return actual.spawn(...args);
      }

      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: () => void;
        exitCode: number | null | undefined;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.exitCode = behavior.exitCodeAtStart;
      child.kill = () => {
        child.exitCode = child.exitCode === null ? 1 : child.exitCode;
      };

      scheduleSpawnEvents(child, behavior);
      return child;
    },
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => mockHomeDir,
    platform: () => mockPlatform,
    arch: () => mockArch,
  };
});

vi.mock('node:url', async () => {
  const actual = await vi.importActual<typeof import('node:url')>('node:url');
  return {
    ...actual,
    fileURLToPath: () => join(mockBaseDir, 'src', 'utils', 'binary-manager.ts'),
  };
});

type BinaryManagerModule = typeof import('../../src/utils/binary-manager.js');

let moduleInstance: BinaryManagerModule;
const originalFetch = global.fetch;

/** Package-local binary dir: <mockBaseDir>/.curl/bin/ */
function packageBinDir(): string {
  return join(mockBaseDir, '.curl', 'bin');
}

/** Legacy binary dir: <mockHomeDir>/.recker/bin/ */
function legacyBinDir(): string {
  return join(mockHomeDir, '.recker', 'bin');
}

function createExecutableAt(dir: string, content: string): Promise<string> {
  const binPath = join(dir, 'curl-impersonate-chrome');
  return writeFile(
    binPath,
    `#!/bin/sh\n${content}\n`,
    { mode: 0o755 },
  ).then(() => binPath);
}

async function createTarPayload(content: string, mode = 0o755): Promise<Buffer> {
  const archiveRoot = await mkdtemp(join(tmpdir(), 'recker-curl-payload-'));
  try {
    const packedBinary = join(archiveRoot, 'curl-impersonate-chrome');
    await writeFile(packedBinary, content);
    await chmod(packedBinary, mode);
    const tarPath = join(archiveRoot, 'curl-impersonate.tar.gz');
    execFileSync('tar', ['-czf', tarPath, '-C', archiveRoot, 'curl-impersonate-chrome']);
    return await readFile(tarPath);
  } finally {
    await rm(archiveRoot, { recursive: true, force: true });
  }
}

describe('binary-manager', () => {
  beforeEach(async () => {
    mockBaseDir = await mkdtemp(join(tmpdir(), 'recker-pkg-'));
    mockHomeDir = await mkdtemp(join(tmpdir(), 'recker-home-'));
    await mkdir(packageBinDir(), { recursive: true });
    await mkdir(legacyBinDir(), { recursive: true });
    mockPlatform = 'linux';
    mockArch = 'x64';
    await vi.resetModules();
    moduleInstance = await import('../../src/utils/binary-manager.js');
    vi.clearAllMocks();
    delete process.env.RECKER_CURL_BIN;
    clearSpawnBehaviors();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await rm(mockBaseDir, { recursive: true, force: true });
    await rm(mockHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
    clearSpawnBehaviors();
  });

  // =========================================================================
  // Path resolution
  // =========================================================================

  it('getCurlPath returns package-local path', () => {
    expect(moduleInstance.getCurlPath()).toBe(
      join(packageBinDir(), 'curl-impersonate-chrome'),
    );
  });

  it('getLegacyCurlPath returns home-dir path', () => {
    expect(moduleInstance.getLegacyCurlPath()).toBe(
      join(legacyBinDir(), 'curl-impersonate-chrome'),
    );
  });

  it('resolveCurlPath prefers RECKER_CURL_BIN env var', async () => {
    process.env.RECKER_CURL_BIN = '/custom/bin/curl';
    const resolved = await moduleInstance.resolveCurlPath();
    expect(resolved).toBe('/custom/bin/curl');
  });

  it('resolveCurlPath finds package-local binary first', async () => {
    await createExecutableAt(packageBinDir(), 'echo ok');
    await createExecutableAt(legacyBinDir(), 'echo ok');

    const resolved = await moduleInstance.resolveCurlPath();
    expect(resolved).toBe(join(packageBinDir(), 'curl-impersonate-chrome'));
  });

  it('resolveCurlPath falls back to legacy path', async () => {
    await createExecutableAt(legacyBinDir(), 'echo ok');

    const resolved = await moduleInstance.resolveCurlPath();
    expect(resolved).toBe(join(legacyBinDir(), 'curl-impersonate-chrome'));
  });

  it('resolveCurlPath returns null when no binary found', async () => {
    const resolved = await moduleInstance.resolveCurlPath();
    expect(resolved).toBeNull();
  });

  // =========================================================================
  // hasImpersonate
  // =========================================================================

  it('detects curl-impersonate when binary exists and responds to --version', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'echo "curl-impersonate-ok"');
    process.env.RECKER_CURL_BIN = binaryPath;

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(true);
  });

  it('returns false when binary is not present', async () => {
    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when binary exits with non-zero version code', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'exit 1');
    process.env.RECKER_CURL_BIN = binaryPath;

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('detects binary in package-local dir without env var', async () => {
    await createExecutableAt(packageBinDir(), 'echo "curl-impersonate-ok"');

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(true);
  });

  it('detects binary in legacy dir when not in package dir', async () => {
    await createExecutableAt(legacyBinDir(), 'echo "curl-impersonate-ok"');

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(true);
  });

  // =========================================================================
  // installCurlImpersonate
  // =========================================================================

  it('installs binary to package-local directory', async () => {
    const tarPayload = await createTarPayload('#!/bin/sh\necho 0.6.1\n');
    const fetchSpy = vi.fn(async () => new Response(tarPayload));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await moduleInstance.installCurlImpersonate(logger as unknown as Console);

    const installed = await moduleInstance.hasImpersonate();
    expect(installed).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('curl-impersonate-v0.6.1'));
    expect(await readFile(join(packageBinDir(), 'curl-impersonate-chrome'), 'utf8')).toContain('0.6.1');
  });

  it('installs curl-impersonate from ARM64 Linux artifact', async () => {
    mockArch = 'arm64';
    await vi.resetModules();
    moduleInstance = await import('../../src/utils/binary-manager.js');
    const tarPayload = await createTarPayload('#!/bin/sh\necho 0.6.1\n');

    const fetchSpy = vi.fn(async () => new Response(tarPayload));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await moduleInstance.installCurlImpersonate(logger as unknown as Console);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('aarch64-linux-gnu.tar.gz'));
    expect(await moduleInstance.hasImpersonate()).toBe(true);
  });

  it('throws install error when download returns non-OK response', async () => {
    const fetchSpy = vi.fn(async () => new Response('down', { status: 500, statusText: 'downstream' }));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Failed to download: downstream');
  });

  it('throws install error when response body is empty', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Empty body');
  });

  it('throws when tar extraction fails', async () => {
    const fetchSpy = vi.fn(async () => new Response('not-a-tar', { status: 200 }));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Tar exited with code');
  });

  it('throws when binary is not present after extraction', async () => {
    const tarPayload = await createTarPayload('curl impersonate', 0o644);
    const fetchSpy = vi.fn(async () => new Response(tarPayload));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Installation failed: Binary not found after extraction');
  });

  it('throws unsupported platform error for macOS', async () => {
    mockPlatform = 'darwin';
    await vi.resetModules();
    moduleInstance = await import('../../src/utils/binary-manager.js');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Auto-install not yet supported on macOS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws unsupported architecture error', async () => {
    mockArch = 'armv7l';
    await vi.resetModules();
    moduleInstance = await import('../../src/utils/binary-manager.js');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Unsupported platform: linux armv7l');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws unsupported platform error on Windows', async () => {
    mockPlatform = 'win32';
    await vi.resetModules();
    moduleInstance = await import('../../src/utils/binary-manager.js');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Auto-install not yet supported on Windows.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Timeout and edge cases
  // =========================================================================

  it('returns false when version check times out', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'sleep 5');
    process.env.RECKER_CURL_BIN = binaryPath;

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when timeout handler sees completed process code', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'sleep 5');
    process.env.RECKER_CURL_BIN = binaryPath;
    queueSpawnBehavior({ exitCodeAtStart: 0, events: [] });

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when spawn emits an error event', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'echo ok');
    process.env.RECKER_CURL_BIN = binaryPath;
    queueSpawnBehavior({
      events: [{ type: 'error', value: new Error('spawn failed') }],
    });

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when spawn exits after settling', async () => {
    const binaryPath = await createExecutableAt(packageBinDir(), 'sleep 5');
    process.env.RECKER_CURL_BIN = binaryPath;
    queueSpawnBehavior({
      exitCodeAtStart: 0,
      events: [
        { type: 'error', value: new Error('temporary') },
        { type: 'close', value: 0, delayMs: 10 },
      ],
    });

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });
});
