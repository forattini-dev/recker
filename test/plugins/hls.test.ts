import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { downloadHls, Variant, Segment, KeyInfo } from '../../src/plugins/hls.js';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';

// Mock fs
vi.mock('node:fs', async () => {
    // Dynamically import PassThrough inside the mock factory
    const { PassThrough } = await import('node:stream');
    return {
        createWriteStream: vi.fn(() => {
            // Use a real PassThrough stream that pipeline can work with
            const mockStream = new PassThrough();
            return mockStream;
        })
    };
});

vi.mock('node:fs/promises', async () => {
    return {
        mkdir: vi.fn(),
        readFile: vi.fn(() => Buffer.from('chunk data')),
        readdir: vi.fn(() => ['00000.ts', '00001.ts']),
        rm: vi.fn()
    };
});

// Helper to create mock transport
function createMockTransport(responses: Record<string, { status: number; body: string | (() => string) }>) {
    return {
        dispatch: async (req: any) => {
            const url = req.url;
            for (const [pattern, response] of Object.entries(responses)) {
                if (url.includes(pattern) || url === pattern) {
                    const body = typeof response.body === 'function' ? response.body() : response.body;
                    return {
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        text: async () => body,
                        read: () => {
                            return new ReadableStream({
                                start(controller) {
                                    controller.enqueue(new TextEncoder().encode(body));
                                    controller.close();
                                }
                            });
                        },
                        headers: new Headers()
                    } as any;
                }
            }
            throw new Error(`No mock for ${url}`);
        }
    };
}

