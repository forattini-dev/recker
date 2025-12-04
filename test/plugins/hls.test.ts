import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest';
import { createClient, Client } from '../../src/core/client.js';
import { HlsPromise, hls, HlsOptions, HlsSegment, SegmentData } from '../../src/plugins/hls.js';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
                        blob: async () => new Blob([body]),
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

describe('HLS Plugin - Fluent API', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `hls-test-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch {}
    });

    describe('HlsPromise construction', () => {
        it('should create HlsPromise via client.hls()', () => {
            const client = createClient();
            const hlsPromise = client.hls('http://test.com/video.m3u8');

            expect(hlsPromise).toBeInstanceOf(HlsPromise);
        });

        it('should create HlsPromise via hls() factory', () => {
            const client = createClient();
            const hlsPromise = hls(client, 'http://test.com/video.m3u8');

            expect(hlsPromise).toBeInstanceOf(HlsPromise);
        });

        it('should throw when awaited directly without terminal method', async () => {
            const client = createClient();
            const hlsPromise = client.hls('http://test.com/video.m3u8');

            await expect(hlsPromise).rejects.toThrow('requires .download()');
        });

        it('should throw for non-ts formats (ffmpeg required)', () => {
            const client = createClient();

            expect(() => client.hls('http://test.com/video.m3u8', { format: 'mp4' }))
                .toThrow('requires ffmpeg');
        });
    });

    describe('VOD download', () => {
        it('should download simple VOD playlist', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST`;

            const downloadedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        downloadedUrls.push(req.url);
                        const body = req.url.includes('.m3u8') ? playlist : 'data';
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob([body]),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/playlist.m3u8').download(outputPath);

            // Verify segments were downloaded
            expect(downloadedUrls.some(u => u.includes('segment1.ts'))).toBe(true);
            expect(downloadedUrls.some(u => u.includes('segment2.ts'))).toBe(true);
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
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/playlist.m3u8').download(outputPath);

            expect(requestedUrls.some(u => u === 'https://cdn.example.com/segment.ts')).toBe(true);
        });

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
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/streams/playlist.m3u8').download(outputPath);

            expect(requestedUrls.some(u => u.includes('segments/segment.ts'))).toBe(true);
        });
    });

    describe('Master playlist handling', () => {
        it('should select highest quality variant by default', async () => {
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

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        const body = req.url.includes('master') ? masterPlaylist : variantPlaylist;
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/master.m3u8').download(outputPath);

            // Should have requested 1080p variant (highest bandwidth)
            expect(requestedUrls.some(u => u.includes('1080p.m3u8'))).toBe(true);
        });

        it('should select lowest quality with quality: "lowest"', async () => {
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

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        const body = req.url.includes('master') ? masterPlaylist : variantPlaylist;
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/master.m3u8', { quality: 'lowest' }).download(outputPath);

            expect(requestedUrls.some(u => u.includes('720p.m3u8'))).toBe(true);
        });

        it('should select by resolution', async () => {
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

            let requestedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        requestedUrls.push(req.url);
                        const body = req.url.includes('master') ? masterPlaylist : variantPlaylist;
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/master.m3u8', {
                quality: { resolution: '1280x720' }
            }).download(outputPath);

            expect(requestedUrls.some(u => u.includes('720p.m3u8'))).toBe(true);
        });
    });

    describe('Chunks mode', () => {
        it('should save segments separately with mode: "chunks"', async () => {
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
                    'segment100.ts': { status: 200, body: 'data0' },
                    'segment101.ts': { status: 200, body: 'data1' }
                })
            });

            const chunksDir = join(testDir, 'chunks');
            await client.hls('http://test.com/playlist.m3u8', { mode: 'chunks' })
                .download(chunksDir);

            const files = await readdir(chunksDir);
            expect(files.length).toBe(2);
            expect(files).toContain('segment-100.ts');
            expect(files).toContain('segment-101.ts');
        });

        it('should use custom naming function', async () => {
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

            await client.hls('http://test.com/playlist.m3u8', { mode: 'chunks' })
                .download((seg) => join(testDir, `part-${seg.sequence.toString().padStart(5, '0')}.ts`));

            const files = await readdir(testDir);
            expect(files).toContain('part-00000.ts');
        });
    });

    describe('Stream iterator', () => {
        it('should yield segments via stream()', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:5.0,
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

            const segments: SegmentData[] = [];
            for await (const seg of client.hls('http://test.com/playlist.m3u8').stream()) {
                segments.push(seg);
            }

            expect(segments.length).toBe(2);
            expect(segments[0].duration).toBe(5);
            expect(segments[1].duration).toBe(10);
            expect(segments[0].data).toBeInstanceOf(Uint8Array);
        });

        it('should call onSegment callback', async () => {
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

            const receivedSegments: SegmentData[] = [];
            for await (const _ of client.hls('http://test.com/playlist.m3u8', {
                onSegment: (seg) => { receivedSegments.push(seg); }
            }).stream()) {
                // consume
            }

            expect(receivedSegments.length).toBe(1);
        });
    });

    describe('Progress tracking', () => {
        it('should call onProgress callback', async () => {
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

            const progressUpdates: any[] = [];
            const outputPath = join(testDir, 'video.ts');

            await client.hls('http://test.com/playlist.m3u8', {
                onProgress: (p) => progressUpdates.push({ ...p })
            }).download(outputPath);

            expect(progressUpdates.length).toBe(2);
            expect(progressUpdates[0].downloadedSegments).toBe(1);
            expect(progressUpdates[1].downloadedSegments).toBe(2);
            expect(progressUpdates[1].totalSegments).toBe(2);
            expect(progressUpdates[1].isLive).toBe(false);
        });
    });

    describe('Live stream handling', () => {
        it('should continue polling in live mode until duration reached', async () => {
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
                        blob: async () => new Blob(['data']),
                        headers: new Headers()
                    } as any)
                }
            });

            const outputPath = join(testDir, 'live.ts');
            const start = Date.now();

            await client.hls('http://test.com/live.m3u8', {
                live: { duration: 100 }
            }).download(outputPath);

            // Should have taken at least some time but stopped due to duration
            expect(Date.now() - start).toBeLessThan(3000);
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
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'live.ts');
            await client.hls('http://test.com/live.m3u8', { live: true }).download(outputPath);

            // Should stop due to ENDLIST (may fetch manifest a few times: resolve, initial fetch, live check)
            expect(manifestFetchCount).toBeLessThanOrEqual(4);
        });

        it('should track seen segments and only download new ones', async () => {
            let callCount = 0;
            const playlist = () => {
                callCount++;
                // Simulate sliding window - always has 3 segments, but sequence advances
                const seq = callCount;
                return `#EXTM3U
#EXT-X-TARGETDURATION:1
#EXT-X-MEDIA-SEQUENCE:${seq}
#EXTINF:1.0,
segment${seq}.ts
#EXTINF:1.0,
segment${seq + 1}.ts
#EXTINF:1.0,
segment${seq + 2}.ts`;
            };

            const downloadedSegments: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        if (!req.url.includes('.m3u8')) {
                            downloadedSegments.push(req.url);
                        }
                        return {
                            ok: true,
                            status: 200,
                            text: async () => req.url.includes('.m3u8') ? playlist() : 'data',
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'live.ts');
            await client.hls('http://test.com/live.m3u8', {
                live: { duration: 50 }
            }).download(outputPath);

            // Should not have duplicate downloads
            const uniqueUrls = new Set(downloadedSegments);
            expect(uniqueUrls.size).toBe(downloadedSegments.length);
        });
    });

    describe('Info method', () => {
        it('should return playlist info without downloading', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist }
                })
            });

            const info = await client.hls('http://test.com/playlist.m3u8').info();

            expect(info.isLive).toBe(false);
            expect(info.totalDuration).toBe(30);
            expect(info.playlist?.segments.length).toBe(3);
        });

        it('should return master playlist info', async () => {
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
                transport: {
                    dispatch: async (req: any) => {
                        const body = req.url.includes('master') ? masterPlaylist : variantPlaylist;
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const info = await client.hls('http://test.com/master.m3u8').info();

            expect(info.master?.variants.length).toBe(2);
            expect(info.selectedVariant?.resolution).toBe('1920x1080');
            expect(info.isLive).toBe(false);
        });
    });

    describe('Cancel', () => {
        it('should cancel download via cancel()', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment.ts`;  // No ENDLIST = live

            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        // Simulate slow response
                        await new Promise(r => setTimeout(r, 100));
                        return {
                            ok: true,
                            status: 200,
                            text: async () => playlist,
                            blob: async () => new Blob(['data']),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const hlsDownload = client.hls('http://test.com/live.m3u8', { live: true });

            // Start download in background
            const downloadPromise = hlsDownload.download(join(testDir, 'video.ts'));

            // Cancel after a short delay
            setTimeout(() => hlsDownload.cancel(), 200);

            // Should complete (by cancellation) without hanging
            await downloadPromise;
        });
    });

    describe('Encrypted segments', () => {
        it('should throw for encrypted segments without ffmpeg', async () => {
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

            const outputPath = join(testDir, 'video.ts');
            await expect(client.hls('http://test.com/playlist.m3u8').download(outputPath))
                .rejects.toThrow('Encrypted HLS');
        });
    });

    describe('M3U8 parsing edge cases', () => {
        it('should parse playlist with comments and empty lines', async () => {
            const playlist = `#EXTM3U
#EXT-X-VERSION:3

# This is a comment
#EXT-X-TARGETDURATION:10

#EXTINF:10.0, Description text
segment.ts

#EXT-X-ENDLIST`;

            const downloadedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        downloadedUrls.push(req.url);
                        const body = req.url.includes('.m3u8') ? playlist : 'data';
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob([body]),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/playlist.m3u8').download(outputPath);

            // Should parse successfully and download segment
            expect(downloadedUrls.some(u => u.includes('segment.ts'))).toBe(true);
        });

        it('should handle discontinuity markers', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXT-X-DISCONTINUITY
#EXTINF:10.0,
segment1.ts
#EXT-X-ENDLIST`;

            const downloadedUrls: string[] = [];
            const client = createClient({
                transport: {
                    dispatch: async (req: any) => {
                        downloadedUrls.push(req.url);
                        const body = req.url.includes('.m3u8') ? playlist : 'data';
                        return {
                            ok: true,
                            status: 200,
                            text: async () => body,
                            blob: async () => new Blob([body]),
                            headers: new Headers()
                        } as any;
                    }
                }
            });

            const outputPath = join(testDir, 'video.ts');
            await client.hls('http://test.com/playlist.m3u8').download(outputPath);

            // Both segments should be downloaded despite discontinuity marker
            expect(downloadedUrls.some(u => u.includes('segment0.ts'))).toBe(true);
            expect(downloadedUrls.some(u => u.includes('segment1.ts'))).toBe(true);
        });

        it('should parse PROGRAM-DATE-TIME', async () => {
            const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-PROGRAM-DATE-TIME:2025-12-04T19:36:10.945+00:00
#EXTINF:10.0,
segment.ts
#EXT-X-ENDLIST`;

            const client = createClient({
                transport: createMockTransport({
                    'playlist.m3u8': { status: 200, body: playlist },
                    'segment.ts': { status: 200, body: 'data' }
                })
            });

            const info = await client.hls('http://test.com/playlist.m3u8').info();
            expect(info.playlist?.segments[0].programDateTime).toBeInstanceOf(Date);
        });
    });
});
