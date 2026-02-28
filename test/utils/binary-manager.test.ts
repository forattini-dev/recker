import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

type BinaryManagerModule = typeof import('../../src/utils/binary-manager.js');

let moduleInstance: BinaryManagerModule;
const originalFetch = global.fetch;

function createExecutable(content: string): Promise<string> {
  return writeFile(
    join(mockHomeDir, '.recker', 'bin', 'curl-impersonate-chrome'),
    `#!/bin/sh
${content}
`,
    { mode: 0o755 },
  ).then(() => join(mockHomeDir, '.recker', 'bin', 'curl-impersonate-chrome'));
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
    mockHomeDir = await mkdtemp(join(tmpdir(), 'recker-binary-manager-'));
    await mkdir(join(mockHomeDir, '.recker', 'bin'), { recursive: true });
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
    await rm(mockHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
    clearSpawnBehaviors();
  });

  it('detects curl-impersonate when binary exists and responds to --version', async () => {
    const binaryPath = await createExecutable('echo "curl-impersonate-ok"');
    process.env.RECKER_CURL_BIN = binaryPath;

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(true);
  });

  it('returns false when binary is not present', async () => {
    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when binary exits with non-zero version code', async () => {
    await createExecutable('exit 1');
    process.env.RECKER_CURL_BIN = join(mockHomeDir, '.recker', 'bin', 'curl-impersonate-chrome');

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('installs impersonate when download payload contains the binary', async () => {
    const archiveRoot = join(mockHomeDir, 'payload');
    await mkdir(archiveRoot, { recursive: true });

    const packedBinary = join(archiveRoot, 'curl-impersonate-chrome');
    await writeFile(packedBinary, '#!/bin/sh\necho 0.6.1');
    await execFileSync('chmod', ['+x', packedBinary]);

    const tarPath = join(archiveRoot, 'curl-impersonate.tar.gz');
    execFileSync('tar', ['-czf', tarPath, '-C', archiveRoot, 'curl-impersonate-chrome']);
    const tarPayload = await readFile(tarPath);

    const fetchSpy = vi.fn(async () => new Response(tarPayload));
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await moduleInstance.installCurlImpersonate(logger as unknown as Console);

    const installed = await moduleInstance.hasImpersonate();
    expect(installed).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('curl-impersonate-v0.6.1'));
    expect(await readFile(join(mockHomeDir, '.recker', 'bin', 'curl-impersonate-chrome'), 'utf8')).toContain('0.6.1');
  });

  it('installs curl-impersonate from ARM64 Linux artifact', async () => {
    mockArch = 'arm64';
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

  it('throws unsupported platform error for non-installable environments', async () => {
    mockPlatform = 'darwin';
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
    moduleInstance = await import('../../src/utils/binary-manager.js');
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const logger = { log: vi.fn() };
    await expect(moduleInstance.installCurlImpersonate(logger as unknown as Console))
      .rejects
      .toThrow('Auto-install not yet supported on Windows.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns false when version check times out', async () => {
    const binaryPath = await createExecutable('sleep 5');
    process.env.RECKER_CURL_BIN = binaryPath;

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when timeout handler sees completed process code', async () => {
    const binaryPath = await createExecutable('sleep 5');
    process.env.RECKER_CURL_BIN = binaryPath;
    queueSpawnBehavior({ exitCodeAtStart: 0, events: [] });

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when spawn emits an error event', async () => {
    const binaryPath = await createExecutable('echo ok');
    process.env.RECKER_CURL_BIN = binaryPath;
    queueSpawnBehavior({
      events: [{ type: 'error', value: new Error('spawn failed') }],
    });

    const available = await moduleInstance.hasImpersonate();

    expect(available).toBe(false);
  });

  it('returns false when spawn exits after settling', async () => {
    const binaryPath = await createExecutable('sleep 5');
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