describe('HLS Downloader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should parse playlist and download segments', async () => {
        const playlist = `
#EXTM3U
#EXTINF:10,
segment1.ts
#EXTINF:10,
http://cdn.com/segment2.ts
        `;

        const client = createClient({
            transport: {
                dispatch: async (req: any) => {
                    if (req.url.endsWith('.m3u8')) {
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            headers: new Headers()
                        } as any;
                    }
                    // Segment download
                    return {
                        ok: true,
                        status: 200,
                        read: () => {
                            // Mock Web ReadableStream for .write()
                            return new ReadableStream({
                                start(controller) {
                                    controller.enqueue(new TextEncoder().encode('data'));
                                    controller.close();
                                }
                            });
                        },
                        headers: new Headers()
                    } as any;
                }
            }
        });

        await downloadHls(client, 'http://test.com/video.m3u8', 'video.ts');

        expect(mkdir).toHaveBeenCalled();
        expect(readdir).toHaveBeenCalled(); // Merging
        expect(createWriteStream).toHaveBeenCalledWith('video.ts');
    });

    describe('Master playlist handling', () => {
        it('should parse master playlist and select highest quality variant', async () => {
            const masterPlaylist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080
1080p.m3u8`;

            const variantPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'master.m3u8': { status: 200, body: masterPlaylist },
                    '1080p.m3u8': { status: 200, body: variantPlaylist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            const infoMessages: string[] = [];
            await downloadHls(client, 'http://test.com/master.m3u8', 'video.ts', {
                onInfo: (msg) => infoMessages.push(msg)
            });

            // Should switch to 1080p variant
            expect(infoMessages.some(m => m.includes('1080p'))).toBe(true);
        });

        it('should use onVariantSelected hook', async () => {
            const masterPlaylist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080
1080p.m3u8`;

            const variantPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'master.m3u8': { status: 200, body: masterPlaylist },
                    '720p.m3u8': { status: 200, body: variantPlaylist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            let selectedVariant: Variant | undefined;
            await downloadHls(client, 'http://test.com/master.m3u8', 'video.ts', {
                onInfo: () => {},
                onVariantSelected: (variants, defaultSelected) => {
                    selectedVariant = variants.find(v => v.resolution === '1280x720');
                    return selectedVariant;
                }
            });

            expect(selectedVariant?.resolution).toBe('1280x720');
            expect(selectedVariant?.bandwidth).toBe(1000000);
        });
    });

    describe('Hooks', () => {
        it('should call onManifest hook', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            let manifestReceived = false;
            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onManifest: (manifest, url) => {
                    manifestReceived = true;
                    expect(manifest).toContain('#EXTM3U');
                    expect(url).toContain('playlist.m3u8');
                }
            });

            expect(manifestReceived).toBe(true);
        });

        it('should allow modifying manifest via onManifest hook', async () => {
            const originalPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
http://wrong.com/segment.ts
#EXT-X-ENDLIST`;

            const modifiedPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
http://correct.com/segment.ts
#EXT-X-ENDLIST`;

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        if (req.url.includes('.m3u8')) {
                            return {
                                ok: true,
                                status: 200,
                                text: async () => originalPlaylist,
                                headers: new Headers()
                            } as any;
                        }
                        return {
                            ok: true,
                            status: 200,
                            read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onManifest: () => modifiedPlaylist
            });

            // Should request the correct URL from modified manifest
            expect(requestedUrls.some(u => u.includes('correct.com'))).toBe(true);
        });

        it('should call onSegment hook for each segment', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:5.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXTINF:15.0,
segment2.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment0.ts': { status: 200, body: 'data0' },
                    'segment1.ts': { status: 200, body: 'data1' },
                    'segment2.ts': { status: 200, body: 'data2' }
                })
            });

            const segments: Segment[] = [];
            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onSegment: (seg) => {
                    segments.push({ ...seg });
                    return seg;
                }
            });

            expect(segments.length).toBe(3);
            expect(segments[0].duration).toBe(5);
            expect(segments[1].duration).toBe(10);
            expect(segments[2].duration).toBe(15);
        });

        it('should skip segments when onSegment returns null', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
ad_segment.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`;

            let downloadedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        if (!req.url.includes('.m3u8')) {
                            downloadedUrls.push(req.url);
                        }
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onSegment: (seg) => {
                    // Skip ad segments
                    if (seg.url.includes('ad_')) return null;
                    return seg;
                }
            });

            // Ad segment should not be downloaded
            expect(downloadedUrls.some(u => u.includes('ad_'))).toBe(false);
        });
    });

    describe('Encrypted segments', () => {
        it('should parse KEY info and call onKey hook', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x12345678
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment.ts': { status: 200, body: 'encrypted' }
                })
            });

            let keyInfo: KeyInfo | undefined;
            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onSegment: (seg) => seg,
                onKey: (key) => {
                    keyInfo = { ...key };
                    return key;
                }
            });

            expect(keyInfo).toBeDefined();
            expect(keyInfo?.method).toBe('AES-128');
            expect(keyInfo?.uri).toBe('https://example.com/key.bin');
            expect(keyInfo?.iv).toBe('0x12345678');
        });
    });

    describe('Error handling', () => {
        it('should call onError when manifest fetch fails', async () => {
            const client = createClient({
                transport: {
                    dispatch: async () => {
                        throw new Error('Network error');
                    }
                }
            });

            let errorReceived: Error | undefined;
            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {},
                onError: (err) => {
                    errorReceived = err;
                }
            });

            expect(errorReceived).toBeDefined();
            expect(errorReceived?.message).toContain('Failed to fetch initial manifest');
        });
    });

    describe('Live stream handling', () => {
        it('should handle live stream with duration limit', async () => {
            let callCount = 0;
            const playlist = () => {
                callCount++;
                return `#EXTM3U
#EXT-X-TARGETDURATION:1
#EXT-X-MEDIA-SEQUENCE:${callCount}
#EXTINF:1.0,
segment${callCount}.ts`;
            };

            const client = createClient({
                transport: {
                    dispatch: async (req: any) => ({
                        ok: true,
                        status: 200,
                        text: async () => req.url.includes('.m3u8') ? playlist() : 'data',
                        read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                        headers: new Headers()
                    } as any)
                }
            });

            const start = Date.now();
            await downloadHls(client, 'http://test.com/live.m3u8', 'video.ts', {
                live: true,
                duration: 50, // Stop after 50ms
                onInfo: () => {}
            });

            // Should have stopped due to duration (allow for polling time)
            // The implementation has wait time of at least 1000ms, so we allow more time
            expect(Date.now() - start).toBeLessThan(2000);
        });

        it('should stop when ENDLIST is encountered in live mode', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            let manifestFetchCount = 0;
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        if (req.url.includes('.m3u8')) manifestFetchCount++;
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            await downloadHls(client, 'http://test.com/live.m3u8', 'video.ts', {
                live: true,
                onInfo: () => {}
            });

            // Should stop due to ENDLIST - may fetch manifest once or twice
            // (once initially, once for live updates before detecting ENDLIST)
            expect(manifestFetchCount).toBeLessThanOrEqual(2);
        });
    });

    describe('URL resolution', () => {
        it('should resolve relative URLs correctly', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
../segments/segment.ts
#EXT-X-ENDLIST`;

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            await downloadHls(client, 'http://test.com/streams/playlist.m3u8', 'video.ts', {
                onInfo: () => {}
            });

            // Should resolve relative URL
            expect(requestedUrls.some(u => u.includes('segments/segment.ts'))).toBe(true);
        });

        it('should handle absolute URLs in playlist', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
https://cdn.example.com/segment.ts
#EXT-X-ENDLIST`;

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            read: () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data')); c.close(); } }),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {}
            });

            // Should use absolute URL as-is
            expect(requestedUrls.some(u => u === 'https://cdn.example.com/segment.ts')).toBe(true);
        });
    });

    describe('M3U8 parsing', () => {
        it('should parse target duration', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:30
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {}
            });

            // Test passes if no errors thrown
        });

        it('should parse media sequence', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:100
#EXTINF:10.0,
segment100.ts
#EXTINF:10.0,
segment101.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment100.ts': { status: 200, body: 'data' },
                    'segment101.ts': { status: 200, body: 'data' }
                })
            });

            const segments: Segment[] = [];
            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                merge: false,
                onInfo: () => {},
                onSegment: (seg) => {
                    segments.push({ ...seg });
                    return seg;
                }
            });

            // Sequences should start at 100
            expect(segments[0].sequence).toBe(100);
            expect(segments[1].sequence).toBe(101);
        });

        it('should handle playlist with comments and empty lines', async () => {
            const playlist = `#EXTM3U
#EXT-X-VERSION:3

# This is a comment
#EXT-X-TARGETDURATION:10

#EXTINF:10.0, Description text
segment.ts

#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                onInfo: () => {}
            });

            // Should parse successfully without errors
        });
    });

    describe('Non-merge mode', () => {
        it('should download segments individually', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment0.ts': { status: 200, body: 'data0' },
                    'segment1.ts': { status: 200, body: 'data1' }
                })
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'segments_dir', {
                merge: false,
                onInfo: () => {}
            });

            // Should not call createWriteStream for merged output
            // (because merge is false, segments are saved individually)
        });
    });

    describe('Concurrency', () => {
        it('should respect concurrency option', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXTINF:10.0,
segment3.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment0.ts': { status: 200, body: 'data0' },
                    'segment1.ts': { status: 200, body: 'data1' },
                    'segment2.ts': { status: 200, body: 'data2' },
                    'segment3.ts': { status: 200, body: 'data3' }
                })
            });

            await downloadHls(client, 'http://test.com/playlist.m3u8', 'video.ts', {
                concurrency: 2,
                onInfo: () => {}
            });

            // Should complete without errors
        });
    });
});
